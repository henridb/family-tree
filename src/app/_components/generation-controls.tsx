import { useTranslations } from "next-intl";
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
  const t = useTranslations("viewer");
  const disabled = searchActive || generationCount < 2;
  return (
    <div className="flex flex-wrap items-center gap-1 sm:gap-2">
      <Label htmlFor="tree-generation">{t("hideGenerations")}</Label>
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
          <SelectValue placeholder={t("choose")} />
        </SelectTrigger>
        <SelectContent
          position="item-aligned"
          className="min-w-24 border-amber-900/20 bg-[#f4ecd5] text-amber-950"
        >
          <SelectItem value="none">{t("none")}</SelectItem>
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
      <ControlHelp label={t("generationHelpLabel")}>
        <p>{t("generationHelp")}</p>
        <p className="mt-2">{t("generationExample")}</p>
        {searchActive && <p className="mt-2">{t("clearSearch")}</p>}
      </ControlHelp>
    </div>
  );
}
