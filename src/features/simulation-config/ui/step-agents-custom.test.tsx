import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { AgentSpec, EdgeSpec } from "@/shared/api/backend";
import type { CustomSimFormValues } from "../types/simulation-config.types";
import { StepAgentsCustom } from "./step-agents-custom";

// ─── Mocks ────────────────────────────────────────────────────────────────────

// Keep i18n deterministic without loading the real locale files.
vi.mock("@/shared/i18n", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: "en" },
  }),
}));

vi.mock("sonner", () => ({
  toast: { warning: vi.fn() },
}));

// Radix Tooltip requires pointer-events which happy-dom doesn't fully provide.
vi.mock("@/shared/ui/tooltip", () => ({
  TooltipProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children, asChild }: { children: React.ReactNode; asChild?: boolean }) =>
    asChild ? <>{children}</> : <span>{children}</span>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

const DUPLICATE_MESSAGE = "simulationConfig.errorCustomAgentNameDuplicate";

function agent(name: string): AgentSpec {
  return {
    name,
    belief: 0.5,
    toleranceRadius: 0.2,
    toleranceOffset: 0,
    silenceStrategy: 0,
    silenceEffect: 0,
  };
}

function customValues(names: string[], edges: EdgeSpec[] = []): CustomSimFormValues {
  return {
    networkType: "custom",
    networkName: "Net",
    iterationLimit: 100,
    stopThreshold: 0.01,
    saveMode: 1,
    agents: names.map(agent),
    edges,
  };
}

function nameInputs(): HTMLInputElement[] {
  return screen.getAllByPlaceholderText(
    "simulationConfig.customAgentNamePlaceholder",
  ) as HTMLInputElement[];
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("StepAgentsCustom — duplicate agent names (#122)", () => {
  it("marks every input sharing a name with aria-invalid and an inline message", () => {
    render(
      <StepAgentsCustom values={customValues(["A", "B", "A"])} errors={{}} onUpdate={vi.fn()} />,
    );

    const inputs = nameInputs();
    expect(inputs[0]).toHaveAttribute("aria-invalid", "true");
    expect(inputs[1]).not.toHaveAttribute("aria-invalid");
    expect(inputs[2]).toHaveAttribute("aria-invalid", "true");
    expect(screen.getAllByText(DUPLICATE_MESSAGE)).toHaveLength(2);
  });

  it("does not flag names that differ only by case, nor empty names", () => {
    render(
      <StepAgentsCustom
        values={customValues(["Alice", "alice", "", ""])}
        errors={{}}
        onUpdate={vi.fn()}
      />,
    );

    for (const input of nameInputs()) expect(input).not.toHaveAttribute("aria-invalid");
    expect(screen.queryByText(DUPLICATE_MESSAGE)).not.toBeInTheDocument();
  });

  it("leaves the edges with the other agent when a duplicated name is renamed", () => {
    const onUpdate = vi.fn();
    const edges: EdgeSpec[] = [{ source: "A", target: "B", influence: 1, bias: 0 }];
    render(
      <StepAgentsCustom
        values={customValues(["A", "B", "A"], edges)}
        errors={{}}
        onUpdate={onUpdate}
      />,
    );

    fireEvent.change(nameInputs()[2]!, { target: { value: "C" } });

    expect(onUpdate).toHaveBeenCalledWith({ agents: [agent("A"), agent("B"), agent("C")] });
  });

  it("still carries the edges along when a unique name is renamed", () => {
    const onUpdate = vi.fn();
    const edges: EdgeSpec[] = [{ source: "A", target: "B", influence: 1, bias: 0 }];
    render(
      <StepAgentsCustom values={customValues(["A", "B"], edges)} errors={{}} onUpdate={onUpdate} />,
    );

    fireEvent.change(nameInputs()[1]!, { target: { value: "D" } });

    expect(onUpdate).toHaveBeenCalledWith({
      agents: [agent("A"), agent("D")],
      edges: [{ source: "A", target: "D", influence: 1, bias: 0 }],
    });
  });
});

describe("StepAgentsCustom — naming an unnamed agent (#122)", () => {
  it("does not attach unfinished edges (empty source / target) to the agent being named", () => {
    const onUpdate = vi.fn();
    const edges: EdgeSpec[] = [
      { source: "A", target: "B", influence: 1, bias: 0 },
      { source: "", target: "", influence: 1, bias: 0 },
      { source: "A", target: "", influence: 1, bias: 0 },
    ];
    render(
      <StepAgentsCustom
        values={customValues(["A", "B", ""], edges)}
        errors={{}}
        onUpdate={onUpdate}
      />,
    );

    fireEvent.change(nameInputs()[2]!, { target: { value: "C" } });

    expect(onUpdate).toHaveBeenCalledWith({ agents: [agent("A"), agent("B"), agent("C")] });
  });
});
