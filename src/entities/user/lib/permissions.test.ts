import { describe, expect, it } from "vitest";
import type { UserRole } from "../types/user.types";
import {
  getHighestRole,
  getRoleLimits,
  getRolePermissions,
  ROLE_LIMITS,
  resolveMaxNetworks,
} from "./permissions";

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

describe("ROLE_LIMITS.maxNetworks (#122, mirrors the backend role limits)", () => {
  it("caps networks per role: Guest 1, BaseUser 5, Researcher 20, Administrator unlimited", () => {
    expect(ROLE_LIMITS.Guest.maxNetworks).toBe(1);
    expect(ROLE_LIMITS.BaseUser.maxNetworks).toBe(5);
    expect(ROLE_LIMITS.Researcher.maxNetworks).toBe(20);
    expect(ROLE_LIMITS.Administrator.maxNetworks).toBe(Infinity);
  });

  it("is returned by getRoleLimits for the highest role", () => {
    expect(getRoleLimits(["Guest", "BaseUser"]).maxNetworks).toBe(5);
  });
});

describe("resolveMaxNetworks", () => {
  it("uses the session value when usageLimits carries maxNetworks", () => {
    expect(
      resolveMaxNetworks({
        roles: ["Guest"],
        usageLimits: { maxAgents: 10, maxIterations: 10, densityFactor: 0.5, maxNetworks: 3 },
      }),
    ).toBe(3);
  });

  it("keeps an unlimited (Infinity) session value", () => {
    expect(
      resolveMaxNetworks({
        roles: ["Administrator"],
        usageLimits: {
          maxAgents: Infinity,
          maxIterations: Infinity,
          densityFactor: 1,
          maxNetworks: Infinity,
        },
      }),
    ).toBe(Infinity);
  });

  it.each([
    ["Guest", 1],
    ["BaseUser", 5],
    ["Researcher", 20],
    ["Administrator", Infinity],
  ] as const)("falls back to the %s role table when usageLimits predates maxNetworks", (role, expected) => {
    expect(
      resolveMaxNetworks({
        roles: [role],
        usageLimits: { maxAgents: 10, maxIterations: 10, densityFactor: 0.5 },
      }),
    ).toBe(expected);
  });

  it("falls back to the role table when usageLimits is missing entirely", () => {
    expect(resolveMaxNetworks({ roles: ["Researcher"] })).toBe(20);
  });

  it("falls back to Guest when roles are missing", () => {
    expect(resolveMaxNetworks({ roles: undefined as unknown as UserRole[] })).toBe(1);
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

describe("getHighestRole", () => {
  it("ignores the order of roles (promoted users keep Guest first)", () => {
    expect(getHighestRole(["Guest", "Researcher"])).toBe("Researcher");
    expect(getHighestRole(["Guest", "BaseUser", "Administrator"])).toBe("Administrator");
  });

  it("returns the single role when only one is present", () => {
    expect(getHighestRole(["BaseUser"])).toBe("BaseUser");
  });

  it("falls back to Guest for an empty list", () => {
    expect(getHighestRole([])).toBe("Guest");
  });
});
