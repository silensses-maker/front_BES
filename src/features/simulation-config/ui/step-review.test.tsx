import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import en from "@/shared/i18n/locales/en";
import es from "@/shared/i18n/locales/es";
import { CONSENSUS_PURSUIT_TEMPLATE } from "../lib/templates";
import type { CustomSimFormValues, SimFormValues } from "../types/simulation-config.types";
import { StepReview } from "./step-review";

// ─── Mocks ────────────────────────────────────────────────────────────────────

// Keep i18n deterministic without loading the real locale files.
vi.mock("@/shared/i18n", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: "en" },
  }),
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

const customValues: CustomSimFormValues = {
  networkType: "custom",
  networkName: "Net",
  iterationLimit: 100,
  stopThreshold: 0.01,
  saveMode: 0,
  agents: [
    {
      name: "A",
      belief: 0.5,
      toleranceRadius: 0.2,
      toleranceOffset: 0,
      silenceStrategy: 0,
      silenceEffect: 0,
    },
  ],
  edges: [{ source: "A", target: "A", influence: 0.5, bias: 0 }],
};

function renderReview(values: SimFormValues, loadedFromFile = false) {
  render(
    <StepReview
      values={values}
      errors={{}}
      usageLimitError={null}
      loadedFromFile={loadedFromFile}
      onExport={vi.fn()}
      onImport={vi.fn()}
    />,
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("StepReview — what is stored (#133)", () => {
  it.each([
    ["generated", CONSENSUS_PURSUIT_TEMPLATE, false],
    ["custom", customValues, false],
    ["loaded from a file", CONSENSUS_PURSUIT_TEMPLATE, true],
  ] as const)("shows the storage note and no save-mode row (%s)", (_flow, values, loaded) => {
    renderReview(values, loaded);

    expect(screen.getByText("simulationConfig.storageNote")).toBeInTheDocument();
    expect(screen.queryByText(/saveMode/)).not.toBeInTheDocument();
  });

  it("has the note in both locales, stating the 60–90 minute replay window", () => {
    expect(en.simulationConfig.storageNote).toContain("60–90");
    expect(es.simulationConfig.storageNote).toContain("60–90");
  });
});
