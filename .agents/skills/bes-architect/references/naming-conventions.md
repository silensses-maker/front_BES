# Naming Conventions

- **Files:** kebab-case everywhere (`user.store.ts`, `login-button.tsx`, `use-edit-name.ts`).
- **Components:** PascalCase exports (`LoginButton`, `ProtectedRoute`).
- **Stores:** `use<Entity>Store` pattern (`useAuthStore`, `useSimulationStore`).
- **API modules:** object-based namespace (`userApi.getById()`, `simulationApi.start()`).
- **Hooks:** file `use-<name>.ts`, export `use<Name>`.
- **Slice public API:** always via `index.ts`. Export only what consumers need; everything else is internal.
- **Test files:** `<file>.test.ts(x)` next to the code under test.
