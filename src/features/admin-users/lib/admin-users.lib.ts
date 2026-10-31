import { ROLE_LIMITS, ROLE_PRIORITY } from "@/entities/user";
import type { AdminUser, RoleCatalogEntry } from "@/shared/api/backend";

/** What a row calls the user: the display name, or the email of an account without one. */
export function adminUserDisplayName(user: Pick<AdminUser, "name" | "email">): string {
  return user.name.trim() || user.email;
}

/** Two-letter avatar fallback, as the shell's own avatar builds it. */
export function adminUserInitials(user: Pick<AdminUser, "name" | "email">): string {
  return adminUserDisplayName(user).slice(0, 2).toUpperCase();
}

/** BCP 47 tag for numbers and dates: Colombian Spanish for `es*`, US English otherwise. */
export function numberLocale(language: string): string {
  return language.startsWith("es") ? "es-CO" : "en-US";
}

/**
 * The role catalog when the backend's cannot be read: the role table the wizard validates with,
 * with `Infinity` as the contract's `null` (unlimited) and the priorities of `ROLE_PRIORITY`.
 */
export function fallbackRoleCatalog(): RoleCatalogEntry[] {
  const quota = (value: number) => (Number.isFinite(value) ? value : null);
  return ROLE_PRIORITY.map((role, index) => {
    const limits = ROLE_LIMITS[role];
    return {
      role,
      priority: ROLE_PRIORITY.length - 1 - index,
      usageLimits: {
        maxAgents: quota(limits.maxAgents),
        maxIterations: quota(limits.maxIterations),
        densityFactor: limits.densityFactor,
        maxNetworks: quota(limits.maxNetworks),
      },
    };
  });
}

/** The catalog by priority desc, so the select and the legend list the highest role first. */
export function sortRoleCatalog(entries: RoleCatalogEntry[]): RoleCatalogEntry[] {
  return [...entries].sort((a, b) => b.priority - a.priority);
}
