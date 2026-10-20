import type {
  CognitiveBias,
  SilenceEffect,
  SilenceStrategy,
  TopologyAgent,
  TopologyEdge,
  TopologyResponse,
} from "@/shared/api/backend";
import { createRandom, type Random } from "./prng";

/**
 * Seeded synthetic networks with the same shape AND the same meaning of "density" as the
 * backend's generated runs (#126), so the benchmark feeds the real canvas pipeline realistic data.
 *
 * Backend reference (belief_evolution_simulator, read-only):
 * - `Network.scala` (`BuildNetwork`) builds a Barabási–Albert-style network where
 *   `m = density` (the run's `effectiveDensity`, `Server.clampEffectiveDensity`):
 *   phase 1 fully connects agents `0..m` (the core); phase 2 lets every later agent `i` pick `m`
 *   DISTINCT earlier agents with probability proportional to an attractiveness score
 *   (`FenwickTree.pickRandomsInto`). Every agent enters with score
 *   `m + m·(degreeDistribution − 2)` and a pick adds 1 to the picked agent's score;
 *   `Server.scala` hard-codes `degreeDistribution = 2.5`, i.e. an initial score of `1.5·m`.
 * - Each attachment is stored in both CSR rows, so a network has
 *   `E = m(m−1) + (n−m)·2m` directed edges (the formula the backend and the wizard use).
 * - `ApiJson.topologyEdges` reports row `owner` entries as `source = neighbor`,
 *   `target = owner` ("source influences target"), in CSR order.
 * - Influence weights (`AgentProcessor.generateInfluencesAndBiases`): per agent, `deg + 1`
 *   uniform draws normalised by their sum (the extra draw is the agent's own weight).
 * - Initial beliefs: `Uniform` → `random.nextFloat()`.
 *
 * At ≥ 10k agents only an Administrator can create a run (role `maxAgents`), whose
 * `densityFactor` is 1.0, so the effective density equals the requested density.
 */

/** Initial attractiveness of every agent, as a multiple of m (`degreeDistribution − 2 + 1`). */
const ATTRACTIVENESS_FACTOR = 1.5;

/** Agent-type mix of the synthetic networks, assigned in contiguous blocks like the backend. */
const AGENT_TYPE_MIX: ReadonlyArray<{ strategy: SilenceStrategy; effect: SilenceEffect }> = [
  { strategy: 0, effect: 0 },
  { strategy: 1, effect: 1 },
  { strategy: 2, effect: 2 },
  { strategy: 3, effect: 1 },
];

/** Bias-type mix of the edges, assigned in contiguous blocks (shuffled order in the backend). */
const BIAS_MIX: readonly CognitiveBias[] = [1, 2];

export interface SyntheticTopologyOptions {
  agents: number;
  density: number;
  seed: number;
  runId: string;
  networkId: string;
}

/** `E = m(m−1) + (n−m)·2m`, the backend's directed edge count of a generated network. */
export function expectedEdgeCount(agents: number, density: number): number {
  if (agents <= density) return 0;
  return density * (density - 1) + (agents - density) * 2 * density;
}

/**
 * Generated-run density from a topology's counts, inverting `E = 2mn − m² − m`; null when the
 * counts do not come from a generated network (custom runs).
 */
export function inferDensity(agents: number, edges: number): number | null {
  if (agents < 2 || edges <= 0) return null;
  const b = 2 * agents - 1;
  const disc = b * b - 4 * edges;
  if (disc < 0) return null;
  const m = Math.round((b - Math.sqrt(disc)) / 2);
  return m >= 1 && m < agents && expectedEdgeCount(agents, m) === edges ? m : null;
}

/** Rounds to 7 decimals: JSON numbers as long as the backend's `Float.toString` output. */
function round7(value: number): number {
  return Math.round(value * 1e7) / 1e7;
}

/** Fenwick tree over attractiveness scores (sampling proportional to score, O(log n)). */
class ScoreTree {
  private readonly tree: Float64Array;
  private readonly size: number;
  private readonly topBit: number;

  constructor(size: number) {
    this.size = size;
    this.tree = new Float64Array(size + 1);
    let bit = 1;
    while (bit * 2 <= size) bit *= 2;
    this.topBit = bit;
  }

  add(index: number, delta: number): void {
    for (let i = index + 1; i <= this.size; i += i & -i) this.tree[i] = (this.tree[i] ?? 0) + delta;
  }

  /** Smallest index whose inclusive prefix sum reaches `value` (value in (0, total]). */
  find(value: number): number {
    let pos = 0;
    let rest = value;
    for (let step = this.topBit; step > 0; step >>= 1) {
      const next = pos + step;
      const weight = this.tree[next] ?? 0;
      if (next <= this.size && weight < rest) {
        pos = next;
        rest -= weight;
      }
    }
    return pos;
  }
}

