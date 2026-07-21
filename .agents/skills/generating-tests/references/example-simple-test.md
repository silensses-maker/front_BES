# Example: Simple Utility Test

**Source:** `src/shared/lib/utils.test.ts`
**Tests:** `cn()` — a single pure function that merges Tailwind classes using `clsx` + `tailwind-merge`.

This is the simplest test pattern in the project — use it for files that export a single function with no dependencies.

## Key patterns

- Single `describe` block wrapping the function name
- Direct input/output assertions
- Cover: normal usage, falsy values, conflict resolution, empty input

## Full test file

```typescript
import { describe, expect, it } from "vitest";
import { cn } from "./utils";

describe("cn", () => {
  it("returns a single class as-is", () => {
    expect(cn("text-sm")).toBe("text-sm");
  });

  it("merges multiple classes into a single string", () => {
    expect(cn("text-sm", "font-bold")).toBe("text-sm font-bold");
  });

  it("ignores falsy values (undefined, null, false)", () => {
    expect(cn("text-sm", undefined, null, false, "font-bold")).toBe("text-sm font-bold");
  });

  it("resolves Tailwind class conflicts — last value wins", () => {
    expect(cn("bg-red-500", "bg-blue-500")).toBe("bg-blue-500");
    expect(cn("p-2", "p-4")).toBe("p-4");
    expect(cn("text-sm", "text-lg")).toBe("text-lg");
  });

  it("handles conditional classes via objects", () => {
    expect(cn({ "font-bold": true, italic: false })).toBe("font-bold");
  });

  it("handles conditional classes via arrays", () => {
    const isActive = true;
    expect(cn("base", isActive && "active")).toBe("base active");
    expect(cn("base", !isActive && "active")).toBe("base");
  });

  it("returns empty string when no valid classes are provided", () => {
    expect(cn(undefined, null, false)).toBe("");
  });

  it("keeps non-conflicting Tailwind utilities from both args", () => {
    const result = cn("text-sm font-bold", "text-blue-500");
    expect(result).toContain("text-sm");
    expect(result).toContain("font-bold");
    expect(result).toContain("text-blue-500");
  });
});
```
