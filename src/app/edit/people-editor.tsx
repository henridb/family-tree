"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type {
  FamilyDocumentInput,
  FamilyPersonInput,
} from "@/lib/family-document";
import { fieldStyle, selectStyle, personLabel, newId } from "./editor-fields";
import { BirthDateField } from "./birth-date-field";
/**
 * Filter, create and edit people in the parent draft, including people not yet
 * connected to a union.
 *
 * Keep permanent IDs stable and surface date-validation markers supplied by the
 * parent. Allow deletion only after relationship references are removed,
 * clearing the selected root when that person is deleted.
 */
export function PeopleEditor({
  draft,
  update,
  invalidBirthdates,
}: {
  draft: FamilyDocumentInput;
  update: (document: FamilyDocumentInput) => void;
  invalidBirthdates: ReadonlySet<string>;
}) {
  const [selectedPerson, setSelectedPerson] = useState<string>();
  const [filter, setFilter] = useState("");
  const person = draft.people.find((p) => p.id === selectedPerson);
  const linked = new Set(
    draft.partnerships.flatMap((p) => [...p.personIds, ...p.childIds]),
  );
  /** Replace one person by permanent ID in a copied people array. */
  function updatePerson(value: FamilyPersonInput) {
    update({
      ...draft,
      people: draft.people.map((p) => (p.id === value.id ? value : p)),
    });
  }
  return (
    <section className="space-y-4 rounded-xl border border-amber-900/20 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">
          Personnes ({draft.people.length})
        </h2>
        <Button
          variant="outline"
          onClick={() => {
            const value: FamilyPersonInput = {
              id: newId("p"),
              name: "",
              surname: "",
              sex: "male",
              dead: false,
            };
            update({ ...draft, people: [...draft.people, value] });
            setSelectedPerson(value.id);
          }}
        >
          Ajouter une personne
        </Button>
      </div>
      <label className={fieldStyle} htmlFor="people-filter">
        Filtrer les personnes
        <Input
          type="search"
          id="people-filter"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </label>
      <div className="grid gap-4 md:grid-cols-2">
        <ul
          className="max-h-80 space-y-1 overflow-auto"
          aria-label="Personnes de la famille"
        >
          {draft.people
            .filter((p) =>
              personLabel(p)
                .toLocaleLowerCase()
                .includes(filter.toLocaleLowerCase()),
            )
            .map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => setSelectedPerson(p.id)}
                  aria-pressed={person?.id === p.id}
                  className={`w-full rounded border p-2 text-left ${person?.id === p.id ? "border-amber-800 bg-amber-100" : "border-amber-900/15"}`}
                >
                  {personLabel(p)}
                  {p.birthdate &&
                    !invalidBirthdates.has(p.id) &&
                    ` (${p.birthdate})`}
                  {invalidBirthdates.has(p.id) && (
                    <span className="ml-2 text-xs text-red-800">
                      Date invalide
                    </span>
                  )}
                  {!linked.has(p.id) && (
                    <span className="ml-2 text-xs">Sans lien</span>
                  )}
                </button>
              </li>
            ))}
        </ul>
        {person ? (
          <div className="space-y-3" aria-label="Fiche de la personne">
            <label className={fieldStyle} htmlFor="person-name">
              Prénom
              <Input
                id="person-name"
                value={person.name}
                onChange={(e) =>
                  updatePerson({ ...person, name: e.target.value })
                }
              />
            </label>
            <label className={fieldStyle} htmlFor="person-surname">
              Nom de naissance
              <Input
                id="person-surname"
                value={person.surname}
                onChange={(e) =>
                  updatePerson({ ...person, surname: e.target.value })
                }
              />
            </label>
            <label className={fieldStyle}>
              Sexe
              <select
                className={selectStyle}
                value={person.sex}
                onChange={(e) =>
                  updatePerson({
                    ...person,
                    sex: e.target.value as FamilyPersonInput["sex"],
                  })
                }
              >
                <option value="male">Masculin</option>
                <option value="female">Féminin</option>
              </select>
            </label>
            <BirthDateField
              key={person.id}
              value={person.birthdate ?? ""}
              invalid={invalidBirthdates.has(person.id)}
              onChange={(birthdate) => {
                const value = { ...person };
                if (birthdate) value.birthdate = birthdate;
                else delete value.birthdate;
                updatePerson(value);
              }}
            />
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={person.dead ?? false}
                onChange={(e) =>
                  updatePerson({ ...person, dead: e.target.checked })
                }
              />
              Personne signalée comme décédée
            </label>
            <Button
              variant="outline"
              disabled={linked.has(person.id)}
              onClick={() => {
                if (window.confirm("Supprimer cette personne du brouillon ?")) {
                  update({
                    ...draft,
                    rootPersonId:
                      draft.rootPersonId === person.id
                        ? null
                        : draft.rootPersonId,
                    people: draft.people.filter((p) => p.id !== person.id),
                  });
                  setSelectedPerson(undefined);
                }
              }}
            >
              Supprimer cette personne
            </Button>
            {linked.has(person.id) && (
              <p className="text-xs">
                Retirez d’abord cette personne de ses unions et de ses liens de
                filiation pour la supprimer.
              </p>
            )}
          </div>
        ) : (
          <p className="text-sm">
            Sélectionnez une personne pour modifier sa fiche.
          </p>
        )}
      </div>
    </section>
  );
}
