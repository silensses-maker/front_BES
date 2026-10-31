import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { AdminUser } from "@/shared/api/backend";
import { UsersTable } from "./users-table";

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@/shared/api/firebase", () => ({ auth: {} }));

vi.mock("@/shared/i18n", () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key}:${JSON.stringify(params)}` : key,
    i18n: { language: "en" },
  }),
}));

// Radix Tooltip requires pointer-events which happy-dom doesn't fully provide.
vi.mock("@/shared/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeUser(uid: string, overrides: Partial<AdminUser> = {}): AdminUser {
  return {
    uid,
    email: `${uid}@univalle.edu.co`,
    name: uid,
    photo: null,
    roles: ["Guest"],
    effectiveRole: "Guest",
    usageLimits: { maxAgents: 10, maxIterations: 10, densityFactor: 0.5, maxNetworks: 1 },
    deactivated: false,
    createdAt: "2026-10-31T12:00:00Z",
    updatedAt: "2026-10-31T12:00:00Z",
    ...overrides,
  };
}

const self = makeUser("self", {
  name: "Super",
  roles: ["Guest", "SuperAdministrator"],
  effectiveRole: "SuperAdministrator",
  usageLimits: { maxAgents: null, maxIterations: null, densityFactor: 1, maxNetworks: null },
});
const ada = makeUser("ada", { name: "Ada" });
const bob = makeUser("bob", { name: "Bob", deactivated: true });

function renderTable(
  users: AdminUser[],
  overrides: Partial<Parameters<typeof UsersTable>[0]> = {},
) {
  const props = {
    users,
    loading: false,
    query: "",
    mutatingUid: null,
    currentUid: "self",
    catalog: [],
    onRequestRoleChange: vi.fn(),
    onRequestDeactivate: vi.fn(),
    onRequestReactivate: vi.fn(),
    ...overrides,
  };
  render(<UsersTable {...props} />);
  return props;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("UsersTable", () => {
  it("shows the empty state, and the search variant when a query is set", () => {
    renderTable([]);
    expect(screen.getByText("adminUsers.empty")).toBeInTheDocument();
  });

  it("names the query in the empty state of a search", () => {
    renderTable([], { query: " ada " });
    expect(screen.getByText('adminUsers.emptySearch:{"query":"ada"}')).toBeInTheDocument();
  });

  it("shows the loading message instead of the empty state while loading", () => {
    renderTable([], { loading: true });
    expect(screen.getByText("adminUsers.loading")).toBeInTheDocument();
  });

  it("locks the caller's own row and marks it", () => {
    renderTable([self, ada]);
    const ownRow = screen.getByText("adminUsers.you").closest("tr");
    if (!ownRow) throw new Error("own row not found");

    expect(within(ownRow).getByRole("combobox")).toBeDisabled();
    expect(within(ownRow).getByRole("button", { name: "adminUsers.deactivate" })).toBeDisabled();
    expect(within(ownRow).getByText("adminUsers.cannotEditSelf")).toBeInTheDocument();

    const adaRow = screen.getByText("Ada").closest("tr");
    if (!adaRow) throw new Error("Ada row not found");
    expect(within(adaRow).getByRole("combobox")).toBeEnabled();
    expect(within(adaRow).getByRole("button", { name: "adminUsers.deactivate" })).toBeEnabled();
  });

  it("renders unlimited quotas as ∞ titled Unlimited and numbers localized", () => {
    renderTable([self, ada]);
    const ownRow = screen.getByText("adminUsers.you").closest("tr");
    if (!ownRow) throw new Error("own row not found");
    expect(within(ownRow).getAllByTitle("common.unlimited")).toHaveLength(3);
    const adaRow = screen.getByText("Ada").closest("tr");
    if (!adaRow) throw new Error("Ada row not found");
    expect(within(adaRow).getByTitle("adminUsers.quotasHint").textContent).toBe(
      "10 · 10 · 1 · ×0.50",
    );
  });

  it("offers Reactivate on a deactivated account and asks for confirmation", () => {
    const props = renderTable([bob]);
    expect(screen.getByText("adminUsers.statusDeactivated")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "adminUsers.reactivate" }));

    expect(props.onRequestReactivate).toHaveBeenCalledWith(bob);
    expect(props.onRequestDeactivate).not.toHaveBeenCalled();
  });

  it("asks for confirmation before deactivating an active account", () => {
    const props = renderTable([ada]);
    expect(screen.getByText("adminUsers.statusActive")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "adminUsers.deactivate" }));

    expect(props.onRequestDeactivate).toHaveBeenCalledWith(ada);
  });

  it("disables the row being mutated", () => {
    renderTable([ada], { mutatingUid: "ada" });
    const adaRow = screen.getByText("Ada").closest("tr");
    if (!adaRow) throw new Error("Ada row not found");
    expect(adaRow).toHaveAttribute("aria-busy", "true");
    expect(within(adaRow).getByRole("combobox")).toBeDisabled();
    expect(within(adaRow).getByRole("button", { name: "adminUsers.deactivate" })).toBeDisabled();
  });
});
