import { useEffect, useState } from "react";

export interface TocEntry {
  id: string;
  text: string;
  level: 2 | 3;
}

/**
 * Scans the given container (defaults to document) for h2/h3 headings,
 * builds a flat list, and tracks the active one via IntersectionObserver.
 */
export function useTableOfContents(containerSelector = "main"): {
  entries: TocEntry[];
  activeId: string | null;
} {
  const [entries, setEntries] = useState<TocEntry[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    const container = document.querySelector(containerSelector) ?? document;
    const headings = Array.from(container.querySelectorAll<HTMLHeadingElement>("h2, h3"));

    // Auto-assign ids to headings that lack one
    for (const heading of headings) {
      if (!heading.id) {
        heading.id =
          heading.textContent
            ?.trim()
            .toLowerCase()
            .replace(/\s+/g, "-")
            .replace(/[^\w-]/g, "") ?? Math.random().toString(36).slice(2);
      }
    }

    setEntries(
      headings.map((h) => ({
        id: h.id,
        text: h.textContent?.trim() ?? "",
        level: h.tagName === "H2" ? 2 : 3,
      })),
    );

    if (headings.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
            break;
          }
        }
      },
      { rootMargin: "0px 0px -60% 0px", threshold: 0 },
    );

    for (const heading of headings) {
      observer.observe(heading);
    }

    return () => observer.disconnect();
  }, [containerSelector]);

  return { entries, activeId };
}
