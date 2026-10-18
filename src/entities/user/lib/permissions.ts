import type { UsageLimits, User, UserRole } from "../types/user.types";

/** Mirror of the backend role quotas (`DatabaseManager.getUsageLimits`). */
export const ROLE_LIMITS: Record<UserRole, Required<UsageLimits>> = {
  Administrator: {
    maxAgents: Infinity,
    maxIterations: Infinity,
    densityFactor: 1.0,
    maxNetworks: Infinity,
  },
  Researcher: { maxAgents: 1000, maxIterations: 1000, densityFactor: 0.75, maxNetworks: 20 },
  BaseUser: { maxAgents: 100, maxIterations: 100, densityFactor: 0.5, maxNetworks: 5 },
  Guest: { maxAgents: 10, maxIterations: 10, densityFactor: 0.5, maxNetworks: 1 },
};

export const ROLE_PERMISSIONS: Record<UserRole, string[]> = {
  Guest: ["viewDashboard", "viewWiki", "viewSampleResults"],
  BaseUser: ["viewDashboard", "viewWiki", "viewSampleResults", "runLimitedSimulations"],
  Researcher: [
    "viewDashboard",
    "viewWiki",
    "viewSampleResults",
    "runLimitedSimulations",
    "runExtendedSimulations",
  ],
  Administrator: [
    "viewDashboard",
    "viewWiki",
    "viewSampleResults",
    "runLimitedSimulations",
    "runExtendedSimulations",
    "runSimulations",
    "manageUsers",
    "defineLimits",
  ],
};

export function getRoleLimits(roles: UserRole[]): Required<UsageLimits> {
  const priority: UserRole[] = ["Administrator", "Researcher", "BaseUser", "Guest"];
  const highestRole = priority.find((role) => roles.includes(role)) ?? "Guest";
  return ROLE_LIMITS[highestRole];
}

/**
 * Network cap of the user's generated runs (Infinity = unlimited). `maxNetworks` arrived with
 * #122, so sessions whose `usageLimits` predate it fall back to the role table.
 */
export function resolveMaxNetworks(user: Pick<User, "roles" | "usageLimits">): number {
  return user.usageLimits?.maxNetworks ?? getRoleLimits(user.roles ?? []).maxNetworks;
}

export function getRolePermissions(roles: UserRole[]): string[] {
  const allPermissions = roles.flatMap((role) => ROLE_PERMISSIONS[role]);
  return [...new Set(allPermissions)];
}
