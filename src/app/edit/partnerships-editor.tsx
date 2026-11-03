"use client";
import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import type {
  FamilyDocumentInput,
  FamilyPartnershipInput,
} from "@/lib/family-document";
import {
  fieldStyle,
  selectStyle,
  personLabel,
  personOptions,
  newId,
  move,
} from "./editor-fields";
/**
 * Edit ordered unions and their child links in a bounded, single-open
 * accordion.
 *
 * Keep relationship edits in the parent draft, preserve people when links or
 * unions are removed, and scroll a newly opened off-screen heading into view.
 * Parent validation decides whether the resulting document can be saved.
 */
export function PartnershipsEditor({
  draft,
  update,
}: {
  draft: FamilyDocumentInput;
  update: (document: FamilyDocumentInput) => void;
}) {
  const [expandedUnionId, setExpandedUnionId] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const list = listRef.current;
    const heading = list?.querySelector<HTMLElement>('[aria-expanded="true"]');
    if (!list || !heading) return;
    const listBounds = list.getBoundingClientRect();
    const headingBounds = heading.getBoundingClientRect();
    const top = listBounds.top + list.clientTop;
    if (
      headingBounds.top < top ||
      headingBounds.bottom > top + list.clientHeight
    )
      list.scrollTop += headingBounds.top - top;
  }, [expandedUnionId]);
  const names = new Map(draft.people.map((p) => [p.id, personLabel(p)]));
  /** Replace one union by permanent ID in a copied partnership array. */
  function updatePartnership(value: FamilyPartnershipInput) {
    update({
      ...draft,
      partnerships: draft.partnerships.map((p) =>
        p.id === value.id ? value : p,
      ),
    });
  }
  return (
    <section className="space-y-4 rounded-xl border border-amber-900/20 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">
          Unions ({draft.partnerships.length})
        </h2>
        <Button
          variant="outline"
          disabled={draft.people.length < 2}
          onClick={() => {
            const first = draft.people[0]!;
            const second = draft.people[1]!;
            const id = newId("u");
            update({
              ...draft,
              partnerships: [
                ...draft.partnerships,
                {
                  id,
                  personIds: [first.id, second.id],
                  childIds: [],
                  divorced: false,
                },
              ],
            });
            setExpandedUnionId(id);
          }}
        >
          Ajouter une union
        </Button>
      </div>
      <p className="text-sm">
        L’ordre des unions détermine l’ordre des partenaires. Chaque union
        possède sa propre liste d’enfants. Supprimer une union conserve toutes
        ses personnes.
      </p>
      <div
        ref={listRef}
        className="max-h-[min(36rem,70dvh)] space-y-4 overflow-y-auto"
      >
        {draft.partnerships.map((union, index) => {
          const expanded = expandedUnionId === union.id;
          const headingId = `union-${union.id}-heading`;
          const panelId = `union-${union.id}-panel`;
          return (
            <div
              key={union.id}
              className="rounded-lg border border-amber-900/20"
            >
              <h3>
                <button
                  type="button"
                  id={headingId}
                  aria-expanded={expanded}
                  aria-controls={panelId}
                  onClick={() =>
                    setExpandedUnionId((current) =>
                      current === union.id ? null : union.id,
                    )
                  }
                  className="flex min-h-12 w-full cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-2 text-left font-medium hover:bg-amber-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-amber-900"
                >
                  <span>
                    {names.get(union.personIds[0])} et{" "}
                    {names.get(union.personIds[1])}
                  </span>
                  <ChevronDown
                    aria-hidden="true"
                    className={`size-4 shrink-0 transition-transform motion-reduce:transition-none ${expanded ? "rotate-180" : ""}`}
                  />
                </button>
              </h3>
              <div
                id={panelId}
                role="region"
                aria-labelledby={headingId}
                hidden={!expanded}
                className="space-y-3 border-t border-amber-900/15 p-3"
              >
                {expanded && (
                  <>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {([0, 1] as const).map((position) => (
                        <label className={fieldStyle} key={position}>
                          Partenaire {position + 1}
                          <select
                            className={selectStyle}
                            value={union.personIds[position]}
                            onChange={(e) => {
                              const ids: [string, string] = [
                                ...union.personIds,
                              ];
                              ids[position] = e.target.value;
                              updatePartnership({ ...union, personIds: ids });
                            }}
                          >
                            {personOptions(draft.people)}
                          </select>
                        </label>
                      ))}
                    </div>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={union.divorced ?? false}
                        onChange={(e) =>
                          updatePartnership({
                            ...union,
                            divorced: e.target.checked,
                          })
                        }
                      />
                      Union signalée comme divorcée
                    </label>
                    <ol className="space-y-2" aria-label="Enfants dans l’ordre">
                      {union.childIds.map((id, childIndex) => (
                        <li
                          key={id}
                          className="flex flex-wrap items-center gap-2"
                        >
                          <span className="mr-auto">{names.get(id)}</span>
                          <Button
                            variant="outline"
                            aria-label={`Monter ${names.get(id)}`}
                            disabled={childIndex === 0}
                            onClick={() =>
                              updatePartnership({
                                ...union,
                                childIds: move(union.childIds, childIndex, -1),
                              })
                            }
                          >
                            ↑
                          </Button>
                          <Button
                            variant="outline"
                            aria-label={`Descendre ${names.get(id)}`}
                            disabled={childIndex === union.childIds.length - 1}
                            onClick={() =>
                              updatePartnership({
                                ...union,
                                childIds: move(union.childIds, childIndex, 1),
                              })
                            }
                          >
                            ↓
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() =>
                              updatePartnership({
                                ...union,
                                childIds: union.childIds.filter(
                                  (child) => child !== id,
                                ),
                              })
                            }
                          >
                            Retirer le lien
                          </Button>
                        </li>
                      ))}
                    </ol>
                    <label className={fieldStyle}>
                      Ajouter un enfant à cette union
                      <select
                        className={selectStyle}
                        value=""
                        onChange={(e) => {
                          if (e.target.value)
                            updatePartnership({
                              ...union,
                              childIds: [...union.childIds, e.target.value],
                            });
                        }}
                      >
                        <option value="">Choisir une personne existante</option>
                        {personOptions(
                          draft.people.filter(
                            (p) =>
                              !union.personIds.includes(p.id) &&
                              !draft.partnerships.some((u) =>
                                u.childIds.includes(p.id),
                              ),
                          ),
                        )}
                      </select>
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        disabled={index === 0}
                        onClick={() =>
                          update({
                            ...draft,
                            partnerships: move(draft.partnerships, index, -1),
                          })
                        }
                      >
                        Monter l’union
                      </Button>
                      <Button
                        variant="outline"
                        disabled={index === draft.partnerships.length - 1}
                        onClick={() =>
                          update({
                            ...draft,
                            partnerships: move(draft.partnerships, index, 1),
                          })
                        }
                      >
                        Descendre l’union
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => {
                          if (
                            window.confirm(
                              "Supprimer cette union ? Ses personnes seront conservées.",
                            )
                          ) {
                            update({
                              ...draft,
                              partnerships: draft.partnerships.filter(
                                (p) => p.id !== union.id,
                              ),
                            });
                            setExpandedUnionId(null);
                          }
                        }}
                      >
                        Supprimer l’union
                      </Button>
                    </div>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
