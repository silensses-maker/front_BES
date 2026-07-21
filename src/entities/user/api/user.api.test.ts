import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { toast } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { i18n } from "@/shared/i18n";
import { logger } from "@/shared/lib/logger";
import { getRoleLimits } from "../lib/permissions";
import type { UsageLimits, User } from "../types/user.types";
import { userApi } from "./user.api";

// ─── Module mocks ────────────────────────────────────────────────────────────

vi.mock("firebase/firestore", () => ({
  collection: vi.fn(),
  deleteDoc: vi.fn(),
  doc: vi.fn(),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  query: vi.fn(),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  where: vi.fn(),
}));

vi.mock("@/shared/api/firebase", () => ({
  db: {},
}));

vi.mock("@/shared/lib/logger", () => ({
  logger: {
    error: vi.fn(),
  },
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
  },
}));

vi.mock("@/shared/i18n", () => ({
  i18n: {
    t: vi.fn((key: string) => key),
  },
}));

vi.mock("../lib/permissions", () => ({
  getRoleLimits: vi.fn(),
}));

// ─── Types ───────────────────────────────────────────────────────────────────

type MockDocumentSnapshot = {
  exists: () => boolean;
  data: () => Omit<User, "uid"> | undefined;
};

type MockQuerySnapshot = {
  empty: boolean;
  docs: MockDocumentSnapshot[];
};

// ─── Fixtures ────────────────────────────────────────────────────────────────

const mockUsageLimits: UsageLimits = {
  maxAgents: 1000,
  maxIterations: 1000,
  densityFactor: 0.75,
};

const mockUser: User = {
  uid: "uid-researcher",
  email: "researcher@univalle.edu.co",
  name: "Researcher",
  photo: "",
  roles: ["Researcher"],
};

const _mockUserWithLimits: User = {
  ...mockUser,
  usageLimits: mockUsageLimits,
};

function makeDocSnap(exists: boolean, data?: Omit<User, "uid">): MockDocumentSnapshot {
  return {
    exists: () => exists,
    data: () => data,
  };
}

