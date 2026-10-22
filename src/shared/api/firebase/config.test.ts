import { initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth } from "firebase/auth";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ─── Module mocks ────────────────────────────────────────────────────────────

vi.mock("firebase/app", () => ({
  initializeApp: vi.fn(),
}));

vi.mock("firebase/auth", () => ({
  getAuth: vi.fn(),
  connectAuthEmulator: vi.fn(),
}));

// ─── Types ───────────────────────────────────────────────────────────────────

type MockFirebaseApp = { name: string };
type MockAuth = { currentUser: null };

// ─── Fixtures ────────────────────────────────────────────────────────────────

const mockApp: MockFirebaseApp = { name: "[DEFAULT]" };
const mockAuth: MockAuth = { currentUser: null };

const mockEnv = {
  PUBLIC_FIREBASE_API_KEY: "test-api-key",
  PUBLIC_FIREBASE_AUTH_DOMAIN: "test-project.firebaseapp.com",
  PUBLIC_FIREBASE_PROJECT_ID: "test-project",
  PUBLIC_FIREBASE_STORAGE_BUCKET: "test-project.appspot.com",
  PUBLIC_FIREBASE_MESSAGING_SENDER_ID: "123456789",
  PUBLIC_FIREBASE_APP_ID: "1:123456789:web:abc123",
};

// ─── Tests ───────────────────────────────────────────────────────────────────

// config.ts reads environment variables and calls initializeApp at module load
// time, so each test stubs env vars and resets modules before importing.

describe("firebase/config", () => {
  beforeEach(() => {
    vi.mocked(initializeApp).mockReturnValue(
      mockApp as unknown as ReturnType<typeof initializeApp>,
    );
    vi.mocked(getAuth).mockReturnValue(mockAuth as unknown as ReturnType<typeof getAuth>);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  describe("auth", () => {
    it("is defined and exported", async () => {
      for (const [key, value] of Object.entries(mockEnv)) {
        vi.stubEnv(key, value);
      }
      const { auth } = await import("./config");
      expect(auth).toBeDefined();
    });

    it("is the result of getAuth call", async () => {
      for (const [key, value] of Object.entries(mockEnv)) {
        vi.stubEnv(key, value);
      }
      const { auth } = await import("./config");
      expect(auth).toBe(mockAuth);
    });
  });

  describe("Firestore", () => {
    it("is not initialized nor exported (Firebase is only used for Authentication)", async () => {
      for (const [key, value] of Object.entries(mockEnv)) {
        vi.stubEnv(key, value);
      }
      const config = await import("./config");
      expect(Object.keys(config)).toEqual(["auth"]);
    });
  });

  describe("Config initialization", () => {
    it("reads environment variables and passes config to initializeApp", async () => {
      for (const [key, value] of Object.entries(mockEnv)) {
        vi.stubEnv(key, value);
      }
      await import("./config");

      expect(initializeApp).toHaveBeenCalledWith({
        apiKey: mockEnv.PUBLIC_FIREBASE_API_KEY,
        authDomain: mockEnv.PUBLIC_FIREBASE_AUTH_DOMAIN,
        projectId: mockEnv.PUBLIC_FIREBASE_PROJECT_ID,
        storageBucket: mockEnv.PUBLIC_FIREBASE_STORAGE_BUCKET,
        messagingSenderId: mockEnv.PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
        appId: mockEnv.PUBLIC_FIREBASE_APP_ID,
      });
    });

    it("does not connect to the Auth emulator: only `rsbuild dev` with PUBLIC_AUTH_EMULATOR=true compiles it in", async () => {
      for (const [key, value] of Object.entries(mockEnv)) {
        vi.stubEnv(key, value);
      }
      // The env variables alone change nothing: the build-time flag (false here, as in every
      // production build) decides, and its branch is dead code.
      vi.stubEnv("PUBLIC_AUTH_EMULATOR", "true");
      vi.stubEnv("PUBLIC_AUTH_EMULATOR_URL", "http://127.0.0.1:9099");
      await import("./config");

      expect(__AUTH_EMULATOR__).toBe(false);
      expect(connectAuthEmulator).not.toHaveBeenCalled();
    });

    it("chains getAuth on the initialized app", async () => {
      for (const [key, value] of Object.entries(mockEnv)) {
        vi.stubEnv(key, value);
      }
      await import("./config");

      expect(getAuth).toHaveBeenCalledWith(mockApp);
    });
  });
});
