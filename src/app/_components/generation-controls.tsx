import { Label } from "@/components/ui/label";
import { ControlHelp } from "./control-help";

/** Apply a generation overview once, leaving individual branches expandable. */
export function GenerationControls({
  generationCount,
  searchActive,
  onHideFromGeneration,
}: {
  generationCount: number;
  searchActive: boolean;
  onHideFromGeneration: (generation: number) => void;
}) {
  const disabled = searchActive || generationCount < 2;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Label htmlFor="tree-generation">Cacher les générations :</Label>
      <select
        id="tree-generation"
        value=""
        disabled={disabled}
        onChange={(event) => {
          if (!disabled && event.target.value)
            onHideFromGeneration(Number(event.target.value));
        }}
        className="h-9 w-16 shrink-0 rounded-md border border-amber-900/20 bg-white/60 px-2 text-sm disabled:opacity-50 lg:h-8"
      >
        <option value="" disabled hidden>
          —
        </option>
        {Array.from(
          { length: Math.max(0, generationCount - 1) },
          (_, index) => (
            <option key={index + 2} value={index + 2}>
              {index + 2}+
            </option>
          ),
        )}
      </select>
      <ControlHelp label="Aide pour cacher les générations">
        <p>
          Masquez les générations les plus récentes pour alléger l’arbre et
          mieux lire les premières générations.
        </p>
        <p className="mt-2">
          « 3+ » cache la génération 3 et toutes les suivantes. Vous pouvez
          ensuite rouvrir les branches qui vous intéressent avec +, ou utiliser
          Tout déplier pour réafficher tout l’arbre.
        </p>
        {searchActive && (
          <p className="mt-2">
            Effacez la recherche pour modifier les générations cachées.
          </p>
        )}
      </ControlHelp>
    </div>
  );
}