function makeQuerySnap(docs: MockDocumentSnapshot[]): MockQuerySnapshot {
  return {
    empty: docs.length === 0,
    docs,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("userApi", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(collection).mockReturnValue({} as ReturnType<typeof collection>);
    vi.mocked(doc).mockReturnValue({} as ReturnType<typeof doc>);
    vi.mocked(query).mockReturnValue({} as ReturnType<typeof query>);
    vi.mocked(where).mockReturnValue({} as ReturnType<typeof where>);
  });

  describe("getById", () => {
    it("returns User with uid when document exists", async () => {
      const { uid, ...userData } = mockUser;
      vi.mocked(getDoc).mockResolvedValue(
        makeDocSnap(true, userData) as Awaited<ReturnType<typeof getDoc>>,
      );

      const result = await userApi.getById(uid);

      expect(result).toEqual(mockUser);
    });

    it("returns null when document does not exist", async () => {
      vi.mocked(getDoc).mockResolvedValue(makeDocSnap(false) as Awaited<ReturnType<typeof getDoc>>);

      const result = await userApi.getById("uid-missing");

      expect(result).toBeNull();
    });

    it("catches error, logs, toasts, and returns null on Firestore exception", async () => {
      const err = new Error("getDoc failed");
      vi.mocked(getDoc).mockRejectedValue(err);

      const result = await userApi.getById("uid-researcher");

      expect(logger.error).toHaveBeenCalledWith("userApi.getById", err);
      expect(toast.error).toHaveBeenCalled();
      expect(i18n.t).toHaveBeenCalledWith("user.errorGet");
      expect(result).toBeNull();
    });
  });

  describe("getByEmail", () => {
    it("returns User when document with email exists", async () => {
      const snap = makeQuerySnap([makeDocSnap(true, mockUser)]);
      vi.mocked(getDocs).mockResolvedValue(snap as Awaited<ReturnType<typeof getDocs>>);

      const result = await userApi.getByEmail(mockUser.email);

      expect(result).toEqual(mockUser);
    });

    it("returns null when query returns empty snapshot", async () => {
      const snap = makeQuerySnap([]);
      vi.mocked(getDocs).mockResolvedValue(snap as Awaited<ReturnType<typeof getDocs>>);

      const result = await userApi.getByEmail("nobody@example.com");

      expect(result).toBeNull();
    });

    it("catches error, logs, toasts, and returns null on Firestore exception", async () => {
      const err = new Error("getDocs failed");
      vi.mocked(getDocs).mockRejectedValue(err);

      const result = await userApi.getByEmail("researcher@univalle.edu.co");

      expect(logger.error).toHaveBeenCalledWith("userApi.getByEmail", err);
      expect(toast.error).toHaveBeenCalled();
      expect(i18n.t).toHaveBeenCalledWith("user.errorGetByEmail");
      expect(result).toBeNull();
    });
  });

  describe("create", () => {
    beforeEach(() => {
      vi.mocked(getRoleLimits).mockReturnValue(mockUsageLimits);
      vi.mocked(setDoc).mockResolvedValue(undefined);
    });

    it("creates document and returns true when user does not exist", async () => {
      vi.mocked(getDoc).mockResolvedValue(makeDocSnap(false) as Awaited<ReturnType<typeof getDoc>>);

      const result = await userApi.create(mockUser);

      expect(setDoc).toHaveBeenCalledOnce();
      expect(result).toBe(true);
    });

    it("returns false when user already exists", async () => {
      const { uid, ...userData } = mockUser;
      vi.mocked(getDoc).mockResolvedValue(
        makeDocSnap(true, userData) as Awaited<ReturnType<typeof getDoc>>,
      );

      const result = await userApi.create(mockUser);

      expect(setDoc).not.toHaveBeenCalled();
      expect(result).toBe(false);
    });

    it("calls getRoleLimits with user.roles to populate usageLimits", async () => {
      vi.mocked(getDoc).mockResolvedValue(makeDocSnap(false) as Awaited<ReturnType<typeof getDoc>>);

      await userApi.create(mockUser);

      expect(getRoleLimits).toHaveBeenCalledWith(mockUser.roles);
      expect(setDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ usageLimits: mockUsageLimits }),
      );
    });

    it("catches error, logs, toasts, and returns false on write failure", async () => {
      vi.mocked(getDoc).mockResolvedValue(makeDocSnap(false) as Awaited<ReturnType<typeof getDoc>>);
      const err = new Error("setDoc failed");
      vi.mocked(setDoc).mockRejectedValue(err);

      const result = await userApi.create(mockUser);

      expect(logger.error).toHaveBeenCalledWith("userApi.create", err);
      expect(toast.error).toHaveBeenCalled();
      expect(i18n.t).toHaveBeenCalledWith("user.errorCreate");
      expect(result).toBe(false);
    });
  });

  describe("update", () => {
    it("returns true on successful updateDoc", async () => {
      vi.mocked(updateDoc).mockResolvedValue(undefined);

      const result = await userApi.update(mockUser.uid, { name: "Updated Name" });

      expect(updateDoc).toHaveBeenCalledOnce();
      expect(result).toBe(true);
    });

    it("accepts partial data and passes it to updateDoc", async () => {
      vi.mocked(updateDoc).mockResolvedValue(undefined);
      const partial: Partial<Omit<User, "uid">> = {
        photo: "https://new-photo.jpg",
        roles: ["BaseUser"],
      };

      await userApi.update(mockUser.uid, partial);

      expect(updateDoc).toHaveBeenCalledWith(expect.anything(), partial);
    });

    it("catches error, logs, toasts, and returns false on write failure", async () => {
      const err = new Error("updateDoc failed");
      vi.mocked(updateDoc).mockRejectedValue(err);

      const result = await userApi.update(mockUser.uid, { name: "Fail" });

      expect(logger.error).toHaveBeenCalledWith("userApi.update", err);
      expect(toast.error).toHaveBeenCalled();
      expect(i18n.t).toHaveBeenCalledWith("user.errorUpdate");
      expect(result).toBe(false);
    });
  });

  describe("remove", () => {
    it("returns true on successful deleteDoc", async () => {
      vi.mocked(deleteDoc).mockResolvedValue(undefined);

      const result = await userApi.remove(mockUser.uid);

      expect(deleteDoc).toHaveBeenCalledOnce();
      expect(result).toBe(true);
    });

    it("catches error, logs, toasts, and returns false on write failure", async () => {
      const err = new Error("deleteDoc failed");
      vi.mocked(deleteDoc).mockRejectedValue(err);

      const result = await userApi.remove(mockUser.uid);

      expect(logger.error).toHaveBeenCalledWith("userApi.remove", err);
      expect(toast.error).toHaveBeenCalled();
      expect(i18n.t).toHaveBeenCalledWith("user.errorDelete");
      expect(result).toBe(false);
    });
  });
});
