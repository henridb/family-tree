import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import { useXarrow } from "react-xarrows";
import { Button } from "@/components/ui/button";
import { personElementId } from "@/lib/family-identities";
import { useMousePan } from "@/hooks/use-mouse-pan";
import { useTreeZoom } from "@/hooks/use-tree-zoom";

/**
 * Provide scrolling, navigation controls and diagram gestures around the chosen
 * family view.
 *
 * Preserve independent diagram/list scroll positions, keep a visible branch
 * owner anchored during collapse, and pass scale and card-navigation handlers
 * to the rendered content. Panning and zoom gestures are active only for a
 * nonempty diagram.
 */
export function TreeViewport({
  children,
  renderControls,
  view = "tree",
  onExpandAll,
  onToggleBranch,
  hasCollapsed = false,
  hasTree = true,
}: {
  children: (
    scale: number,
    onCardKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void,
    onToggleBranch: (
      ownerId: string,
      partnerId: string,
      event: MouseEvent<HTMLButtonElement>,
    ) => void,
  ) => ReactNode;
  renderControls: (navigation: ReactNode) => ReactNode;
  view?: "tree" | "list";
  onExpandAll: () => void;
  onToggleBranch: (ownerId: string, partnerId: string) => void;
  hasCollapsed?: boolean;
  hasTree?: boolean;
}) {
  // Recalculate connectors after display settings change the tree's layout.
  useXarrow();
  const viewportRef = useRef<HTMLDivElement>(null);
  const isDiagram = view === "tree";
  const { isPanning, ...panHandlers } = useMousePan(hasTree && isDiagram);
  const { scale, zoom, fit } = useTreeZoom(viewportRef, hasTree && isDiagram);
  const previousView = useRef(view);
  const scrollPositions = useRef({
    tree: { left: 0, top: 0 },
    list: { left: 0, top: 0 },
  });
  const [branchAnchor, setBranchAnchor] = useState<{
    id: string;
    x: number;
    y: number;
  } | null>(null);

  /**
   * Scroll to the first-generation partnership midpoint, falling back to the
   * root card, without changing zoom.
   */
  const centerRoot = useCallback(() => {
    const viewport = viewportRef.current;
    const root = viewport?.querySelector<HTMLElement>("[data-root-person]");
    if (!viewport || !root) return;
    const target =
      root
        .closest(".parents")
        ?.querySelector<HTMLElement>(":scope > .parent-link") ?? root;
    const bounds = viewport.getBoundingClientRect(),
      targetBounds = target.getBoundingClientRect();
    viewport.scrollTo({
      left:
        viewport.scrollLeft +
        targetBounds.left -
        bounds.left -
        viewport.clientLeft +
        targetBounds.width / 2 -
        viewport.clientWidth / 2,
      top: 0,
      behavior: "instant",
    });
  }, []);

  useLayoutEffect(() => {
    centerRoot();
  }, [centerRoot]);

  useLayoutEffect(() => {
    if (previousView.current === view) return;
    previousView.current = view;
    viewportRef.current?.scrollTo({
      ...scrollPositions.current[view],
      behavior: "instant",
    });
  }, [view]);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    const anchor = branchAnchor;
    if (!viewport || !anchor) return;
    const card = viewport.querySelector<HTMLElement>(
      `#${personElementId(anchor.id)}`,
    );
    if (!card) return;
    const bounds = viewport.getBoundingClientRect();
    const cardBounds = card.getBoundingClientRect();
    viewport.scrollTo({
      left:
        viewport.scrollLeft +
        cardBounds.left +
        cardBounds.width / 2 -
        bounds.left -
        anchor.x,
      top:
        viewport.scrollTop +
        cardBounds.top +
        cardBounds.height / 2 -
        bounds.top -
        anchor.y,
      behavior: "instant",
    });
  }, [branchAnchor]);

  /**
   * Capture the visible owner's viewport position before toggling descendants
   * so layout changes can preserve it.
   */
  function toggleBranch(
    id: string,
    partnerId: string,
    event: MouseEvent<HTMLButtonElement>,
  ) {
    const viewport = event.currentTarget.closest<HTMLElement>("#tree-viewport");
    const card = viewport?.querySelector<HTMLElement>(
      `#${personElementId(id)}`,
    );
    let anchor: typeof branchAnchor = null;
    if (viewport && card) {
      const bounds = viewport.getBoundingClientRect();
      const cardBounds = card.getBoundingClientRect();
      if (
        cardBounds.right > bounds.left &&
        cardBounds.left < bounds.right &&
        cardBounds.bottom > bounds.top &&
        cardBounds.top < bounds.bottom
      ) {
        anchor = {
          id,
          x: cardBounds.left + cardBounds.width / 2 - bounds.left,
          y: cardBounds.top + cardBounds.height / 2 - bounds.top,
        };
      }
    }
    setBranchAnchor(anchor);
    onToggleBranch(id, partnerId);
  }

  /**
   * Move keyboard focus among visible person cards using directional geometry.
   *
   * Home selects the root, End selects the last visible card, and arrow keys
   * prefer nearby cards in that direction. Scroll the chosen card into view
   * without activating its details dialog.
   */
  const navigate = useCallback((event: KeyboardEvent<HTMLButtonElement>) => {
    const current =
      event.target instanceof HTMLElement
        ? event.target.closest<HTMLElement>("[data-person-id]")
        : null;
    if (
      !current ||
      ![
        "ArrowLeft",
        "ArrowRight",
        "ArrowUp",
        "ArrowDown",
        "Home",
        "End",
      ].includes(event.key)
    )
      return;
    const viewport = current.closest<HTMLElement>("#tree-viewport");
    if (!viewport) return;
    const cards = Array.from(
      viewport.querySelectorAll<HTMLElement>("[data-person-id]"),
    ).filter((card) => card.getClientRects().length > 0);
    let target: HTMLElement | undefined;
    if (event.key === "Home")
      target = cards.find((card) => card.hasAttribute("data-root-person"));
    else if (event.key === "End") target = cards.at(-1);
    else {
      const bounds = current.getBoundingClientRect(),
        x = bounds.left + bounds.width / 2,
        y = bounds.top + bounds.height / 2;
      const candidates = cards
        .filter((card) => card !== current)
        .map((card) => {
          const r = card.getBoundingClientRect(),
            dx = r.left + r.width / 2 - x,
            dy = r.top + r.height / 2 - y;
          const horizontal =
            event.key === "ArrowLeft" || event.key === "ArrowRight";
          const primary = horizontal ? dx : dy,
            cross = horizontal ? dy : dx;
          const sign =
            event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1;
          return {
            card,
            valid:
              primary * sign >
              Math.max(1, (horizontal ? bounds.width : bounds.height) / 2),
            distance: Math.abs(primary) + Math.abs(cross) * 3,
          };
        })
        .filter((candidate) => candidate.valid)
        .sort((a, b) => a.distance - b.distance);
      target = candidates[0]?.card;
    }
    event.preventDefault();
    target?.focus({ preventScroll: true });
    target?.scrollIntoView({
      block: "center",
      inline: "center",
      behavior: "instant",
    });
  }, []);

  const navigation = (
    <div
      className="flex flex-wrap items-center gap-2 border-t border-amber-900/20 pt-3"
      aria-label="Commandes de navigation"
      role="group"
    >
      {isDiagram && (
        <div
          role="group"
          aria-label="Zoom"
          className="inline-flex divide-x divide-amber-900/20 rounded-md border border-amber-900/20 bg-white/60"
        >
          <Button
            size="sm"
            variant="ghost"
            className="h-9 w-9 rounded-none rounded-l-md px-0 text-base text-amber-950 not-disabled:hover:bg-amber-900/10 focus-visible:relative focus-visible:z-10 lg:h-8 lg:w-8"
            onClick={() => zoom(scale / 1.25)}
            disabled={!hasTree || scale <= 0.005}
            aria-label="Réduire le zoom"
          >
            −
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-9 w-18 rounded-none px-1 text-xs text-amber-950 tabular-nums not-disabled:hover:bg-amber-900/10 focus-visible:relative focus-visible:z-10 lg:h-8"
            onClick={() => zoom(1)}
            disabled={!hasTree}
            aria-label="Rétablir le zoom à 100 %"
          >
            {(scale * 100).toLocaleString("fr", { maximumFractionDigits: 1 })} %
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-9 w-9 rounded-none rounded-r-md px-0 text-base text-amber-950 not-disabled:hover:bg-amber-900/10 focus-visible:relative focus-visible:z-10 lg:h-8 lg:w-8"
            onClick={() => zoom(scale * 1.25)}
            disabled={!hasTree || scale >= 2}
            aria-label="Augmenter le zoom"
          >
            +
          </Button>
        </div>
      )}
      <div
        className={`grid min-w-56 flex-1 gap-1 ${isDiagram ? "grid-cols-3" : "grid-cols-2"}`}
      >
        {isDiagram && (
          <Button
            size="sm"
            variant="ghost"
            className="h-9 px-2 text-xs text-amber-950 not-disabled:hover:bg-amber-900/10 lg:h-8"
            onClick={fit}
            disabled={!hasTree}
          >
            Tout voir
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          className="h-9 px-2 text-xs text-amber-950 not-disabled:hover:bg-amber-900/10 lg:h-8"
          onClick={centerRoot}
          disabled={!hasTree}
        >
          Recentrer
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-9 px-2 text-xs text-amber-950 not-disabled:hover:bg-amber-900/10 lg:h-8"
          onClick={onExpandAll}
          disabled={!hasCollapsed}
        >
          Tout déplier
        </Button>
      </div>
    </div>
  );

  return (
    <section
      aria-label="Navigation de la famille"
      className="flex min-h-0 min-w-0 flex-1 flex-col"
    >
      {renderControls(navigation)}
      {isDiagram && (
        <p id="tree-navigation-help" className="sr-only">
          Utilisez les flèches pour passer d’une fiche à l’autre, Début pour
          revenir à la racine et Fin pour atteindre la dernière fiche. Entrée
          ouvre les détails.
        </p>
      )}
      <div
        ref={viewportRef}
        id="tree-viewport"
        role="region"
        aria-label={isDiagram ? "Arbre généalogique" : "Arbre familial compact"}
        aria-describedby={isDiagram ? "tree-navigation-help" : undefined}
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- Keyboard users need to focus this scrollable region to pan it.
        tabIndex={0}
        style={{
          touchAction: hasTree && isDiagram ? "pan-x pan-y" : "auto",
          // Keep list reflow at the desktop breakpoint from replacing its saved position.
          overflowAnchor: isDiagram ? undefined : "none",
        }}
        onScroll={(event) => {
          scrollPositions.current[view] = {
            left: event.currentTarget.scrollLeft,
            top: event.currentTarget.scrollTop,
          };
        }}
        {...panHandlers}
        className={`min-h-0 min-w-0 flex-1 overflow-auto overscroll-contain focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-slate-800 ${isPanning ? "cursor-grabbing select-none [&_*]:cursor-grabbing" : hasTree && isDiagram ? "cursor-grab" : ""}`}
      >
        {children(scale, navigate, toggleBranch)}
      </div>
    </section>
  );
}
