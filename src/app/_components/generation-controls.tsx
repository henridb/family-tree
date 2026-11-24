import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ControlHelp } from "./control-help";

/** Choose a generation overview while keeping individual branches expandable. */
export function GenerationControls({
  generationCount,
  searchActive,
  hiddenFromGeneration,
  onHideFromGeneration,
}: {
  generationCount: number;
  searchActive: boolean;
  hiddenFromGeneration: number | null | undefined;
  onHideFromGeneration: (generation: number | null) => void;
}) {
  const disabled = searchActive || generationCount < 2;
  return (
    <div className="flex flex-wrap items-center gap-1 sm:gap-2">
      <Label htmlFor="tree-generation">Cacher les générations :</Label>
      <Select
        value={
          hiddenFromGeneration === undefined
            ? ""
            : hiddenFromGeneration === null
              ? "none"
              : String(hiddenFromGeneration)
        }
        disabled={disabled}
        onValueChange={(value) => {
          if (!disabled)
            onHideFromGeneration(value === "none" ? null : Number(value));
        }}
      >
        <SelectTrigger
          id="tree-generation"
          className="min-w-24 flex-1 border-amber-900/20 bg-white/60 px-2 lg:h-8"
        >
          <SelectValue placeholder="Choisir…" />
        </SelectTrigger>
        <SelectContent
          position="item-aligned"
          className="min-w-24 border-amber-900/20 bg-[#f4ecd5] text-amber-950"
        >
          <SelectItem value="none">Aucune</SelectItem>
          {Array.from(
            { length: Math.max(0, generationCount - 1) },
            (_, index) => (
              <SelectItem key={index + 2} value={String(index + 2)}>
                {index + 2}+
              </SelectItem>
            ),
          )}
        </SelectContent>
      </Select>
      <ControlHelp label="Aide pour cacher les générations">
        <p>
          Masquez les générations les plus récentes pour alléger l’arbre et
          mieux lire les premières générations.
        </p>
        <p className="mt-2">
          « 3+ » cache la génération 3 et toutes les suivantes. Vous pouvez
          ensuite rouvrir les branches qui vous intéressent avec +. Choisissez «
          Aucune » pour réafficher tout l’arbre.
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
