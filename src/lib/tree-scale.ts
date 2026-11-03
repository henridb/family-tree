/**
 * Clamp a finite tree scale to the supported range of 0.005 to 2; throw
 * RangeError for nonfinite input.
 */
export function clampTreeScale(scale: number): number {
  if (!Number.isFinite(scale))
    throw new RangeError("Tree scale must be finite");
  return Math.max(0.005, Math.min(2, scale));
}

/**
 * Choose an aspect-preserving scale that fits the tree within the available
 * dimensions.
 *
 * Do not enlarge beyond scale one; apply the supported minimum scale even if
 * the tree then exceeds the viewport. Throw RangeError unless all dimensions
 * are positive and finite.
 */
export function fitTreeScale(
  width: number,
  height: number,
  availableWidth: number,
  availableHeight: number,
): number {
  if (
    [width, height, availableWidth, availableHeight].some(
      (value) => !Number.isFinite(value) || value <= 0,
    )
  ) {
    throw new RangeError("Tree dimensions must be positive and finite");
  }
  return clampTreeScale(
    Math.min(1, availableWidth / width, availableHeight / height),
  );
}
