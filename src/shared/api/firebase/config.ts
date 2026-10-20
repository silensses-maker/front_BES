import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

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
