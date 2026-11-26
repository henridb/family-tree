import { Button } from "@/components/ui/button";
import { currentPartner, type FamilyContext } from "@/lib/family-context";
import { partnershipElementId } from "@/lib/family-identities";
import type { person } from "@/types/family";
import { useTranslations } from "next-intl";
import type { MouseEvent } from "react";
import { PersonCard } from "../tree";

type OutlineOptions = {
  contexts: ReadonlyMap<string, FamilyContext>;
  collapsedBranches: ReadonlySet<string>;
  searchActive: boolean;
  onToggleBranch: (
    ownerId: string,
    partnerId: string,
    event: MouseEvent<HTMLButtonElement>,
  ) => void;
  displaySurname: boolean;
  displayOnlyMaidenSurname: boolean;
  displayBirthdate: boolean;
};

/**
 * Render the compact family view, grouping children under their parental unions
 * and handling an empty search.
 */
export function FamilyOutline({
  tree,
  empty,
  ...options
}: OutlineOptions & { tree: person; empty: boolean }) {
  const t = useTranslations("viewer");
  return (
    <section className="px-3 py-4">
      <h2 className="text-base font-semibold text-amber-950">
        {t("outlineTitle")}
      </h2>
      <p className="mt-1 mb-4 text-xs leading-5 text-amber-900">
        {t("outlineIntro")}
      </p>
      {empty ? (
        <p>{t("tryNames")}</p>
      ) : (
        <ol>
          <OutlinePerson person={tree} isRoot {...options} />
        </ol>
      )}
    </section>
  );
}

/**
 * Recursively render a compact person and their partner branches.
 *
 * Use the shared person contexts and display preferences; keep collapsed
 * descendants mounted and temporarily show matching branches during search.
 */
function OutlinePerson({
  person,
  isRoot = false,
  ...options
}: OutlineOptions & { person: person; isRoot?: boolean }) {
  const t = useTranslations("person");
  const viewer = useTranslations("viewer");
  const spouse = currentPartner(person);
  const cardOptions = {
    compact: true,
    displaySurname: options.displaySurname,
    displayOnlyMaidenSurname: options.displayOnlyMaidenSurname,
    displayBirthdate: options.displayBirthdate,
  };
  const partners = person.partners?.filter(
    (partner) =>
      !options.searchActive ||
      partner.match === true ||
      Boolean(partner.children?.length),
  );
  return (
    <li className="relative min-w-0" data-outline-person={person.id}>
      <PersonCard
        {...cardOptions}
        person={person}
        isRoot={isRoot}
        context={options.contexts.get(person.id)!}
        partnerName={spouse?.name}
        partnerSurname={spouse?.surname}
      />
      {Boolean(partners?.length) && (
        <ol
          aria-label={t("unions", {
            name: `${person.name} ${person.surname}`,
          })}
          className="mt-1 space-y-2"
        >
          {partners?.map((partner) => {
            const branchId = partnershipElementId(
              person.id,
              partner.id,
              "descendants",
            );
            const collapsed =
              !options.searchActive && options.collapsedBranches.has(branchId);
            const hasChildren = Boolean(partner.children?.length);
            return (
              <li key={partner.id} data-outline-partnership={branchId}>
                <div className="flex min-w-0 items-start gap-1.5">
                  <span className="w-3 shrink-0 rotate-180 self-center text-[11px] leading-none whitespace-nowrap text-amber-900 [writing-mode:vertical-rl]">
                    {partner.divorced ? viewer("previous") : viewer("with")}
                  </span>
                  <div className="min-w-0 flex-1">
                    <PersonCard
                      {...cardOptions}
                      person={partner}
                      context={options.contexts.get(partner.id)!}
                      partnerName={partner.divorced ? undefined : person.name}
                      partnerSurname={
                        partner.divorced ? undefined : person.surname
                      }
                    />
                  </div>
                  {hasChildren && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="mt-1 size-8 rounded-full border border-amber-900/25 bg-white/50 text-amber-950 not-disabled:hover:bg-amber-900/10"
                      disabled={options.searchActive}
                      aria-describedby={
                        options.searchActive
                          ? "tree-search-branches-help"
                          : undefined
                      }
                      aria-expanded={!collapsed}
                      aria-controls={branchId}
                      aria-label={t(
                        collapsed ? "showDescendants" : "hideDescendants",
                        {
                          first: `${person.name} ${person.surname}`,
                          second: `${partner.name} ${partner.surname}`,
                        },
                      )}
                      onClick={(event) =>
                        options.onToggleBranch(person.id, partner.id, event)
                      }
                    >
                      {collapsed ? "+" : "−"}
                    </Button>
                  )}
                </div>
                {hasChildren && (
                  <ol
                    id={branchId}
                    hidden={collapsed}
                    aria-label={t("children", {
                      first: person.name,
                      second: partner.name,
                    })}
                    className="outline-children mt-2 ml-2 space-y-2 pl-3"
                  >
                    {partner.children?.map((child) => (
                      <OutlinePerson
                        key={child.id}
                        person={child}
                        {...options}
                      />
                    ))}
                  </ol>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </li>
  );
}
