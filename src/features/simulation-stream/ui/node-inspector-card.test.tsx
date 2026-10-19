import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSimulationStore } from "@/entities/simulation";
import type { TopologyEdge, TopologyResponse } from "@/shared/api/backend";
import { i18n } from "@/shared/i18n";
import en from "@/shared/i18n/locales/en";
import es from "@/shared/i18n/locales/es";
import { NodeInspectorCard } from "./node-inspector-card";

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@/shared/api/firebase", () => ({ auth: {} }));

// Radix Tooltip needs a provider and pointer events; render the content inline instead.
vi.mock("@/shared/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

function edge(source: number, target: number, influence: number): TopologyEdge {
  return { source, target, influence, bias: 0 };
}

function topology(names: string[], edges: TopologyEdge[]): TopologyResponse {
  return {
    runId: "1",
    networkId: "net-1",
    agentCount: names.length,
    edgeCount: edges.length,
    agentOffset: 0,
    agentLimit: names.length,
    edgeOffset: 0,
    edgeLimit: edges.length,
    agents: names.map((name, index) => ({
      index,
      name,
      initialBelief: 0.5,
      toleranceRadius: 0.2,
      toleranceOffset: 0,
      silenceStrategy: 0,
      silenceEffect: 0,
    })),
    edges,
  };
}

function inspect(topo: TopologyResponse, agentIndex: number) {
  useSimulationStore.setState({
    topology: topo,
    selectedAgentIndex: agentIndex,
    latestFrame: null,
  });
  return render(<NodeInspectorCard />);
}

/** Text of every row rendered under the section whose title is `title`. */
function sectionRows(title: string): string[] {
  const section = screen.getByText(title).closest("div.flex-col");
  expect(section).not.toBeNull();
  return Array.from(section!.children)
    .slice(1)
    .map((row) => row.textContent ?? "");
}

const count = (label: string, n: number) => label.replace("{{count}}", String(n));

// ─── Tests ───────────────────────────────────────────────────────────────────

describe.each([
  ["en", en],
  ["es", es],
] as const)("NodeInspectorCard edge direction (%s)", (lng, locale) => {
  beforeEach(async () => {
    await i18n.changeLanguage(lng);
  });

  afterEach(() => {
    useSimulationStore.getState().reset();
  });

  // GET /topology edge {source: X, target: Y} means X influences Y (Y updates its belief from X,
  // `influence` = weight Y gives to X). Order as the backend emits it, grouped by target.
  // B influences A (0.6), A influences C (0.3); every agent has a self-loop.
  const net = topology(
    ["A", "B", "C"],
    [edge(0, 0, 0.4), edge(1, 0, 0.6), edge(1, 1, 1), edge(0, 2, 0.3), edge(2, 2, 0.7)],
  );

  it("lists the agents it influences (edges where it is the source) as 'Influences'", () => {
    inspect(net, 0);

    // Includes the self-loop.
    expect(sectionRows(count(locale.runView.inspectorInfluences, 2))).toEqual([
      "↺ A0.400",
      "→ C0.300",
    ]);
  });

  it("lists the agents that influence it (edges where it is the target) as 'Influenced by'", () => {
    inspect(net, 0);

    // The self-loop is not repeated here.
    expect(sectionRows(count(locale.runView.inspectorInfluencedBy, 1))).toEqual(["← B0.600"]);
  });

  it("an agent influenced only by itself shows no 'Influenced by' section", () => {
    inspect(net, 1);

    expect(sectionRows(count(locale.runView.inspectorInfluences, 2))).toEqual([
      "→ A0.600",
      "↺ B1.000",
    ]);
    expect(
      screen.queryByText(count(locale.runView.inspectorInfluencedBy, 0)),
    ).not.toBeInTheDocument();
  });

  it("keeps the top-5 cap while the header shows the full count", () => {
    const names = ["Hub", "N1", "N2", "N3", "N4", "N5", "N6"];
    // The hub influences all six and all six influence the hub.
    const edges = names.slice(1).flatMap((_, k) => [edge(0, k + 1, 0.1), edge(k + 1, 0, 0.15)]);
    inspect(topology(names, edges), 0);

    expect(sectionRows(count(locale.runView.inspectorInfluences, 6))).toHaveLength(5);
    expect(sectionRows(count(locale.runView.inspectorInfluencedBy, 6))).toHaveLength(5);
  });
});
