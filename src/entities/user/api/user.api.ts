import {
  type CollectionReference,
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
import { db } from "@/shared/api/firebase";
import { i18n } from "@/shared/i18n";
import { logger } from "@/shared/lib/logger";
import { getRoleLimits } from "../lib/permissions";
import type { User } from "../types/user.types";

const COLLECTION_NAME = "users";

function getUsersCollection(): CollectionReference {
  return collection(db, COLLECTION_NAME);
}

function getUserDocRef(uid: string) {
  return doc(getUsersCollection(), uid);
}

export const userApi = {
  async getById(uid: string): Promise<User | null> {
    try {
      const snap = await getDoc(getUserDocRef(uid));
      return snap.exists() ? ({ uid, ...snap.data() } as User) : null;
    } catch (error) {
      logger.error("userApi.getById", error);
      toast.error(i18n.t("user.errorGet"));
      return null;
    }
  },

  async getByEmail(email: string): Promise<User | null> {
    try {
      const q = query(getUsersCollection(), where("email", "==", email));
      const snap = await getDocs(q);
      return snap.empty || !snap.docs[0] ? null : (snap.docs[0].data() as User);
    } catch (error) {
      logger.error("userApi.getByEmail", error);
      toast.error(i18n.t("user.errorGetByEmail"));
      return null;
    }
  },

  async create(user: User): Promise<boolean> {
    try {
      const existing = await userApi.getById(user.uid);
      if (existing) return false;

      await setDoc(getUserDocRef(user.uid), {
        email: user.email,
        name: user.name,
        photo: user.photo,
        roles: user.roles,
        usageLimits: getRoleLimits(user.roles),
      });
      return true;
    } catch (error) {
      logger.error("userApi.create", error);
      toast.error(i18n.t("user.errorCreate"));
      return false;
    }
  },

  async update(uid: string, data: Partial<Omit<User, "uid">>): Promise<boolean> {
    try {
      await updateDoc(getUserDocRef(uid), data);
      return true;
    } catch (error) {
      logger.error("userApi.update", error);
      toast.error(i18n.t("user.errorUpdate"));
      return false;
    }
  },

  async remove(uid: string): Promise<boolean> {
    try {
      await deleteDoc(getUserDocRef(uid));
      return true;
    } catch (error) {
      logger.error("userApi.remove", error);
      toast.error(i18n.t("user.errorDelete"));
      return false;
    }
  },
};
