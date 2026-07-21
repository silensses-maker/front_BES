// import { cert, initializeApp } from "firebase-admin/app";
// import { getFirestore } from "firebase-admin/firestore";
// import serviceAccount from "../../serviceAccount.json";

// type UserRole = "Administrator" | "Researcher" | "BaseUser" | "Guest";

// const ROLE_LIMITS = {
//   Administrator: { maxAgents: Infinity, maxIterations: Infinity, densityFactor: 1.0 },
//   Researcher: { maxAgents: 1000, maxIterations: 1000, densityFactor: 0.75 },
//   BaseUser: { maxAgents: 100, maxIterations: 100, densityFactor: 0.5 },
//   Guest: { maxAgents: 10, maxIterations: 10, densityFactor: 0.5 },
// };

// function getRoleLimits(roles: UserRole[]) {
//   const priority: UserRole[] = ["Administrator", "Researcher", "BaseUser", "Guest"];
//   const highestRole = priority.find((r) => roles.includes(r)) ?? "Guest";
//   return ROLE_LIMITS[highestRole];
// }

// function isEmpty(obj: object) {
//   return Object.keys(obj).length === 0;
// }

// initializeApp({ credential: cert(serviceAccount as object) });

// const db = getFirestore();

// async function migrate() {
//   const snapshot = await db.collection("users").get();

//   let updated = 0;
//   let skipped = 0;

//   for (const doc of snapshot.docs) {
//     const data = doc.data();
//     const usageLimits = data.usageLimits ?? {};

//     if (!isEmpty(usageLimits)) {
//       skipped++;
//       continue;
//     }

//     const limits = getRoleLimits(data.roles as UserRole[]);
//     await doc.ref.update({ usageLimits: limits });
//     console.log(`✅ ${data.email} → ${data.roles[0]}`);
//     updated++;
//   }

//   console.log(`\nDone: ${updated} updated, ${skipped} skipped`);
// }

// // biome-ignore lint/suspicious/noConsole: intentional console output for migration script
// migrate().catch(console.error);
