import type { User as FirebaseUser } from "firebase/auth";
import type { UsageLimits as BackendUsageLimits, UserInfoResponse } from "@/shared/api/backend";
import type { UsageLimits, User } from "../types/user.types";

/** Identity of the Firebase Authentication user: the only source of email, name and photo. */
export type FirebaseIdentity = Pick<FirebaseUser, "uid" | "email" | "displayName" | "photoURL">;

/**
 * Authorization from `POST /api/users/sync` or `GET /api/users/info/{uid}` (Postgres): the only
 * source of roles, quotas and `deactivated`. The `name`/`email`/`photo` those responses also carry
 * are the backend's mirror of the token and are ignored.
 */
export type BackendAuthorization = Pick<UserInfoResponse, "roles" | "usageLimits" | "deactivated">;

/**
 * Backend quotas → session quotas. `null` means unlimited and becomes Infinity; an absent
 * `maxNetworks` (backend without #122) stays absent so consumers fall back to the role table
 * (`resolveMaxNetworks`).
 */
export function mapBackendUsageLimits(limits: BackendUsageLimits): UsageLimits {
  const { maxNetworks } = limits;
  return {
    maxAgents: limits.maxAgents ?? Infinity,
    maxIterations: limits.maxIterations ?? Infinity,
    densityFactor: limits.densityFactor,
    ...(maxNetworks === undefined ? {} : { maxNetworks: maxNetworks ?? Infinity }),
  };
}

/**
 * Session user: identity from Firebase Authentication, authorization from the backend. Without
 * the backend (`null`: unreachable) roles stay empty and the limits undefined, so the role-table
 * fallbacks (`getRoleLimits`, `resolveMaxNetworks`) apply.
 */
export function toSessionUser(
  identity: FirebaseIdentity,
  authorization: BackendAuthorization | null,
): User {
  const user: User = {
    uid: identity.uid,
    email: identity.email ?? "",
    name: identity.displayName ?? "",
    photo: identity.photoURL ?? "",
    roles: authorization?.roles ?? [],
  };
  if (!authorization) return user;
  return {
    ...user,
    usageLimits: mapBackendUsageLimits(authorization.usageLimits),
    deactivated: authorization.deactivated,
  };
}
