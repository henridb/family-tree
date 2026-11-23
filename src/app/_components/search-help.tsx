import { ControlHelp } from "./control-help";

/** Explain semicolon-separated name searches using the shared help tooltip. */
export function SearchHelp() {
  return (
    <ControlHelp label="Aide pour la recherche">
      Pour rechercher plusieurs personnes, séparez les noms par un point-virgule
      : Jacques ; Madeleine. Les personnes correspondant à l’une des recherches
      sont mises en évidence.
    </ControlHelp>
  );
}
