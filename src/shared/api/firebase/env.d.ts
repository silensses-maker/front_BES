/// <reference types="@rsbuild/core/types" />

declare module "rsbuild/client" {
  interface PublicEnv {
    PUBLIC_FIREBASE_API_KEY: string;
    PUBLIC_FIREBASE_AUTH_DOMAIN: string;
    PUBLIC_FIREBASE_PROJECT_ID: string;
    PUBLIC_FIREBASE_STORAGE_BUCKET: string;
    PUBLIC_FIREBASE_MESSAGING_SENDER_ID: string;
    PUBLIC_FIREBASE_APP_ID: string;
    PUBLIC_BACKEND_URL: string;
    /** Dev only: "true" connects `rsbuild dev` to the Firebase Auth emulator (rsbuild.config.ts). */
    PUBLIC_AUTH_EMULATOR?: string;
    /** Dev only: the Auth emulator's URL; default http://127.0.0.1:9099. */
    PUBLIC_AUTH_EMULATOR_URL?: string;
  }
}
