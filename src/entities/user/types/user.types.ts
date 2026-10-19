export type UserRole = "Administrator" | "Researcher" | "BaseUser" | "Guest";

export interface UsageLimits {
  maxAgents: number;
  maxIterations: number;
  densityFactor: number;
  /**
   * Max `numberOfNetworks` of a generated run (#122). Optional: a backend that predates this
   * field does not send it — resolve it with `resolveMaxNetworks`, which falls back to the role
   * table.
   */
  maxNetworks?: number;
}

/**
 * Session user. Identity (`email`, `name`, `photo`) comes from Firebase Authentication;
 * authorization (`roles`, `usageLimits`, `deactivated`) from the backend. Without the backend,
 * `roles` is empty and `usageLimits` undefined (role-table fallbacks apply).
 */
export interface User {
  uid: string;
  email: string;
  name: string;
  photo: string;
  roles: UserRole[];
  usageLimits?: UsageLimits;
  deactivated?: boolean;
}