/** Picks of phase 2: `m` distinct earlier agents per agent `m+1..n−1`, preferentially. */
function preferentialPicks(agents: number, m: number, random: Random): Int32Array {
  const minScore = ATTRACTIVENESS_FACTOR * m;
  const picks = new Int32Array(Math.max(0, agents - m - 1) * m);
  const score = new Float64Array(agents);
  const removed = new Uint8Array(agents);
  const tree = new ScoreTree(agents);
  let total = 0;
  for (let i = 0; i <= m; i++) {
    score[i] = minScore;
    tree.add(i, minScore);
    total += minScore;
  }

  let cursor = 0;
  for (let i = m + 1; i < agents; i++) {
    let localTotal = total;
    const first = cursor;
    for (let k = 0; k < m; k++) {
      // (0, localTotal]: a zero-score (already picked) slot can never be the first to reach it
      let idx = tree.find((1 - random()) * localTotal);
      if (idx >= i) idx = i - 1;
      while (removed[idx] === 1) idx = idx + 1 < i ? idx + 1 : 0;
      picks[cursor++] = idx;
      removed[idx] = 1;
      const s = score[idx] ?? 0;
      localTotal -= s;
      tree.add(idx, -s);
    }
    for (let k = first; k < cursor; k++) {
      const idx = picks[k] ?? 0;
      removed[idx] = 0;
      score[idx] = (score[idx] ?? 0) + 1;
      tree.add(idx, score[idx] ?? 0);
    }
    total += m + minScore;
    score[i] = minScore;
    tree.add(i, minScore);
  }
  return picks;
}

/**
 * CSR rows as the backend fills them: row `r` lists the agents `r` listens to — the other core
 * agents (core rows), its own picks, then the later agents that picked it, in order.
 */
function buildRows(agents: number, m: number, picks: Int32Array) {
  const degree = new Int32Array(agents);
  for (let i = 0; i <= m; i++) degree[i] = m;
  for (let i = m + 1; i < agents; i++) degree[i] = m;
  for (const p of picks) degree[p] = (degree[p] ?? 0) + 1;

  const offsets = new Int32Array(agents + 1);
  for (let i = 0; i < agents; i++) offsets[i + 1] = (offsets[i] ?? 0) + (degree[i] ?? 0);
  const fill = offsets.slice(0, agents);
  const neighbors = new Int32Array(offsets[agents] ?? 0);
  const push = (row: number, value: number) => {
    const at = fill[row] ?? 0;
    neighbors[at] = value;
    fill[row] = at + 1;
  };

  for (let i = 0; i <= m; i++) {
    for (let j = 0; j <= m; j++) if (j !== i) push(j, i);
  }
  let cursor = 0;
  for (let i = m + 1; i < agents; i++) {
    for (let k = 0; k < m; k++) {
      const p = picks[cursor++] ?? 0;
      push(i, p);
      push(p, i);
    }
  }
  return { offsets, neighbors };
}

export function generateSyntheticTopology(options: SyntheticTopologyOptions): TopologyResponse {
  const { agents: n, density: m, seed, runId, networkId } = options;
  if (!Number.isInteger(n) || !Number.isInteger(m) || m < 1 || m >= n) {
    throw new Error(`Synthetic network needs integers 1 <= density < agents (got ${m}, ${n})`);
  }
  const random = createRandom(seed);
  const picks = preferentialPicks(n, m, random);
  const { offsets, neighbors } = buildRows(n, m, picks);

  const agents: TopologyAgent[] = new Array(n);
  const blockSize = Math.ceil(n / AGENT_TYPE_MIX.length);
  for (let i = 0; i < n; i++) {
    const type = AGENT_TYPE_MIX[Math.floor(i / blockSize)] ?? AGENT_TYPE_MIX[0];
    agents[i] = {
      index: i,
      name: null,
      initialBelief: round7(random()),
      toleranceRadius: 0.1,
      toleranceOffset: 0,
      silenceStrategy: type?.strategy ?? 0,
      silenceEffect: type?.effect ?? 0,
    };
  }

  const edgeTotal = neighbors.length;
  const edges: TopologyEdge[] = new Array(edgeTotal);
  const biasBlock = Math.ceil(edgeTotal / BIAS_MIX.length);
  const draws: number[] = [];
  for (let owner = 0; owner < n; owner++) {
    const start = offsets[owner] ?? 0;
    const end = offsets[owner + 1] ?? start;
    draws.length = 0;
    let sum = 0;
    for (let k = start; k <= end; k++) {
      const r = random();
      draws.push(r);
      sum += r;
    }
    for (let k = start; k < end; k++) {
      edges[k] = {
        source: neighbors[k] ?? 0,
        target: owner,
        influence: round7((draws[k - start] ?? 0) / sum),
        bias: BIAS_MIX[Math.floor(k / biasBlock)] ?? BIAS_MIX[0] ?? 0,
      };
    }
  }

  return {
    runId,
    networkId,
    agentCount: n,
    edgeCount: edgeTotal,
    agentOffset: 0,
    agentLimit: n,
    edgeOffset: 0,
    edgeLimit: edgeTotal,
    agents,
    edges,
  };
}

/** A decimal run id (int64-safe) for synthetic data — frames carry it in their header. */
export function syntheticRunId(seed: number): string {
  return (1_260_000_000_000n + BigInt(seed >>> 0)).toString();
}

/** A lowercase UUID string for synthetic data — round-trips through the frame header encoding. */
export function syntheticNetworkId(seed: number): string {
  const tail = (seed >>> 0).toString(16).padStart(12, "0");
  return `00000126-0000-4000-8000-${tail}`;
}
