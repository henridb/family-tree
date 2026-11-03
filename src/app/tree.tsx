import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

import { memo, type KeyboardEvent, type MouseEvent } from "react";
import { PartnershipConnectors } from "./_components/partnership-connectors";
import { SearchMatchText } from "./_components/search-match-text";
import { type human, type person } from "@/types/family";
import {
  currentPartner,
  generationLabel,
  type FamilyContext,
} from "@/lib/family-context";
import { formatBirthDate, formatBirthYear } from "@/lib/format-birth-date";
import { personElementId, partnershipElementId } from "@/lib/family-identities";

/**
 * Recursively lay out a descendant branch with partner cards, child groups and
 * connectors.
 *
 * Expect a viewer-compatible tree and matching person contexts. Use permanent
 * IDs for connector anchors and collapse regions; search temporarily ignores
 * saved collapse choices while retaining them for later.
 */
export function Tree({
  person,
  isRoot,
  searchActive = false,
  scale,
  contexts,
  connectorsVisible = true,
  collapsedBranches,
  onToggleBranch,
  onCardKeyDown,
  displayOnlyMaidenSurname = false,
  displaySurname = true,
  displayBirthdate = true,
}: {
  person: person;
  isRoot: boolean;
  searchActive?: boolean;
  scale: number;
  contexts: ReadonlyMap<string, FamilyContext>;
  connectorsVisible?: boolean;
  collapsedBranches: ReadonlySet<string>;
  onToggleBranch: (
    ownerId: string,
    partnerId: string,
    event: MouseEvent<HTMLButtonElement>,
  ) => void;
  onCardKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
  displayOnlyMaidenSurname: boolean;
  displaySurname: boolean;
  displayBirthdate: boolean;
}) {
  // idea: options to show ascendance and/or descendence, for now I only focus on ascendence
  // idea: instead of pruning the tree, one could highlight the path from the
  // searched person to self (this means having an option to mark self !) if
  // coloring the edges is too difficult, we could consider coloring only the
  // nodes
  // idea: birthday calendar vue ?

  const Node = isRoot ? "div" : "li";
  /**
   * Check the saved collapse choice for a partnership, treating every branch as
   * expanded during search.
   */
  function isCollapsed(partnerId: string): boolean {
    return (
      !searchActive &&
      collapsedBranches.has(
        partnershipElementId(person.id, partnerId, "descendants"),
      )
    );
  }
  const hasExpandedChildren = person.partners?.some(
    (partner) => Boolean(partner.children?.length) && !isCollapsed(partner.id),
  );
  return (
    <Node
      className="node relative flex flex-col"
      id={isRoot ? "tree_root" : undefined}
    >
      <div className="parents relative flex flex-row items-center justify-center">
        {person.partners?.length === 2 &&
          (!searchActive ||
            Boolean(person.partners.at(1)!.children?.length) ||
            person.partners.at(1)!.match === true) && (
            <>
              <PersonCard
                person={person.partners.at(1)!}
                partnerName={
                  person.partners.at(1)?.divorced ? undefined : person.name
                }
                partnerSurname={
                  person.partners.at(1)?.divorced ? undefined : person.surname
                }
                onCardKeyDown={onCardKeyDown}
                context={contexts.get(person.partners.at(1)!.id)!}
                displayOnlyMaidenSurname={displayOnlyMaidenSurname}
                displaySurname={displaySurname}
                displayBirthdate={displayBirthdate}
              />
              <hr
                className="parent-link shrink-0 border-none bg-black"
                data-side="left"
                id={partnershipElementId(
                  person.id,
                  person.partners.at(1)!.id,
                  "parents",
                )}
              />
            </>
          )}
        <PersonCard
          person={person}
          isRoot={isRoot}
          partnerName={currentPartner(person)?.name}
          partnerSurname={currentPartner(person)?.surname}
          onCardKeyDown={onCardKeyDown}
          context={contexts.get(person.id)!}
          displayOnlyMaidenSurname={displayOnlyMaidenSurname}
          displaySurname={displaySurname}
          displayBirthdate={displayBirthdate}
        />
        {person.partners &&
          person.partners.length >= 1 &&
          (!searchActive ||
            Boolean(person.partners.at(0)!.children?.length) ||
            person.partners.at(0)!.match === true) && (
            <>
              <hr
                className="parent-link shrink-0 border-none bg-black"
                data-side="right"
                id={partnershipElementId(
                  person.id,
                  person.partners.at(0)!.id,
                  "parents",
                )}
              />
              <PersonCard
                person={person.partners.at(0)!}
                partnerName={
                  person.partners.at(0)?.divorced ? undefined : person.name
                }
                partnerSurname={
                  person.partners.at(0)?.divorced ? undefined : person.surname
                }
                onCardKeyDown={onCardKeyDown}
                context={contexts.get(person.partners.at(0)!.id)!}
                displayOnlyMaidenSurname={displayOnlyMaidenSurname}
                displaySurname={displaySurname}
                displayBirthdate={displayBirthdate}
              />
            </>
          )}
        {person.partners?.map((partner, index) =>
          partner.children?.length ? (
            <button
              key={partner.id}
              type="button"
              data-side={index === 0 ? "right" : "left"}
              disabled={searchActive}
              aria-describedby={
                searchActive ? "tree-search-branches-help" : undefined
              }
              aria-expanded={!isCollapsed(partner.id)}
              aria-controls={partnershipElementId(
                person.id,
                partner.id,
                "descendants",
              )}
              aria-label={`${isCollapsed(partner.id) ? "Afficher" : "Masquer"} les descendants de ${person.name} ${person.surname} et ${partner.name} ${partner.surname}`}
              onClick={(event) => onToggleBranch(person.id, partner.id, event)}
              className="branch-toggle absolute top-1/2 left-1/2 z-100 flex size-6 -translate-x-1/2 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-amber-50 font-semibold text-amber-950 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isCollapsed(partner.id) ? "+" : "−"}
            </button>
          ) : null,
        )}
      </div>
      <div
        className={`kids flex justify-center gap-20 ${hasExpandedChildren ? "mt-10" : ""}`}
      >
        {person.partners
          ?.slice()
          .reverse()
          .map(
            (partner) =>
              partner.children &&
              partner.children.length !== 0 && (
                <div
                  key={partner.id}
                  id={partnershipElementId(
                    person.id,
                    partner.id,
                    "descendants",
                  )}
                  hidden={isCollapsed(partner.id)}
                  className={`relative flex-col ${isCollapsed(partner.id) ? "hidden" : "flex"}`}
                >
                  <ol
                    id={partnershipElementId(person.id, partner.id, "children")}
                    className="flex flex-row justify-around gap-5"
                  >
                    {partner.children.map((kid) => (
                      <Tree
                        key={kid.id}
                        person={kid}
                        isRoot={false}
                        searchActive={searchActive}
                        scale={scale}
                        collapsedBranches={collapsedBranches}
                        onToggleBranch={onToggleBranch}
                        onCardKeyDown={onCardKeyDown}
                        contexts={contexts}
                        connectorsVisible={
                          connectorsVisible && !isCollapsed(partner.id)
                        }
                        displayOnlyMaidenSurname={displayOnlyMaidenSurname}
                        displaySurname={displaySurname}
                        displayBirthdate={displayBirthdate}
                      />
                    ))}
                  </ol>
                  {connectorsVisible && !isCollapsed(partner.id) && (
                    <PartnershipConnectors
                      start={partnershipElementId(
                        person.id,
                        partner.id,
                        "parents",
                      )}
                      row={partnershipElementId(
                        person.id,
                        partner.id,
                        "children",
                      )}
                      scale={scale}
                      displaySurname={displaySurname}
                      displayOnlyMaidenSurname={displayOnlyMaidenSurname}
                      displayBirthdate={displayBirthdate}
                    >
                      {partner.children}
                    </PartnershipConnectors>
                  )}
                </div>
              ),
          )}
      </div>
    </Node>
  );
}

