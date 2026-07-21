import { useTranslation } from "@/shared/i18n";
import { useTableOfContents } from "@/shared/lib/use-table-of-contents";
import { cn } from "@/shared/lib/utils";

interface TableOfContentsProps {
  containerSelector?: string;
  className?: string;
}

export function TableOfContents({ containerSelector = "main", className }: TableOfContentsProps) {
  const { t } = useTranslation();
  const { entries, activeId } = useTableOfContents(containerSelector);

  if (entries.length === 0) return null;

  return (
    <nav aria-label={t("nav.onThisPage")} className={cn("w-56 shrink-0", className)}>
      <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-foreground/50">
        {t("nav.onThisPage")}
      </p>
      <ul className="space-y-1">
        {entries.map((entry) => (
          <li key={entry.id} className={entry.level === 3 ? "pl-3" : ""}>
            <a
              href={`#${entry.id}`}
              className={cn(
                "block truncate text-sm transition-colors hover:text-foreground",
                activeId === entry.id ? "font-medium text-foreground" : "text-foreground/50",
              )}
            >
              {entry.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
