import { useEffect, useState } from "react";

export interface TocEntry {
  id: string;
  text: string;
  level: 2 | 3;
}

function sameEntries(a: readonly TocEntry[], b: readonly TocEntry[]): boolean {
  return (
    a.length === b.length &&
    a.every((entry, i) => {
      const other = b[i];
      return (
        other !== undefined &&
        entry.id === other.id &&
        entry.text === other.text &&
        entry.level === other.level
      );
    })
  );
}

function sameElements(a: readonly Element[], b: readonly Element[]): boolean {
  return a.length === b.length && a.every((element, i) => element === b[i]);
}

/**
 * Scans the given container (defaults to document) for h2/h3 headings,
 * builds a flat list, and tracks the active one via IntersectionObserver.
 *
 * The list follows the container's content: headings that render later (a lazily loaded section
 * inside the page, e.g. the user manual's MDX) or whose text changes (a language switch) are
 * picked up by a MutationObserver, without remounting the table of contents.
 */
export function useTableOfContents(containerSelector = "main"): {
  entries: TocEntry[];
  activeId: string | null;
} {
  const [entries, setEntries] = useState<TocEntry[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    const container = document.querySelector(containerSelector) ?? document;
    let observed: HTMLHeadingElement[] = [];
    let listed: TocEntry[] = [];
    let intersection: IntersectionObserver | null = null;

    const observeHeadings = (headings: HTMLHeadingElement[]) => {
      intersection?.disconnect();
      intersection = null;
      observed = headings;
      if (headings.length === 0) return;
      intersection = new IntersectionObserver(
        (observerEntries) => {
          for (const entry of observerEntries) {
            if (entry.isIntersecting) {
              setActiveId(entry.target.id);
              break;
            }
          }
        },
        { rootMargin: "0px 0px -60% 0px", threshold: 0 },
      );
      for (const heading of headings) {
        intersection.observe(heading);
      }
    };

    const scan = () => {
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

      const next: TocEntry[] = headings.map((h) => ({
        id: h.id,
        text: h.textContent?.trim() ?? "",
        level: h.tagName === "H2" ? 2 : 3,
      }));
      if (!sameEntries(listed, next)) {
        listed = next;
        setEntries(next);
      }
      if (!sameElements(observed, headings)) observeHeadings(headings);
    };

    scan();

    // Ids are set above, so attribute changes are not observed: they never re-trigger the scan
    const mutations = new MutationObserver(scan);
    mutations.observe(container, { childList: true, subtree: true, characterData: true });

    return () => {
      mutations.disconnect();
      intersection?.disconnect();
    };
  }, [containerSelector]);

  return { entries, activeId };
}
