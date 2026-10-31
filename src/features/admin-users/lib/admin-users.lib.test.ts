import { describe, expect, it, vi } from "vitest";
import { ROLE_LIMITS } from "@/entities/user";
import {
  adminUserDisplayName,
  adminUserInitials,
  fallbackRoleCatalog,
  numberLocale,
  sortRoleCatalog,
} from "./admin-users.lib";

// The entity barrel reaches the auth store, which initializes Firebase.
vi.mock("@/shared/api/firebase", () => ({ auth: {} }));

describe("adminUserDisplayName / adminUserInitials", () => {
  it("prefers the name and falls back to the email", () => {
    expect(adminUserDisplayName({ name: "Ada Lovelace", email: "ada@univalle.edu.co" })).toBe(
      "Ada Lovelace",
    );
    expect(adminUserDisplayName({ name: "  ", email: "ada@univalle.edu.co" })).toBe(
      "ada@univalle.edu.co",
    );
  });

  it("builds two upper-case initials from the display name", () => {
    expect(adminUserInitials({ name: "ada", email: "x@y.z" })).toBe("AD");
    expect(adminUserInitials({ name: "", email: "x@y.z" })).toBe("X@");
  });
});

describe("numberLocale", () => {
  it("maps Spanish variants to es-CO and anything else to en-US", () => {
    expect(numberLocale("es")).toBe("es-CO");
    expect(numberLocale("es-MX")).toBe("es-CO");
    expect(numberLocale("en")).toBe("en-US");
    expect(numberLocale("fr")).toBe("en-US");
  });
});

describe("fallbackRoleCatalog", () => {
  it("lists the five roles from the highest priority down, with null for unlimited", () => {
    const catalog = fallbackRoleCatalog();
    expect(catalog.map((entry) => entry.role)).toEqual([
      "SuperAdministrator",
      "Administrator",
      "Researcher",
      "BaseUser",
      "Guest",
    ]);
    expect(catalog.map((entry) => entry.priority)).toEqual([4, 3, 2, 1, 0]);
    expect(catalog[0]?.usageLimits).toEqual({
      maxAgents: null,
      maxIterations: null,
      densityFactor: 1.0,
      maxNetworks: null,
    });
    expect(catalog[2]?.usageLimits).toEqual({
      maxAgents: ROLE_LIMITS.Researcher.maxAgents,
      maxIterations: ROLE_LIMITS.Researcher.maxIterations,
      densityFactor: ROLE_LIMITS.Researcher.densityFactor,
      maxNetworks: ROLE_LIMITS.Researcher.maxNetworks,
    });
  });
});

describe("sortRoleCatalog", () => {
  it("orders by priority desc without mutating the input", () => {
    const input = fallbackRoleCatalog().reverse();
    const sorted = sortRoleCatalog(input);
    expect(sorted.map((entry) => entry.priority)).toEqual([4, 3, 2, 1, 0]);
    expect(input[0]?.priority).toBe(0);
  });
});
