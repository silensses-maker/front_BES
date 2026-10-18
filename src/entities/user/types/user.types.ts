export type UserRole = "Administrator" | "Researcher" | "BaseUser" | "Guest";

export interface UsageLimits {
  maxAgents: number;
  maxIterations: number;
  densityFactor: number;
  /**
   * Max `numberOfNetworks` of a generated run (#122). Optional: sessions restored from
   * Firestore documents (or synced against a backend) created before this field existed
   * lack it — resolve it with `resolveMaxNetworks`, which falls back to the role table.
   */
  maxNetworks?: number;
}

export interface User {
  uid: string;
  email: string;
  name: string;
  photo: string;
  roles: UserRole[];
  usageLimits?: UsageLimits;
  deactivated?: boolean;
}
