import { useRef, useState, type PointerEvent } from "react";

/**
 * Provide pointer handlers and a panning flag for dragging a scrollable diagram
 * with the primary mouse button.
 *
 * Start only on unmodified, noninteractive viewport content, excluding portal
 * content and scrollbars. Capture the pointer and require a small movement
 * threshold before panning; releasing or losing it ends the gesture.
 */
export function useMousePan(enabled: boolean) {
  const drag = useRef<{
    pointerId: number;
    x: number;
    y: number;
    left: number;
    top: number;
    active: boolean;
  } | null>(null);
  const [isPanning, setIsPanning] = useState(false);

  /** Clear the matching drag session and release pointer capture if still held. */
  function end(event: PointerEvent<HTMLDivElement>) {
    if (drag.current?.pointerId !== event.pointerId) return;
    drag.current = null;
    setIsPanning(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  /**
   * Capture an eligible mouse press and remember the viewport's initial pointer
   * and scroll positions.
   */
  function begin(event: PointerEvent<HTMLDivElement>) {
    if (
      !enabled ||
      event.pointerType !== "mouse" ||
      event.button !== 0 ||
      !event.isPrimary ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey ||
      event.shiftKey ||
      !(event.target instanceof Element) ||
      // React portal events bubble here even when the dialog is outside the viewport DOM.
      !event.currentTarget.contains(event.target) ||
      event.target.closest(
        "button, a, input, select, textarea, [contenteditable], [role='button']",
      )
    )
      return;

    const viewport = event.currentTarget;
    const bounds = viewport.getBoundingClientRect();
    if (
      event.clientX < bounds.left + viewport.clientLeft ||
      event.clientX >=
        bounds.left + viewport.clientLeft + viewport.clientWidth ||
      event.clientY < bounds.top + viewport.clientTop ||
      event.clientY >= bounds.top + viewport.clientTop + viewport.clientHeight
    )
      return;

    event.preventDefault();
    viewport.focus({ preventScroll: true });
    viewport.setPointerCapture(event.pointerId);
    drag.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      left: viewport.scrollLeft,
      top: viewport.scrollTop,
      active: false,
    };
  }

  /**
   * Pan from the initial drag position after the movement threshold, ending
   * when disabled or the button is released.
   */
  function move(event: PointerEvent<HTMLDivElement>) {
    const start = drag.current;
    if (start?.pointerId !== event.pointerId) return;
    if (!enabled || (event.buttons & 1) === 0) {
      end(event);
      return;
    }
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (!start.active) {
      if (Math.hypot(dx, dy) < 4) return;
      start.active = true;
      setIsPanning(true);
    }
    event.preventDefault();
    event.currentTarget.scrollTo({
      left: start.left - dx,
      top: start.top - dy,
      behavior: "instant",
    });
  }

  return {
    isPanning,
    onPointerDown: begin,
    onPointerMove: move,
    onPointerUp: end,
    onPointerCancel: end,
    onLostPointerCapture: end,
  };
}
