import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { type User, useAuthStore } from "@/entities/user";
import { useProfileSheetStore } from "@/shared/model/profile-sheet.store";
import { ProfileSheet } from "./profile-sheet";

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@/shared/api/firebase", () => ({ auth: {} }));

vi.mock("@/shared/i18n", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en" } }),
}));

// The sheet only composes these features; their behaviour is tested in their own slices.
vi.mock("@/features/profile/deactivate-account", () => ({ DeactivateButton: () => null }));
vi.mock("@/features/profile/edit-display-name", () => ({ EditNameForm: () => null }));

// ─── Helpers ─────────────────────────────────────────────────────────────────

function user(overrides: Partial<User>): User {
  return {
    uid: "uid-1",
    email: "user@univalle.edu.co",
    name: "User",
    photo: "",
    roles: ["Guest"],
    ...overrides,
  };
}

/** Value shown next to a label of the usage limits. */
function limitValue(labelKey: string): string | null {
  const row = screen.getByText(labelKey).parentElement;
  if (!row) throw new Error(`${labelKey} row not found`);
  return within(row).getByText((_, el) => el?.classList.contains("font-mono") ?? false).textContent;
}

/** Value shown next to the "Networks" label of the usage limits. */
function networksValue(): string | null {
  return limitValue("profile.networksUsed");
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("ProfileSheet — networks quota (#122)", () => {
  beforeEach(() => {
    useProfileSheetStore.setState({ isOpen: true });
  });

  it("shows the session's numeric network cap", () => {
    useAuthStore.setState({
      user: user({
        roles: ["BaseUser"],
        usageLimits: { maxAgents: 100, maxIterations: 100, densityFactor: 0.5, maxNetworks: 5 },
      }),
    });

    render(<ProfileSheet />);

    expect(networksValue()).toBe("5");
  });

  it("shows Unlimited for an unlimited network cap", () => {
    useAuthStore.setState({
      user: user({
        roles: ["Administrator"],
        usageLimits: {
          maxAgents: Infinity,
          maxIterations: Infinity,
          densityFactor: 1.0,
          maxNetworks: Infinity,
        },
      }),
    });

    render(<ProfileSheet />);

    expect(networksValue()).toBe("common.unlimited");
  });

  it("falls back to the role table when the session predates maxNetworks", () => {
    useAuthStore.setState({
      user: user({
        roles: ["Researcher"],
        usageLimits: { maxAgents: 1000, maxIterations: 1000, densityFactor: 0.75 },
      }),
    });

    render(<ProfileSheet />);

    expect(networksValue()).toBe("20");
  });

  it("shows the Guest cap of a single network", () => {
    useAuthStore.setState({ user: user({ roles: ["Guest"] }) });

    render(<ProfileSheet />);

    expect(networksValue()).toBe("1");
  });

  it("renders the networks row between iterations and density factor", () => {
    useAuthStore.setState({ user: user({ roles: ["Guest"] }) });

    render(<ProfileSheet />);

    const labels = screen
      .getAllByText(/^profile\.(agentsUsed|iterationsUsed|networksUsed|densityFactorLabel)$/)
      .map((el) => el.textContent);
    expect(labels).toEqual([
      "profile.agentsUsed",
      "profile.iterationsUsed",
      "profile.networksUsed",
      "profile.densityFactorLabel",
    ]);
  });
});

describe("ProfileSheet — usage limits", () => {
  beforeEach(() => {
    useProfileSheetStore.setState({ isOpen: true });
  });

  it("shows the session's quotas, the ones the wizard validates, over the role table", () => {
    useAuthStore.setState({
      user: user({
        roles: ["Guest"],
        usageLimits: { maxAgents: 300, maxIterations: 250, densityFactor: 0.8, maxNetworks: 4 },
      }),
    });

    render(<ProfileSheet />);

    expect(limitValue("profile.agentsUsed")).toBe("300");
    expect(limitValue("profile.iterationsUsed")).toBe("250");
    expect(limitValue("profile.networksUsed")).toBe("4");
    expect(limitValue("profile.densityFactorLabel")).toBe("0.80");
  });

  it("falls back to the role table without session quotas", () => {
    useAuthStore.setState({ user: user({ roles: ["BaseUser"] }) });

    render(<ProfileSheet />);

    expect(limitValue("profile.agentsUsed")).toBe("100");
    expect(limitValue("profile.iterationsUsed")).toBe("100");
    expect(limitValue("profile.densityFactorLabel")).toBe("0.50");
  });

  it("shows the caps as values, with no usage meter (they do not run out with use)", () => {
    useAuthStore.setState({ user: user({ roles: ["Guest"] }) });

    render(<ProfileSheet />);

    expect(screen.queryAllByRole("progressbar")).toHaveLength(0);
    expect(screen.getAllByRole("term")).toHaveLength(4);
  });
});
