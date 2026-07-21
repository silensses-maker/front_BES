import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ─── Module mocks ────────────────────────────────────────────────────────────

vi.mock("firebase/app", () => ({
  initializeApp: vi.fn(),
}));

vi.mock("firebase/auth", () => ({
  getAuth: vi.fn(),
}));

vi.mock("firebase/firestore", () => ({
  getFirestore: vi.fn(),
}));

// ─── Types ───────────────────────────────────────────────────────────────────

type MockFirebaseApp = { name: string };
type MockAuth = { currentUser: null };
type MockFirestore = { type: "firestore" };

// ─── Fixtures ────────────────────────────────────────────────────────────────

const mockApp: MockFirebaseApp = { name: "[DEFAULT]" };
const mockAuth: MockAuth = { currentUser: null };
const mockDb: MockFirestore = { type: "firestore" };

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
    vi.mocked(getFirestore).mockReturnValue(mockDb as unknown as ReturnType<typeof getFirestore>);
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

  describe("db", () => {
    it("is defined and exported", async () => {
      for (const [key, value] of Object.entries(mockEnv)) {
        vi.stubEnv(key, value);
      }
      const { db } = await import("./config");
      expect(db).toBeDefined();
    });

    it("is the result of getFirestore call", async () => {
      for (const [key, value] of Object.entries(mockEnv)) {
        vi.stubEnv(key, value);
      }
      const { db } = await import("./config");
      expect(db).toBe(mockDb);
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

    it("chains getAuth and getFirestore on the initialized app", async () => {
      for (const [key, value] of Object.entries(mockEnv)) {
        vi.stubEnv(key, value);
      }
      await import("./config");

      expect(getAuth).toHaveBeenCalledWith(mockApp);
      expect(getFirestore).toHaveBeenCalledWith(mockApp);
    });
  });
});
