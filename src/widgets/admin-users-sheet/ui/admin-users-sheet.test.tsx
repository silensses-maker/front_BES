import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { type User, useAuthStore } from "@/entities/user";
import { useAdminUsersSheetStore } from "@/shared/model/admin-users-sheet.store";
import { AdminUsersSheet } from "./admin-users-sheet";

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@/shared/api/firebase", () => ({ auth: {} }));

vi.mock("@/shared/i18n", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en" } }),
}));

// The sheet only hosts the feature; the feature is tested in its own slice.
vi.mock("@/features/admin-users", () => ({
  AdminUsersPanel: ({ showHeader }: { showHeader?: boolean }) => (
    <p>panel header={String(showHeader)}</p>
  ),
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

function user(roles: User["roles"]): User {
  return { uid: "uid-1", email: "a@b.co", name: "A", photo: "", roles };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("AdminUsersSheet", () => {
  beforeEach(() => {
    useAdminUsersSheetStore.setState({ isOpen: false });
    useAuthStore.setState({ user: user(["Guest", "SuperAdministrator"]), loading: false });
  });

  it("is closed until the store opens it, then shows the title and the panel without its header", async () => {
    render(<AdminUsersSheet />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    act(() => useAdminUsersSheetStore.getState().open());
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("adminUsers.title")).toBeInTheDocument();
    expect(screen.getByText("adminUsers.description")).toBeInTheDocument();
    expect(await screen.findByText("panel header=false")).toBeInTheDocument();
  });

  it("closes through the store", async () => {
    useAdminUsersSheetStore.setState({ isOpen: true });
    render(<AdminUsersSheet />);
    expect(await screen.findByRole("dialog")).toBeInTheDocument();

    act(() => useAdminUsersSheetStore.getState().close());
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("never opens for a user without the SuperAdministrator role", () => {
    useAuthStore.setState({ user: user(["Guest", "Administrator"]) });
    useAdminUsersSheetStore.setState({ isOpen: true });
    render(<AdminUsersSheet />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
