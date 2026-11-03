import { useLayoutEffect, useState } from "react";
import Xarrow from "react-xarrows";
import { personElementId } from "@/lib/family-identities";
import type { person } from "@/types/family";

/**
 * Connect a partnership junction to its children through a shared sibling rail.
 *
 * Measure the rendered parent and child rows before paint and remeasure when
 * scale or display settings change card geometry. Render no connectors until
 * their anchor elements are available.
 */
export function PartnershipConnectors({
  start,
  row,
  children,
  scale,
  displaySurname,
  displayOnlyMaidenSurname,
  displayBirthdate,
}: {
  start: string;
  row: string;
  children: readonly person[];
  scale: number;
  displaySurname: boolean;
  displayOnlyMaidenSurname: boolean;
  displayBirthdate: boolean;
}) {
  const [geometry, setGeometry] = useState<{
    bendDistance: number;
    startOffset: number;
  } | null>(null);

  useLayoutEffect(() => {
    const junction = document.getElementById(start);
    const childRow = document.getElementById(row);
    const parentRow = junction?.closest(".parents");
    if (!junction || !childRow || !parentRow) return;
    const from = junction.getBoundingClientRect();
    const to = childRow.getBoundingClientRect();
    const rail = (parentRow.getBoundingClientRect().bottom + to.top) / 2;
    const bendDistance = rail - (from.top + from.height / 2);
    const startOffset = -from.height / 2;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Measure the shared sibling rail from rendered DOM before paint.
    setGeometry((previous) =>
      previous?.bendDistance === bendDistance &&
      previous.startOffset === startOffset
        ? previous
        : { bendDistance, startOffset },
    );
    // Display settings can change card heights without changing the family data.
  }, [
    start,
    row,
    children,
    scale,
    displaySurname,
    displayOnlyMaidenSurname,
    displayBirthdate,
  ]);

  if (!geometry) return null;
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0">
      {children.map((child) => (
        <Xarrow
          key={child.id}
          start={start}
          end={personElementId(child.id)}
          startAnchor={{
            position: "bottom",
            offset: { y: geometry.startOffset },
          }}
          endAnchor="top"
          path="grid"
          gridBreak={String(geometry.bendDistance)}
          showHead={false}
          color="black"
          strokeWidth={3 * scale}
          zIndex={99}
          divContainerProps={{ id: `connector-${child.id}` }}
          SVGcanvasProps={{ "aria-hidden": true, focusable: "false" }}
          SVGcanvasStyle={{ pointerEvents: "none" }}
          arrowBodyProps={{ fill: "none", pointerEvents: "none" }}
        />
      ))}
    </div>
  );
}
