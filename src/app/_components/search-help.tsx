import { useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CircleHelp } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Show search guidance in a viewport-positioned tooltip opened by hover, focus
 * or press.
 *
 * Keep the tooltip reachable by pointer and dismiss it on Escape or an outside
 * press; preserve focus/press opening when the pointer leaves.
 */
export function SearchHelp() {
  const [openedBy, setOpenedBy] = useState<"hover" | "focus" | "press" | null>(
    null,
  );
  const open = openedBy !== null;
  const id = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  useLayoutEffect(() => {
    if (!open) return;

    /**
     * Place the tooltip near its trigger, clamping it horizontally and flipping
     * above when needed.
     */
    function position() {
      const trigger = triggerRef.current;
      const tooltip = tooltipRef.current;
      if (!trigger || !tooltip) return;
      const anchor = trigger.getBoundingClientRect();
      const bounds = tooltip.getBoundingClientRect();
      const gutter = 12;
      const gap = 8;
      const below = anchor.bottom + gap;
      tooltip.style.left = `${Math.max(gutter, Math.min(anchor.right - bounds.width, window.innerWidth - bounds.width - gutter))}px`;
      tooltip.style.top = `${below + bounds.height <= window.innerHeight - gutter ? below : Math.max(gutter, anchor.top - bounds.height - gap)}px`;
    }

    /** Close the tooltip when a pointer press occurs outside both tooltip and trigger. */
    function dismissOutside(event: globalThis.PointerEvent) {
      if (
        event.target instanceof Node &&
        !triggerRef.current?.contains(event.target) &&
        !tooltipRef.current?.contains(event.target)
      )
        setOpenedBy(null);
    }

    /** Close the search tooltip when Escape is pressed. */
    function dismissOnEscape(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") setOpenedBy(null);
    }

    position();
    window.addEventListener("resize", position);
    document.addEventListener("scroll", position, true);
    document.addEventListener("pointerdown", dismissOutside, true);
    document.addEventListener("keydown", dismissOnEscape);
    return () => {
      clearTimeout(closeTimer.current);
      window.removeEventListener("resize", position);
      document.removeEventListener("scroll", position, true);
      document.removeEventListener("pointerdown", dismissOutside, true);
      document.removeEventListener("keydown", dismissOnEscape);
    };
  }, [open]);

  /** Cancel pending dismissal and open on hover without replacing a focus or press opening. */
  function enter() {
    clearTimeout(closeTimer.current);
    setOpenedBy((previous) => previous ?? "hover");
  }

  /** Delay hover-only dismissal so the pointer can move from trigger to tooltip. */
  function leave() {
    closeTimer.current = setTimeout(() => {
      setOpenedBy((previous) => (previous === "hover" ? null : previous));
    }, 150);
  }

  return (
    <>
      <Button
        ref={triggerRef}
        type="button"
        size="icon"
        variant="ghost"
        aria-label="Aide pour la recherche"
        aria-describedby={open ? id : undefined}
        className="size-8 cursor-default rounded-full text-amber-900 not-disabled:hover:bg-amber-900/10"
        onPointerEnter={(event) => {
          if (event.pointerType !== "touch") enter();
        }}
        onPointerLeave={leave}
        onFocus={() => setOpenedBy("focus")}
        onBlur={() => setOpenedBy(null)}
        onClick={() =>
          setOpenedBy((previous) => (previous === "press" ? null : "press"))
        }
      >
        <CircleHelp aria-hidden="true" />
      </Button>
      {open &&
        createPortal(
          <div
            ref={tooltipRef}
            id={id}
            role="tooltip"
            onPointerEnter={enter}
            onPointerLeave={leave}
            className="fixed z-110 max-h-[calc(100dvh-1.5rem)] w-72 max-w-[calc(100vw-1.5rem)] overflow-y-auto rounded-lg border border-amber-900/20 bg-amber-50 p-3 text-xs leading-5 text-amber-950 shadow-md"
          >
            Pour rechercher plusieurs personnes, séparez les noms par un
            point-virgule : Jacques ; Madeleine. Les personnes correspondant à
            l’une des recherches sont mises en évidence.
          </div>,
          document.body,
        )}
    </>
  );
}
