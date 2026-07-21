export type UserRole = "Administrator" | "Researcher" | "BaseUser" | "Guest";

export interface UsageLimits {
  maxAgents: number;
  maxIterations: number;
  densityFactor: number;
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
