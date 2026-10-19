import { describe, expect, it } from "vitest";
import type { UserSyncResponse } from "@/shared/api/backend";
import { getRoleLimits, resolveMaxNetworks } from "../lib/permissions";
import { type FirebaseIdentity, mapBackendUsageLimits, toSessionUser } from "./user.mapper";

// ─── Fixtures ────────────────────────────────────────────────────────────────

const syncResponse: UserSyncResponse = {
  uid: "uid-123",
  email: "mirror@example.com",
  name: "Backend Mirror Name",
  photo: "https://example.com/backend.jpg",
  roles: ["BaseUser"],
  usageLimits: { maxAgents: 100, maxIterations: 100, densityFactor: 0.5, maxNetworks: 5 },
  deactivated: false,
};

const identity: FirebaseIdentity = {
  uid: "uid-123",
  email: "user@example.com",
  displayName: "Edited Name",
  photoURL: "https://example.com/google.jpg",
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("mapBackendUsageLimits", () => {
  it("passes numeric limits through", () => {
    expect(mapBackendUsageLimits(syncResponse.usageLimits)).toEqual({
      maxAgents: 100,
      maxIterations: 100,
      densityFactor: 0.5,
      maxNetworks: 5,
    });
  });

  it("maps null (unlimited) limits to Infinity, maxNetworks included", () => {
    expect(
      mapBackendUsageLimits({
        maxAgents: null,
        maxIterations: null,
        densityFactor: 1.0,
        maxNetworks: null,
      }),
    ).toEqual({
      maxAgents: Infinity,
      maxIterations: Infinity,
      densityFactor: 1.0,
      maxNetworks: Infinity,
    });
  });

  it("omits maxNetworks when the backend does not send it, so the role table applies", () => {
    const limits = mapBackendUsageLimits({
      maxAgents: 100,
      maxIterations: 100,
      densityFactor: 0.5,
    });

    expect(limits).not.toHaveProperty("maxNetworks");
    expect(resolveMaxNetworks({ roles: ["BaseUser"], usageLimits: limits })).toBe(
      getRoleLimits(["BaseUser"]).maxNetworks,
    );
  });
  it("returns undefined when the backend sends no usageLimits (backend older than #122)", () => {
    expect(mapBackendUsageLimits(undefined)).toBeUndefined();
  });
});

describe("toSessionUser", () => {
  it("takes identity from Firebase and authorization from the backend", () => {
    expect(toSessionUser(identity, syncResponse)).toEqual({
      uid: "uid-123",
      email: "user@example.com",
      name: "Edited Name",
      photo: "https://example.com/google.jpg",
      roles: ["BaseUser"],
      usageLimits: { maxAgents: 100, maxIterations: 100, densityFactor: 0.5, maxNetworks: 5 },
      deactivated: false,
    });
  });

  it("never reads name, email or photo from the backend mirror", () => {
    const user = toSessionUser(identity, syncResponse);

    expect(user.name).not.toBe(syncResponse.name);
    expect(user.email).not.toBe(syncResponse.email);
    expect(user.photo).not.toBe(syncResponse.photo);
  });

  it("maps null Firebase identity fields to empty strings", () => {
    const user = toSessionUser(
      { uid: "uid-123", email: null, displayName: null, photoURL: null },
      syncResponse,
    );

    expect(user).toMatchObject({ email: "", name: "", photo: "" });
  });

  it("maps unlimited backend limits to Infinity", () => {
    const user = toSessionUser(identity, {
      roles: ["Administrator"],
      usageLimits: { maxAgents: null, maxIterations: null, densityFactor: 1.0, maxNetworks: null },
      deactivated: false,
    });

    expect(user.usageLimits).toEqual({
      maxAgents: Infinity,
      maxIterations: Infinity,
      densityFactor: 1.0,
      maxNetworks: Infinity,
    });
  });

  it("passes the backend's deactivated flag through", () => {
    expect(toSessionUser(identity, { ...syncResponse, deactivated: true }).deactivated).toBe(true);
  });

  it("without the backend keeps the identity with empty roles and no limits", () => {
    const user = toSessionUser(identity, null);

    expect(user).toEqual({
      uid: "uid-123",
      email: "user@example.com",
      name: "Edited Name",
      photo: "https://example.com/google.jpg",
      roles: [],
    });
    expect(user).not.toHaveProperty("usageLimits");
    expect(user).not.toHaveProperty("deactivated");
    // The role-table fallbacks then apply (Guest).
    expect(getRoleLimits(user.roles)).toEqual(getRoleLimits(["Guest"]));
    expect(resolveMaxNetworks(user)).toBe(getRoleLimits(["Guest"]).maxNetworks);
  });

  it("does not crash when the backend omits usageLimits; the role-table fallbacks apply", () => {
    const { usageLimits: _omitted, ...withoutLimits } = syncResponse;
    const user = toSessionUser(identity, withoutLimits as typeof syncResponse);
    expect(user.roles).toEqual(["BaseUser"]);
    expect(user.usageLimits).toBeUndefined();
    expect(getRoleLimits(user.roles)).toEqual(getRoleLimits(["BaseUser"]));
    expect(resolveMaxNetworks(user)).toBe(getRoleLimits(["BaseUser"]).maxNetworks);
  });
});
