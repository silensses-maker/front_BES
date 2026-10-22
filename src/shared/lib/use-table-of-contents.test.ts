import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TocEntry } from "./use-table-of-contents";
import { useTableOfContents } from "./use-table-of-contents";

// ─── Types ───────────────────────────────────────────────────────────────────

type IntersectionObserverCallback = (entries: IntersectionObserverEntry[]) => void;

type MockObserverHandle = {
  observe: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  triggerIntersection: (entries: Partial<IntersectionObserverEntry>[]) => void;
};

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeHeading(tag: "H2" | "H3", text: string, id = ""): HTMLHeadingElement {
  const el = document.createElement(tag.toLowerCase() as "h2" | "h3");
  el.textContent = text;
  if (id) el.id = id;
  return el;
}

function makeContainer(headings: HTMLHeadingElement[]): HTMLElement {
  const container = document.createElement("main");
  for (const h of headings) container.appendChild(h);
  return container;
}

// ─── Mock helpers ─────────────────────────────────────────────────────────────

let lastObserverHandle: MockObserverHandle | null = null;

function setupIntersectionObserverMock(): void {
  lastObserverHandle = null;

  // Wrapped in vi.fn() so the global is a spy — required for toHaveBeenCalledWith assertions.
  vi.stubGlobal(
    "IntersectionObserver",
    vi.fn(function MockIntersectionObserver(
      callback: IntersectionObserverCallback,
      _options: IntersectionObserverInit,
    ) {
      const handle: MockObserverHandle = {
        observe: vi.fn(),
        disconnect: vi.fn(),
        triggerIntersection(partialEntries: Partial<IntersectionObserverEntry>[]) {
          const full = partialEntries.map(
            (e) =>
              ({
                isIntersecting: false,
                target: document.createElement("div"),
                ...e,
              }) as IntersectionObserverEntry,
          );
          callback(full);
        },
      };
      lastObserverHandle = handle;
      return handle;
    }),
  );
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("useTableOfContents", () => {
  beforeEach(() => {
    setupIntersectionObserverMock();
  });

  afterEach(() => {
    document.body.innerHTML = "";
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe("when no headings are found", () => {
    it("returns empty entries and null activeId when no h2/h3 found", () => {
      const container = document.createElement("main");
      document.body.appendChild(container);
      vi.spyOn(document, "querySelector").mockReturnValue(container);

      const { result } = renderHook(() => useTableOfContents("main"));

      const entries: TocEntry[] = result.current.entries;
      expect(entries).toEqual([]);
      expect(result.current.activeId).toBeNull();
    });
  });

  describe("heading extraction", () => {
    it("extracts h2/h3 headings and builds TocEntry array with id, text, level", () => {
      const h2 = makeHeading("H2", "Introduction", "intro");
      const h3 = makeHeading("H3", "Background", "background");
      const container = makeContainer([h2, h3]);
      document.body.appendChild(container);
      vi.spyOn(document, "querySelector").mockReturnValue(container);

      const { result } = renderHook(() => useTableOfContents("main"));

      expect(result.current.entries).toEqual<TocEntry[]>([
        { id: "intro", text: "Introduction", level: 2 },
        { id: "background", text: "Background", level: 3 },
      ]);
    });

    it("sets level=2 for h2 elements", () => {
      const h2 = makeHeading("H2", "Section", "sec");
      const container = makeContainer([h2]);
      document.body.appendChild(container);
      vi.spyOn(document, "querySelector").mockReturnValue(container);

      const { result } = renderHook(() => useTableOfContents("main"));

      expect(result.current.entries[0]?.level).toBe(2);
    });

    it("sets level=3 for h3 elements", () => {
      const h3 = makeHeading("H3", "Subsection", "sub");
      const container = makeContainer([h3]);
      document.body.appendChild(container);
      vi.spyOn(document, "querySelector").mockReturnValue(container);

      const { result } = renderHook(() => useTableOfContents("main"));

      expect(result.current.entries[0]?.level).toBe(3);
    });
  });

  describe("auto-assigning ids", () => {
    it("auto-assigns id to heading if not present: slugifies text to kebab-case", () => {
      const h2 = makeHeading("H2", "Hello World Section");
      const container = makeContainer([h2]);
      document.body.appendChild(container);
      vi.spyOn(document, "querySelector").mockReturnValue(container);

      const { result } = renderHook(() => useTableOfContents("main"));

      expect(result.current.entries[0]?.id).toBe("hello-world-section");
    });

    it("auto-assigns random id when heading textContent is null (unreachable via DOM, guarded by ??)", () => {
      // In jsdom, element.textContent is always "" when empty — never null.
      // The ?? fallback only fires when textContent is null/undefined (e.g. in non-element nodes).
      // This test verifies the actual DOM behavior: empty textContent produces an empty-string id.
      const h2 = makeHeading("H2", "");
      const container = makeContainer([h2]);
      document.body.appendChild(container);
      vi.spyOn(document, "querySelector").mockReturnValue(container);

      const { result } = renderHook(() => useTableOfContents("main"));

      // Empty textContent slugifies to "" — the ?? path is not triggered in DOM contexts.
      expect(result.current.entries[0]?.id).toBe("");
    });
  });

  describe("IntersectionObserver integration", () => {
    it("observes headings with IntersectionObserver using rootMargin '0px 0px -60% 0px' and threshold 0", () => {
      const h2 = makeHeading("H2", "Observed", "observed");
      const container = makeContainer([h2]);
      document.body.appendChild(container);
      vi.spyOn(document, "querySelector").mockReturnValue(container);

      renderHook(() => useTableOfContents("main"));

      expect(IntersectionObserver).toHaveBeenCalledWith(expect.any(Function), {
        rootMargin: "0px 0px -60% 0px",
        threshold: 0,
      });
      expect(lastObserverHandle?.observe).toHaveBeenCalledWith(h2);
    });

    it("updates activeId when a heading intersection changes to isIntersecting=true", async () => {
      const h2 = makeHeading("H2", "Visible Heading", "visible-heading");
      const container = makeContainer([h2]);
      document.body.appendChild(container);
      vi.spyOn(document, "querySelector").mockReturnValue(container);

      const { result } = renderHook(() => useTableOfContents("main"));

      expect(result.current.activeId).toBeNull();

      await act(() => {
        lastObserverHandle?.triggerIntersection([{ isIntersecting: true, target: h2 }]);
      });

      expect(result.current.activeId).toBe("visible-heading");
    });

    it("does not update activeId when isIntersecting=false", async () => {
      const h2 = makeHeading("H2", "Hidden Heading", "hidden-heading");
      const container = makeContainer([h2]);
      document.body.appendChild(container);
      vi.spyOn(document, "querySelector").mockReturnValue(container);

      const { result } = renderHook(() => useTableOfContents("main"));

      await act(() => {
        lastObserverHandle?.triggerIntersection([{ isIntersecting: false, target: h2 }]);
      });

      expect(result.current.activeId).toBeNull();
    });
  });

  describe("containerSelector", () => {
    it("uses custom containerSelector to find the container", () => {
      const querySpy = vi.spyOn(document, "querySelector").mockReturnValue(null);

      renderHook(() => useTableOfContents(".custom-selector"));

      expect(querySpy).toHaveBeenCalledWith(".custom-selector");
    });

    it("falls back to document if containerSelector query returns null", () => {
      vi.spyOn(document, "querySelector").mockReturnValue(null);
      // When querySelector returns null the hook falls back to document.
      // querySelectorAll on document is called with "h2, h3".
      const querySelectorAllSpy = vi.spyOn(document, "querySelectorAll");

      renderHook(() => useTableOfContents("main"));

      expect(querySelectorAllSpy).toHaveBeenCalledWith("h2, h3");
    });

    it("defaults to 'main' as containerSelector", () => {
      const querySpy = vi.spyOn(document, "querySelector").mockReturnValue(null);

      renderHook(() => useTableOfContents());

      expect(querySpy).toHaveBeenCalledWith("main");
    });
  });

  describe("cleanup", () => {
    it("disconnects observer on unmount", () => {
      const h2 = makeHeading("H2", "Cleanup Test", "cleanup-test");
      const container = makeContainer([h2]);
      document.body.appendChild(container);
      vi.spyOn(document, "querySelector").mockReturnValue(container);

      const { unmount } = renderHook(() => useTableOfContents("main"));

      expect(lastObserverHandle?.disconnect).not.toHaveBeenCalled();

      unmount();

      expect(lastObserverHandle?.disconnect).toHaveBeenCalledOnce();
    });

    it("does not create an observer when no headings are found (no disconnect needed)", () => {
      const container = document.createElement("main");
      document.body.appendChild(container);
      vi.spyOn(document, "querySelector").mockReturnValue(container);

      const { unmount } = renderHook(() => useTableOfContents("main"));

      unmount();

      expect(lastObserverHandle).toBeNull();
    });

    it("stops following the container's content on unmount", () => {
      const disconnect = vi.spyOn(MutationObserver.prototype, "disconnect");
      const container = makeContainer([makeHeading("H2", "Static", "static")]);
      document.body.appendChild(container);
      vi.spyOn(document, "querySelector").mockReturnValue(container);

      const { unmount } = renderHook(() => useTableOfContents("main"));
      unmount();

      expect(disconnect).toHaveBeenCalled();
    });
  });

  // A lazily loaded section (the user manual's MDX) renders its headings after the page, and a
  // language switch changes their text in place.
  describe("content that changes after mount", () => {
    /** Lets the MutationObserver deliver its records, inside act (it sets state). */
    const flushMutations = () => act(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));

    function mountOn(container: HTMLElement) {
      document.body.appendChild(container);
      vi.spyOn(document, "querySelector").mockReturnValue(container);
      return renderHook(() => useTableOfContents("main"));
    }

    it("lists headings that render after mount and observes them", async () => {
      const container = makeContainer([]);
      const { result } = mountOn(container);
      expect(result.current.entries).toEqual([]);

      const late = makeHeading("H2", "Late section", "late-section");
      container.appendChild(late);
      await flushMutations();

      expect(result.current.entries).toEqual<TocEntry[]>([
        { id: "late-section", text: "Late section", level: 2 },
      ]);
      expect(lastObserverHandle?.observe).toHaveBeenCalledWith(late);
    });

    it("follows a heading whose text changes (a language switch)", async () => {
      const heading = makeHeading("H2", "Primeros pasos", "primeros-pasos");
      const container = makeContainer([heading]);
      const { result } = mountOn(container);
      const firstObserver = lastObserverHandle;

      heading.textContent = "Getting started";
      await flushMutations();

      expect(result.current.entries).toEqual<TocEntry[]>([
        { id: "primeros-pasos", text: "Getting started", level: 2 },
      ]);
      // Same heading element: no new IntersectionObserver
      expect(lastObserverHandle).toBe(firstObserver);
    });

    it("keeps the same entries when the change does not touch the headings", async () => {
      const container = makeContainer([makeHeading("H3", "Detail", "detail")]);
      const { result } = mountOn(container);
      const before = result.current.entries;

      container.appendChild(document.createElement("p"));
      await flushMutations();

      expect(result.current.entries).toBe(before);
    });

    it("replaces the IntersectionObserver when the headings are replaced", async () => {
      const container = makeContainer([makeHeading("H2", "Old", "old")]);
      const { result } = mountOn(container);
      const firstObserver = lastObserverHandle;

      container.replaceChildren(makeHeading("H2", "New", "new"));
      await flushMutations();

      expect(result.current.entries.map((entry) => entry.id)).toEqual(["new"]);
      expect(firstObserver?.disconnect).toHaveBeenCalledOnce();
      expect(lastObserverHandle).not.toBe(firstObserver);
    });

    it("drops the IntersectionObserver when every heading goes away", async () => {
      const container = makeContainer([makeHeading("H2", "Gone", "gone")]);
      const { result } = mountOn(container);
      const firstObserver = lastObserverHandle;

      container.replaceChildren();
      await flushMutations();

      expect(result.current.entries).toEqual([]);
      expect(firstObserver?.disconnect).toHaveBeenCalledOnce();
    });
  });
});
