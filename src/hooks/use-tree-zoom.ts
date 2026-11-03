import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import { clampTreeScale, fitTreeScale } from "../lib/tree-scale";
import {
  pinchGeometry,
  wheelZoomFactor,
  type GesturePoint,
} from "../lib/tree-gestures";

type ZoomAnchor = { id: string; x: number; y: number };
type ZoomSession = { anchor: ZoomAnchor; scale: number; point: GesturePoint };
type ZoomView = {
  scale: number;
  anchor?: ZoomAnchor;
  point?: GesturePoint;
  fit?: boolean;
};

/**
 * Manage bounded diagram scale with centered controls, fit-to-view, Ctrl+wheel
 * and two-contact pinch gestures.
 *
 * Anchor zoom to a person card or the root and adjust scrolling after layout to
 * keep that point under the gesture. When disabled, remove gesture listeners;
 * zoom and fit controls remain available to the caller. Suppress accidental
 * pointer clicks after pinching.
 */
export function useTreeZoom(
  viewportRef: RefObject<HTMLDivElement | null>,
  enabled: boolean,
) {
  const [view, setView] = useState<ZoomView>({ scale: 1 });
  const renderedScale = useRef(1);
  const wheel = useRef<(ZoomSession & { time: number }) | null>(null);

  /**
   * Record the gesture's relative position within the hit person card, falling
   * back to the root.
   */
  const capture = useCallback(
    (point: GesturePoint): ZoomAnchor | undefined => {
      const viewport = viewportRef.current;
      if (!viewport) return;
      const hit = viewport.ownerDocument.elementFromPoint(point.x, point.y);
      const card = hit?.closest<HTMLElement>("[data-person-id]");
      const element =
        card && viewport.contains(card)
          ? card
          : viewport.querySelector<HTMLElement>("#tree_root");
      if (!element) return;
      const bounds = element.getBoundingClientRect();
      if (!bounds.width || !bounds.height) return;
      return {
        id: element.id,
        x: (point.x - bounds.left) / bounds.width,
        y: (point.y - bounds.top) / bounds.height,
      };
    },
    [viewportRef],
  );

  useLayoutEffect(() => {
    renderedScale.current = view.scale;
    const viewport = viewportRef.current;
    if (!viewport) return;
    if (view.fit) {
      viewport.scrollTo({ left: 0, top: 0, behavior: "instant" });
      return;
    }
    if (!view.anchor || !view.point) return;
    const element = viewport.querySelector<HTMLElement>(`#${view.anchor.id}`);
    if (!element) return;
    const bounds = element.getBoundingClientRect();
    viewport.scrollTo({
      left:
        viewport.scrollLeft +
        bounds.left +
        bounds.width * view.anchor.x -
        view.point.x,
      top:
        viewport.scrollTop +
        bounds.top +
        bounds.height * view.anchor.y -
        view.point.y,
      behavior: "instant",
    });
  }, [view, viewportRef]);

  /**
   * Clamp a requested scale and keep the current viewport center anchored while
   * applying it.
   */
  function zoom(nextScale: number) {
    const viewport = viewportRef.current;
    const next = clampTreeScale(nextScale);
    if (!viewport) return;
    const bounds = viewport.getBoundingClientRect();
    const point = {
      x: bounds.left + viewport.clientLeft + viewport.clientWidth / 2,
      y: bounds.top + viewport.clientTop + viewport.clientHeight / 2,
    };
    const anchor = capture(point);
    if (!anchor) return;
    wheel.current = null;
    setView({ scale: next, anchor, point });
  }

  /**
   * Measure the diagram and canvas padding, choose a fitting scale and reset
   * scrolling after layout.
   */
  function fit() {
    const viewport = viewportRef.current;
    const tree = viewport?.querySelector<HTMLElement>("#tree_root");
    const canvas = tree?.parentElement;
    if (!viewport || !tree || !canvas) return;
    const bounds = tree.getBoundingClientRect();
    const style = getComputedStyle(canvas);
    const width =
      (Math.max(bounds.width, tree.scrollWidth) +
        parseFloat(style.paddingLeft) +
        parseFloat(style.paddingRight)) /
      renderedScale.current;
    const height =
      (Math.max(bounds.height, tree.scrollHeight) +
        parseFloat(style.paddingTop) +
        parseFloat(style.paddingBottom)) /
      renderedScale.current;
    wheel.current = null;
    setView({
      scale: fitTreeScale(
        width,
        height,
        Math.max(1, viewport.clientWidth - 8),
        Math.max(1, viewport.clientHeight - 8),
      ),
      fit: true,
    });
  }

  useEffect(() => {
    const element = viewportRef.current;
    if (!element || !enabled) return;
    const viewport = element;
    let pinch: (ZoomSession & { distance: number; ids: number[] }) | null =
      null;
    let touchCount = 0;
    let suppressClick = false;

    /**
     * Update a gesture session and rendered view only when its bounded scale or
     * target point changes.
     */
    function apply(session: ZoomSession, factor: number, point: GesturePoint) {
      const next = clampTreeScale(session.scale * factor);
      if (
        next === session.scale &&
        point.x === session.point.x &&
        point.y === session.point.y
      )
        return;
      session.scale = next;
      session.point = point;
      setView({ scale: session.scale, anchor: session.anchor, point });
    }

    /**
     * Handle cancelable Ctrl+wheel events with bounded zoom steps around the
     * pointer.
     *
     * Reuse a short-lived session while renders catch up, recapturing its
     * anchor when the pointer moves or a new gesture starts.
     */
    function onWheel(event: WheelEvent) {
      if (!event.ctrlKey || !event.cancelable) return;
      const point = { x: event.clientX, y: event.clientY };
      let session = wheel.current;
      const expired = !session || event.timeStamp - session.time > 180;
      if (
        expired ||
        (session &&
          (renderedScale.current === session.scale ||
            Math.hypot(point.x - session.point.x, point.y - session.point.y) >
              1))
      ) {
        const anchor = capture(point);
        if (!anchor) return;
        session = {
          anchor,
          scale: !expired && session ? session.scale : renderedScale.current,
          point,
          time: event.timeStamp,
        };
        wheel.current = session;
      }
      if (!session) return;
      event.preventDefault();
      session.time = event.timeStamp;
      apply(
        session,
        wheelZoomFactor(event.deltaY, event.deltaMode, viewport.clientHeight),
        point,
      );
    }

    /** Return active touches whose original targets belong to this viewport. */
    function contacts(event: TouchEvent) {
      return Array.from(event.touches).filter(
        (touch) =>
          touch.target instanceof Node && viewport.contains(touch.target),
      );
    }

    /**
     * Start or update a two-contact pinch using its midpoint and incremental
     * distance ratio.
     *
     * Track contact identities so replacement fingers start a new anchor,
     * cancel native handling when possible, and suppress the synthetic click
     * after a pinch.
     */
    function onTouch(event: TouchEvent) {
      const touches = contacts(event);
      if (event.type === "touchstart" && touchCount === 0)
        suppressClick = false;
      touchCount = touches.length;
      if (touches.length !== 2) {
        pinch = null;
        return;
      }
      const first = touches[0]!;
      const second = touches[1]!;
      const geometry = pinchGeometry(
        { x: first.clientX, y: first.clientY },
        { x: second.clientX, y: second.clientY },
      );
      if (!geometry.distance) return;
      // Native scrolling can make later moves non-cancelable. The viewport's
      // touch-action already excludes browser pinch zoom in that case.
      if (event.cancelable) event.preventDefault();
      suppressClick = true;
      wheel.current = null;
      if (
        !pinch ||
        !pinch.ids.includes(first.identifier) ||
        !pinch.ids.includes(second.identifier)
      ) {
        const anchor = capture(geometry.point);
        if (!anchor) return;
        pinch = {
          anchor,
          scale: renderedScale.current,
          point: geometry.point,
          distance: geometry.distance,
          ids: [first.identifier, second.identifier],
        };
      } else if (event.type === "touchmove") {
        apply(pinch, geometry.distance / pinch.distance, geometry.point);
        pinch.distance = geometry.distance;
      }
    }

    /** Update the remaining contact count and clear the active pinch session. */
    function onTouchEnd(event: TouchEvent) {
      touchCount = contacts(event).length;
      pinch = null;
    }

    /** Clear pinch and contact state after the browser cancels a touch gesture. */
    function onCancel() {
      pinch = null;
      touchCount = 0;
    }

    /**
     * Suppress pointer-generated clicks following a pinch while preserving
     * keyboard activation.
     */
    function onClick(event: MouseEvent) {
      if (suppressClick && event.detail > 0) {
        event.preventDefault();
        event.stopPropagation();
      }
    }

    /** Allow normal clicks again when a new mouse interaction begins. */
    function onPointerDown(event: PointerEvent) {
      if (event.pointerType === "mouse") suppressClick = false;
    }

    viewport.addEventListener("wheel", onWheel, { passive: false });
    viewport.addEventListener("touchstart", onTouch, { passive: false });
    viewport.addEventListener("touchmove", onTouch, { passive: false });
    viewport.addEventListener("touchend", onTouchEnd, { passive: true });
    viewport.addEventListener("touchcancel", onCancel);
    viewport.addEventListener("click", onClick, true);
    viewport.addEventListener("pointerdown", onPointerDown);
    return () => {
      wheel.current = null;
      viewport.removeEventListener("wheel", onWheel);
      viewport.removeEventListener("touchstart", onTouch);
      viewport.removeEventListener("touchmove", onTouch);
      viewport.removeEventListener("touchend", onTouchEnd);
      viewport.removeEventListener("touchcancel", onCancel);
      viewport.removeEventListener("click", onClick, true);
      viewport.removeEventListener("pointerdown", onPointerDown);
    };
  }, [capture, enabled, viewportRef]);

  return { scale: view.scale, zoom, fit };
}