/**
 * Render a memoized person card that opens details and the path through
 * previous generations.
 *
 * Apply the chosen name/date display settings and original-text search
 * highlights. Support the same details dialog in diagram and compact layouts,
 * with optional keyboard navigation supplied by the viewport.
 */
export const PersonCard = memo(function PersonCard({
  person,
  isRoot = false,
  context,
  compact = false,
  onCardKeyDown,
  partnerName,
  partnerSurname,
  displaySurname,
  displayOnlyMaidenSurname,
  displayBirthdate,
}: {
  person: human;
  isRoot?: boolean;
  context: FamilyContext;
  compact?: boolean;
  onCardKeyDown?: (event: KeyboardEvent<HTMLButtonElement>) => void;
  partnerName?: string;
  partnerSurname?: string;
  displaySurname: boolean;
  displayOnlyMaidenSurname: boolean;
  displayBirthdate: boolean;
}) {
  const generation = context.generation;
  const description = generationLabel(context);
  const previousGenerations = context.path.slice(0, -1);
  const onlyMaidenSurname =
    displayOnlyMaidenSurname || partnerSurname === undefined;
  const surname =
    person.sex === "male" || onlyMaidenSurname
      ? person.surname
      : partnerSurname;
  const highlights = person.searchHighlights;
  const surnameMatches =
    person.sex === "male" || onlyMaidenSurname
      ? highlights?.surname
      : highlights?.marriedSurname;
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Card
          asChild
          className={`person-card relative flex cursor-pointer flex-col gap-0 break-words transition-colors hover:bg-amber-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-900 ${compact ? "w-full min-w-0 items-start rounded-lg px-3 py-2 text-left shadow-none" : "h-full w-(--card-width) items-center text-center"} ${generation % 2 === 0 ? "bg-amber-50" : "bg-white"}`}
        >
          <button
            type="button"
            id={personElementId(person.id)}
            onKeyDown={onCardKeyDown}
            data-person-id={person.id}
            data-generation={generation}
            data-root-person={isRoot || undefined}
            data-search-match={person.match ? true : undefined}
            className={person.match ? "ring-2 ring-amber-700" : undefined}
          >
            {!compact && (
              <span
                aria-hidden="true"
                title={description}
                className="absolute top-1 right-2 rounded bg-amber-100 px-1 text-[0.65em] text-amber-900"
              >
                Gén. {generation + 1}
              </span>
            )}
            <span className="sr-only">
              {person.match && "Résultat de recherche. "}Voir la fiche de{" "}
            </span>
            <span
              className={
                compact
                  ? "w-full min-w-0 text-sm font-medium wrap-anywhere"
                  : undefined
              }
            >
              <SearchMatchText text={person.name} ranges={highlights?.name} />{" "}
              {displaySurname && (
                <SearchMatchText text={surname} ranges={surnameMatches} />
              )}
              {person.dead && "†"}
              <span className="sr-only">. {description}.</span>
            </span>
            {(!compact ||
              (displaySurname &&
                !onlyMaidenSurname &&
                person.sex === "female")) && (
              <span className="text-xs italic">
                {displaySurname && !onlyMaidenSurname ? (
                  person.sex === "female" ? (
                    <>
                      {"(née "}
                      <SearchMatchText
                        text={person.surname}
                        ranges={highlights?.surname}
                      />
                      {")"}
                    </>
                  ) : (
                    "\xa0"
                  )
                ) : (
                  ""
                )}
              </span>
            )}
            <span
              className={
                compact
                  ? "mt-1 flex w-full flex-wrap items-center justify-between gap-x-2 text-xs text-amber-900"
                  : undefined
              }
            >
              <span>
                {displayBirthdate ? formatBirthYear(person.birthdate) : ""}
              </span>
              {compact && (
                <span
                  aria-hidden="true"
                  title={description}
                  className="rounded bg-amber-100 px-1 text-[10px] text-amber-900"
                >
                  Gén. {generation + 1}
                </span>
              )}
            </span>
          </button>
        </Card>
      </DialogTrigger>
      <DialogContent aria-describedby={undefined} className="w-fit gap-2">
        <DialogTitle className="pr-6">
          <SearchMatchText text={person.name} ranges={highlights?.name} />{" "}
          <SearchMatchText text={surname} ranges={surnameMatches} />
        </DialogTitle>
        <p className="text-xs text-amber-900">{description}</p>
        <div className="person-details">
          <span>Nom{person.sex === "female" && " de jeune fille"}:</span>
          <span>
            <SearchMatchText
              text={person.surname}
              ranges={highlights?.surname}
            />
          </span>
          <span>Prénom:</span>
          <span>
            <SearchMatchText text={person.name} ranges={highlights?.name} />
          </span>
          <span>Date de naissance:</span>{" "}
          <span>{formatBirthDate(person.birthdate)}</span>
          {partnerName && partnerSurname && (
            <>
              <span>{person.sex === "male" ? "Femme" : "Mari"}:</span>{" "}
              <span>
                {partnerName} {partnerSurname}
              </span>
            </>
          )}
        </div>
        {previousGenerations.length > 0 && (
          <section className="mt-2 min-w-0 border-t border-amber-900/15 pt-3">
            <h3 className="text-sm font-semibold text-amber-950">
              Générations précédentes
            </h3>
            <ol className="mt-2 list-decimal space-y-2 pl-5 text-xs leading-5 wrap-anywhere text-amber-900">
              {previousGenerations.map((step) => (
                <li key={step.person.id}>
                  {step.person.name} {step.person.surname}
                  {step.partner && (
                    <>
                      {" et "}
                      {step.partner.name} {step.partner.surname}
                    </>
                  )}
                </li>
              ))}
            </ol>
          </section>
        )}
      </DialogContent>
    </Dialog>
  );
});
