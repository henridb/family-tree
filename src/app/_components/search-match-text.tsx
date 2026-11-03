import type { ReactNode } from "react";
import type { TextMatch } from "@/types/family";

/**
 * Render text with marked matches while preserving its original spelling.
 *
 * Expect sorted, nonoverlapping half-open UTF-16 ranges, as produced by the
 * name-search helpers.
 */
export function SearchMatchText({
  text,
  ranges = [],
}: {
  text: string;
  ranges?: readonly TextMatch[];
}) {
  const parts: ReactNode[] = [];
  let cursor = 0;
  for (const { start, end } of ranges) {
    parts.push(text.slice(cursor, start));
    parts.push(
      <mark key={start} className="rounded-[0.15em] bg-amber-200 text-inherit">
        {text.slice(start, end)}
      </mark>,
    );
    cursor = end;
  }
  parts.push(text.slice(cursor));
  return <>{parts}</>;
}
