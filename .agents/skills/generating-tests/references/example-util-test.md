# Example: Pure Utility Test

**Source:** `src/entities/user/lib/permissions.test.ts`
**Tests:** `getRoleLimits` and `getRolePermissions` — pure functions that map role arrays to permission/limit objects.

This is the canonical pattern for testing pure utility functions in this project.

## Key patterns

- Import directly from vitest (`describe`, `expect`, `it`)
- Import the types needed for typed fixtures
- Group tests by function with `describe`
- Test each role individually, then combinations
- Test edge cases: empty arrays, deduplication, priority ordering

## Full test file

```typescript
import { describe, expect, it } from "vitest";
import type { UserRole } from "../types/user.types";
import { getRoleLimits, getRolePermissions, ROLE_LIMITS } from "./permissions";

describe("getRoleLimits", () => {
  it("returns Administrator limits when Administrator is present", () => {
    const limits = getRoleLimits(["Administrator"]);
    expect(limits).toEqual(ROLE_LIMITS.Administrator);
    expect(limits.maxAgents).toBe(Infinity);
  });

  it("returns Researcher limits when Researcher is highest role", () => {
    const limits = getRoleLimits(["Researcher"]);
    expect(limits.maxAgents).toBe(1000);
    expect(limits.maxIterations).toBe(1000);
    expect(limits.densityFactor).toBe(0.75);
  });

  it("returns BaseUser limits when BaseUser is highest role", () => {
    const limits = getRoleLimits(["BaseUser"]);
    expect(limits.maxAgents).toBe(100);
    expect(limits.maxIterations).toBe(100);
    expect(limits.densityFactor).toBe(0.5);
  });

  it("returns Guest limits when only Guest is present", () => {
    const limits = getRoleLimits(["Guest"]);
    expect(limits.maxAgents).toBe(10);
    expect(limits.maxIterations).toBe(10);
  });

  it("returns Guest limits for empty roles array", () => {
    const limits = getRoleLimits([]);
    expect(limits).toEqual(ROLE_LIMITS.Guest);
  });

  it("returns highest role limits when multiple roles are present", () => {
    const limits = getRoleLimits(["Guest", "Researcher"]);
    expect(limits).toEqual(ROLE_LIMITS.Researcher);
  });

  it("returns Administrator limits when mixed with lower roles", () => {
    const roles: UserRole[] = ["Guest", "BaseUser", "Administrator", "Researcher"];
    const limits = getRoleLimits(roles);
    expect(limits).toEqual(ROLE_LIMITS.Administrator);
  });

  it("follows priority: Administrator > Researcher > BaseUser > Guest", () => {
    expect(getRoleLimits(["Researcher", "BaseUser"])).toEqual(ROLE_LIMITS.Researcher);
    expect(getRoleLimits(["BaseUser", "Guest"])).toEqual(ROLE_LIMITS.BaseUser);
    expect(getRoleLimits(["Administrator", "Guest"])).toEqual(ROLE_LIMITS.Administrator);
  });
});

describe("getRolePermissions", () => {
  it("returns Guest permissions for Guest role", () => {
    const permissions = getRolePermissions(["Guest"]);
    expect(permissions).toContain("viewDashboard");
    expect(permissions).toContain("viewWiki");
    expect(permissions).toContain("viewSampleResults");
    expect(permissions).not.toContain("runLimitedSimulations");
  });

  it("returns Administrator permissions including manageUsers", () => {
    const permissions = getRolePermissions(["Administrator"]);
    expect(permissions).toContain("manageUsers");
    expect(permissions).toContain("defineLimits");
    expect(permissions).toContain("runSimulations");
  });

  it("deduplicates permissions across multiple roles", () => {
    const permissions = getRolePermissions(["Guest", "BaseUser"]);
    const viewDashboardCount = permissions.filter((p) => p === "viewDashboard").length;
    expect(viewDashboardCount).toBe(1);
  });

  it("returns union of permissions from all provided roles", () => {
    const guestPerms = getRolePermissions(["Guest"]);
    const researcherPerms = getRolePermissions(["Researcher"]);
    const combined = getRolePermissions(["Guest", "Researcher"]);

    for (const perm of [...guestPerms, ...researcherPerms]) {
      expect(combined).toContain(perm);
    }
  });

  it("returns empty array for empty roles", () => {
    const permissions = getRolePermissions([]);
    expect(permissions).toEqual([]);
  });

  it("returns unique permissions (no duplicates in result)", () => {
    const permissions = getRolePermissions(["BaseUser", "Researcher", "Guest"]);
    const unique = [...new Set(permissions)];
    expect(permissions.length).toBe(unique.length);
  });
});
```
