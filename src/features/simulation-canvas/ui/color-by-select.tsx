import { useTranslation } from "@/shared/i18n";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";

/** Node coloring modes (mockup "Colorear por"). Round 0 shows the initial state. */
export type ColorBy = "pub" | "priv" | "div" | "estr";

interface ColorBySelectProps {
  value: ColorBy;
  onChange: (value: ColorBy) => void;
}

/**
 * "Colorear por" select (mockup, top-right of the graph). Replaces the old
 * Initial/Final toggle (#99) — the timeline supersedes it: seek to round 0
 * for the initial state; colors always follow the viewed round.
 */
export function ColorBySelect({ value, onChange }: ColorBySelectProps) {
  const { t } = useTranslation();

  return (
    <div className="absolute right-2.5 top-2.5 z-10 flex items-center gap-1.5 rounded-lg border border-border bg-card px-2 py-[5px] shadow-sm">
      <span className="font-sans text-[11px] text-muted-foreground">
        {t("runView.colorByLabel")}
      </span>
      <Select value={value} onValueChange={(next) => onChange(next as ColorBy)}>
        <SelectTrigger
          size="sm"
          className="h-[26px] text-xs"
          aria-label={t("runView.colorByLabel")}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="pub">{t("runView.colorPublic")}</SelectItem>
          <SelectItem value="priv">{t("runView.colorPrivate")}</SelectItem>
          <SelectItem value="div">{t("runView.colorDivergence")}</SelectItem>
          <SelectItem value="estr">{t("runView.colorStrategy")}</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
