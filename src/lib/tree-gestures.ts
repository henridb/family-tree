export type GesturePoint = { x: number; y: number };

/**
 * Convert a wheel delta into a zoom multiplier, normalizing pixel, line and
 * page units.
 *
 * Positive deltas zoom out; clamp each event to a factor between 1/1.25 and
 * 1.25 so large wheel steps remain manageable.
 */
export function wheelZoomFactor(
  delta: number,
  mode: number,
  pageHeight: number,
): number {
  const pixels = delta * (mode === 1 ? 16 : mode === 2 ? pageHeight : 1);
  const step = Math.log(1.25);
  return Math.exp(Math.max(-step, Math.min(step, -pixels * 0.01)));
}

/**
 * Return the distance and midpoint between two gesture contacts in the same
 * coordinate space.
 */
export function pinchGeometry(first: GesturePoint, second: GesturePoint) {
  return {
    distance: Math.hypot(second.x - first.x, second.y - first.y),
    point: { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 },
  };
}
