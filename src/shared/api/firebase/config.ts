import { initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: import.meta.env.PUBLIC_FIREBASE_API_KEY,
  authDomain: import.meta.env.PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.PUBLIC_FIREBASE_APP_ID,
};

// Bench builds only (#126): a copy without any Firebase env (no .env.production) must still open
// /bench, which needs no login. getAuth() throws auth/invalid-api-key at startup without a key, so
// a placeholder lets it initialise; signing in will not work. Compiled out of normal builds.
if (__BENCHMARK__ && !firebaseConfig.apiKey) firebaseConfig.apiKey = "bench-without-firebase-env";

const app = initializeApp(firebaseConfig);

// Firebase is only the identity bridge: Authentication, no Firestore.
export const auth = getAuth(app);

// Firebase Auth Emulator, local development only (README, "Local auth emulator"):
// `__AUTH_EMULATOR__` is true only in `rsbuild dev` with PUBLIC_AUTH_EMULATOR=true
// (rsbuild.config.ts), so every other build compiles this call out. The emulator's warnings stay
// on: the SDK logs that it is in emulator mode and shows its banner on the page.
if (__AUTH_EMULATOR__) {
  connectAuthEmulator(auth, import.meta.env.PUBLIC_AUTH_EMULATOR_URL ?? "http://127.0.0.1:9099", {
    disableWarnings: false,
  });
}
