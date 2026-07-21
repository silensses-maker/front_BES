import type { UsageLimits, UserRole } from "../types/user.types";

export const ROLE_LIMITS: Record<UserRole, UsageLimits> = {
  Administrator: { maxAgents: Infinity, maxIterations: Infinity, densityFactor: 1.0 },
  Researcher: { maxAgents: 1000, maxIterations: 1000, densityFactor: 0.75 },
  BaseUser: { maxAgents: 100, maxIterations: 100, densityFactor: 0.5 },
  Guest: { maxAgents: 10, maxIterations: 10, densityFactor: 0.5 },
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

export function getRoleLimits(roles: UserRole[]): UsageLimits {
  const priority: UserRole[] = ["Administrator", "Researcher", "BaseUser", "Guest"];
  const highestRole = priority.find((role) => roles.includes(role)) ?? "Guest";
  return ROLE_LIMITS[highestRole];
}

export function getRolePermissions(roles: UserRole[]): string[] {
  const allPermissions = roles.flatMap((role) => ROLE_PERMISSIONS[role]);
  return [...new Set(allPermissions)];
}
