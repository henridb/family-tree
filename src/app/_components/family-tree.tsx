"use client";

import { useRouter } from "next/navigation";
import {
  ChevronDown,
  SlidersHorizontal,
  ListTree,
  Network,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/trpc/react";
import { type person } from "@/types/family";
import { searchFamily } from "@/lib/family-search";
import { partnershipElementId } from "@/lib/family-identities";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { Xwrapper } from "react-xarrows";
import { Tree } from "../tree";
import { TreeViewport } from "./tree-viewport";

import { useMediaQuery } from "./use-media-query";
import { FamilyOutline } from "./family-outline";
import { SearchHelp } from "./search-help";
import { familyContexts, type FamilyContext } from "@/lib/family-context";

/**
 * Scale the diagram's typography, spacing and radii together without changing
 * its logical layout.
 */
function diagramStyle(scale: number): CSSProperties & {
  "--tree-scale": number;
  "--spacing": string;
  "--text-xs": string;
  "--radius": string;
} {
  return {
    fontSize: `${0.875 * scale}rem`,
    lineHeight: 1.428571,
    "--tree-scale": scale,
    "--spacing": `${0.25 * scale}rem`,
    "--text-xs": `${0.75 * scale}rem`,
    "--radius": `${0.625 * scale}rem`,
  };
}

/**
 * Load the authenticated descendant tree and coordinate search, display
 * settings and responsive views.
 *
 * Keep branch-collapse preferences while search temporarily expands matching
 * paths. Share person contexts and card widths across the diagram and compact
 * view, and redirect expired sessions to the viewing login.
 */
export function FamilyTree() {
  const isDesktop = useMediaQuery("(min-width: 64rem)");
  const isShortScreen = useMediaQuery("(max-height: 20rem)");
  const family = api.person.getTree.useQuery(undefined, { retry: false });

  const router = useRouter();
  useEffect(() => {
    if (family.error?.data?.code === "UNAUTHORIZED") router.replace("/login");
  }, [family.error, router]);
  const [displayOnlyMaidenSurname, setDisplayOnlyMaidenSurname] =
    useState(false);
  const [displaySurname, setDisplaySurname] = useState(true);
  const [displayBirthdate, setDisplayBirthdate] = useState(true);
  const [query, setQuery] = useState("");
  const [settingsPreference, setSettingsPreference] = useState<boolean>();
  const settingsOpen = settingsPreference ?? !isShortScreen;
  const [view, setView] = useState<"tree" | "list">("tree");
  const showList = !isDesktop && view === "list";
  const [collapsedBranches, setCollapsedBranches] = useState<
    ReadonlySet<string>
  >(() => new Set());
  /** Toggle one partnership's descendant visibility using a new set of permanent branch IDs. */
  function toggleBranch(ownerId: string, partnerId: string) {
    const id = partnershipElementId(ownerId, partnerId, "descendants");
    setCollapsedBranches((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  const search = useMemo(
    () => (family.data ? searchFamily(family.data, query) : undefined),
    [family.data, query],
  );

  const contexts = useMemo(
    () =>
      family.data
        ? familyContexts(family.data)
        : new Map<string, FamilyContext>(),
    [family.data],
  );

  const cardWidthEm = useMemo(() => {
    /**
     * Find the longest displayed given/birth-name combination across this
     * branch for shared card sizing.
     */
    function maxNameLength(person: person): number {
      const ownLength =
        person.name.length + (displaySurname ? 1 + person.surname.length : 0);
      return Math.max(
        ownLength,
        ...(person.partners ?? []).map((partner) =>
          Math.max(
            partner.name.length +
              (displaySurname ? 1 + partner.surname.length : 0),
            ...(partner.children ?? []).map(maxNameLength),
          ),
        ),
      );
    }
    return family.data ? maxNameLength(family.data) * 0.6 : 20;
  }, [family.data, displaySurname]);

  const treeStyle: CSSProperties & { "--card-width": string } = {
    "--card-width": `${cardWidthEm}em`,
  };

  if (family.isPending)
    return (
      <main role="status" className="p-10">
        Chargement de l’arbre…
      </main>
    );
  if (family.error)
    return (
      <main role="alert" className="p-10">
        {family.error.data?.code === "PRECONDITION_FAILED"
          ? "Cet arbre n’est pas encore configuré."
          : "Impossible de charger l’arbre."}{" "}
        <Button onClick={() => void family.refetch()}>Réessayer</Button>
      </main>
    );
  if (!family.data)
    return (
      <main role="status" className="p-10">
        Aucune personne de départ n’a encore été choisie pour cet arbre.
      </main>
    );

  const displayedTree = search?.tree ?? family.data;
  return (
    <>
      <main
        style={treeStyle}
        className="flex h-dvh w-full min-w-0 flex-col overflow-hidden text-sm"
      >
        <h1 className="sr-only">Arbre généalogique</h1>
        <Xwrapper>
          <TreeViewport
            view={showList ? "list" : "tree"}
            renderControls={(navigation) => (
              <div className="relative z-100 shrink-0 lg:fixed lg:top-0 lg:left-0 lg:w-[22.25rem]">
                <section
                  id="tree-controls"
                  aria-label="Options de l’arbre"
                  className="border-b border-amber-900/20 bg-[#eadfbd] shadow-sm lg:rounded-br-lg lg:border-r lg:border-amber-900/20 lg:bg-[#eadfbd]/95 lg:p-3 lg:backdrop-blur-xs"
                >
                  <div className="flex items-center lg:hidden">
                    <h2 className="min-w-0 flex-1">
                      <button
                        type="button"
                        aria-expanded={settingsOpen}
                        aria-controls="tree-settings"
                        onClick={() => setSettingsPreference(!settingsOpen)}
                        className="flex min-h-12 w-full cursor-pointer items-center gap-2 px-3 text-left text-xs font-semibold tracking-wide text-amber-950 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-amber-950"
                      >
                        <SlidersHorizontal
                          aria-hidden="true"
                          className="size-3.5"
                        />
                        Options de l’arbre
                        {!settingsOpen && search?.hasQuery && (
                          <span className="ml-auto rounded bg-amber-950/10 px-1.5 py-0.5 text-[10px] whitespace-nowrap">
                            Filtre actif
                          </span>
                        )}
                        <ChevronDown
                          aria-hidden="true"
                          className={`ml-auto size-4 shrink-0 transition-transform duration-200 ease-in-out motion-reduce:transition-none ${settingsOpen ? "rotate-180" : ""}`}
                        />
                      </button>
                    </h2>
                    <div
                      role="group"
                      aria-label="Vue de la famille"
                      className="flex gap-1 pr-2"
                    >
                      <Button
                        size="icon"
                        variant={view === "tree" ? "secondary" : "ghost"}
                        aria-label="Vue arbre"
                        aria-pressed={view === "tree"}
                        onClick={() => setView("tree")}
                        title="Vue arbre"
                      >
                        <Network aria-hidden="true" />
                      </Button>
                      <Button
                        size="icon"
                        variant={view === "list" ? "secondary" : "ghost"}
                        aria-label="Vue compacte"
                        aria-pressed={view === "list"}
                        onClick={() => setView("list")}
                        title="Vue compacte"
                      >
                        <ListTree aria-hidden="true" />
                      </Button>
                    </div>
                  </div>
                  <div
                    id="tree-settings"
                    inert={!settingsOpen && !isDesktop}
                    aria-hidden={!settingsOpen && !isDesktop ? true : undefined}
                    className={`grid transition-[grid-template-rows,opacity,visibility] duration-200 ease-in-out motion-reduce:transition-none lg:visible lg:grid-rows-[1fr] lg:opacity-100 lg:transition-none ${settingsOpen ? "visible grid-rows-[1fr] opacity-100" : "invisible grid-rows-[0fr] opacity-0"}`}
                  >
                    <div className="min-h-0 overflow-hidden">
                      <div className="space-y-3 px-3 pb-3 lg:space-y-2 lg:p-0">
                        <fieldset className="flex min-w-0 flex-wrap gap-x-6 gap-y-3 lg:flex-col lg:gap-0">
                          <legend className="sr-only">Affichage</legend>
                          <div className="flex max-w-full min-w-0 items-center gap-2 lg:h-7 lg:gap-1">
                            <Checkbox
                              id="surname-input"
                              onClick={(_) =>
                                setDisplaySurname(!displaySurname)
                              }
                              checked={displaySurname}
                            />
                            <Label htmlFor="surname-input">
                              Afficher le nom de famille
                            </Label>
                          </div>
                          <div className="flex max-w-full min-w-0 items-center gap-2 lg:h-7 lg:gap-1">
                            <Checkbox
                              id="maiden-input"
                              onClick={(_) =>
                                setDisplayOnlyMaidenSurname(
                                  !displayOnlyMaidenSurname,
                                )
                              }
                              checked={displayOnlyMaidenSurname}
                            />
                            <Label htmlFor="maiden-input">
                              N&apos;afficher que le nom de jeune fille
                            </Label>
                          </div>
                          <div className="flex max-w-full min-w-0 items-center gap-2 lg:h-7 lg:gap-1">
                            <Checkbox
                              id="birthdate-input"
                              onClick={(_) =>
                                setDisplayBirthdate(!displayBirthdate)
                              }
                              checked={displayBirthdate}
                            />
                            <Label htmlFor="birthdate-input">
                              Afficher l&apos;année de naissance
                            </Label>
                          </div>
                        </fieldset>
                        <div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-center sm:gap-2 lg:gap-2">
                          <Label htmlFor="query-input">Recherche:</Label>
                          <div className="flex min-w-0 items-center gap-1 sm:max-w-md sm:flex-1">
                            <Input
                              className="h-9 min-w-0 border-amber-900/20 bg-white/60 lg:h-8"
                              type="text"
                              id="query-input"
                              value={query}
                              onChange={(e) => setQuery(e.target.value)}
                            />
                            <SearchHelp />
                          </div>
                        </div>
                      </div>
                      <div className="px-3 pb-3 lg:mt-3 lg:p-0">
                        {navigation}
                      </div>
                    </div>
                  </div>
                </section>
                <div
                  className={
                    search?.hasQuery
                      ? "mx-3 flex items-start gap-3 rounded-b-lg border border-t-0 border-amber-900/20 bg-[#f4ecd5] px-3 py-2 text-amber-950 shadow-sm"
                      : undefined
                  }
                >
                  <p
                    role="status"
                    aria-atomic="true"
                    className={
                      search?.hasQuery
                        ? "min-w-0 flex-1 text-xs leading-5"
                        : "sr-only"
                    }
                  >
                    {search?.hasQuery ? (
                      search.matchCount === 0 ? (
                        "Aucune personne trouvée."
                      ) : (
                        <>
                          {`${search.matchCount} personne${search.matchCount > 1 ? "s" : ""} trouvée${search.matchCount > 1 ? "s" : ""} et entourée${search.matchCount > 1 ? "s" : ""}`}
                          {". "}
                          <span id="tree-search-branches-help">
                            Branches dépliées pendant la recherche.
                          </span>
                        </>
                      )
                    ) : (
                      ""
                    )}
                  </p>
                  {search?.hasQuery && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="border-amber-900/20 bg-white/60 text-xs not-disabled:hover:bg-amber-900/10"
                      onClick={() => setQuery("")}
                    >
                      Effacer
                    </Button>
                  )}
                </div>
              </div>
            )}
            onExpandAll={() => setCollapsedBranches(new Set())}
            onToggleBranch={toggleBranch}
            hasCollapsed={collapsedBranches.size > 0}
            hasTree={!search?.hasQuery || search.matchCount > 0}
          >
            {(scale, onCardKeyDown, onToggleBranch) =>
              showList ? (
                <FamilyOutline
                  contexts={contexts}
                  collapsedBranches={collapsedBranches}
                  onToggleBranch={onToggleBranch}
                  tree={displayedTree}
                  searchActive={search?.hasQuery ?? false}
                  empty={Boolean(search?.hasQuery && search.matchCount === 0)}
                  displaySurname={displaySurname}
                  displayOnlyMaidenSurname={displayOnlyMaidenSurname}
                  displayBirthdate={displayBirthdate}
                />
              ) : (
                <div
                  style={diagramStyle(scale)}
                  className="relative isolate min-h-full w-max min-w-full p-10 lg:flex lg:items-center lg:justify-center"
                >
                  {search?.hasQuery && search.matchCount === 0 ? (
                    <p className="max-w-xs text-center text-amber-950">
                      Essayez un autre prénom ou nom de famille.
                    </p>
                  ) : (
                    <Tree
                      contexts={contexts}
                      person={displayedTree}
                      isRoot
                      searchActive={search?.hasQuery}
                      scale={scale}
                      onCardKeyDown={onCardKeyDown}
                      collapsedBranches={collapsedBranches}
                      onToggleBranch={onToggleBranch}
                      displayOnlyMaidenSurname={displayOnlyMaidenSurname}
                      displaySurname={displaySurname}
                      displayBirthdate={displayBirthdate}
                    />
                  )}
                </div>
              )
            }
          </TreeViewport>
        </Xwrapper>
      </main>
    </>
  );
}
