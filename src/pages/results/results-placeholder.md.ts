/**
 * Placeholder content for the Previous Results page.
 * Each export is a self-contained markdown string that represents
 * one result article. When real experiment data is available,
 * replace these strings (or generate them from the Firestore export).
 *
 * Convention:
 *   FEATURED_RESULT  — hero slot at the top of the page
 *   RESULT_ARTICLES  — ordered list of news/article cards
 */

export const FEATURED_RESULT = `
## Featured Study: Opinion Dynamics in Scale-Free Networks

**Published:** 15 March 2025 · **Authors:** PROMUEVA Research Group · **Model:** DeGroot

Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut
labore et dolore magna aliqua. In this landmark simulation, a **500-agent Barabási–Albert
network** was subjected to 1 000 update iterations under the classic DeGroot averaging rule.
The results reveal how hub nodes — agents with disproportionately high connectivity — drive
rapid early convergence, while peripheral agents follow several hundred iterations later.

Key findings include:

- Global consensus was reached at **iteration 312**, well below the theoretical upper bound.
- Influence concentration in hub nodes exceeded 40 % of total network weight.
- Removing the top-5 hub agents delayed consensus by an average of **180 iterations**.

This study establishes the baseline convergence benchmarks used in all subsequent SiLEnSeSS
experiments. The full dataset and configuration file are available to authenticated researchers
via the SiLEnSeSS board.
`;

export const RESULT_ARTICLES: ReadonlyArray<{
  slug: string;
  date: string;
  title: string;
  summary: string;
  content: string;
}> = [
  {
    slug: "spiral-of-silence-colombian-election-2022",
    date: "2024-11-08",
    title: "Spiral of Silence — Colombian Presidential Election Context (2022)",
    summary:
      "Calibrated with survey data from the 2022 Colombian presidential election, this simulation reveals how a minority cluster enters a silencing cascade after iteration 80, amplifying the majority position beyond its initial share.",
    content: `
### Overview

Lorem ipsum dolor sit amet, consectetur adipiscing elit. Ut enim ad minim veniam, quis nostrud
exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. This experiment adapted
the **SOM⁻ (Silence Opinion Memoryless)** model to a political polarization scenario calibrated
with pre-election opinion survey data from Colombia's 2022 presidential race.

### Methodology

Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla
pariatur. A **400-agent Erdős–Rényi network** (p = 0.08) was initialised with opinion values
drawn from the survey distribution. Tolerance radii were set per agent cluster to reflect
observed partisan affiliation strength.

### Results

- Minority cluster entered silence cascade at **iteration 80**.
- By iteration 200, 78 % of minority agents were silent.
- Majority opinion share grew from 54 % (initial) to **71 %** (final).

Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim
id est laborum.
`,
  },
  {
    slug: "convergence-benchmarks-topology-comparison",
    date: "2024-03-22",
    title: "Convergence Benchmarks Across Network Topologies",
    summary:
      "A systematic comparison of DeGroot convergence speed across Erdős–Rényi, Barabási–Albert, and Watts–Strogatz topologies using uniform influence weights.",
    content: `
### Overview

Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut
labore et dolore magna aliqua. This benchmark study ran identical DeGroot simulations (300
agents, 500 iterations, uniform influence weights) across three canonical network topologies
to quantify how structure affects convergence.

### Topologies Tested

| Topology | Parameters | Mean Convergence Iteration |
|---|---|---|
| Erdős–Rényi | p = 0.06 | 187 |
| Barabási–Albert | m = 3 | 142 |
| Watts–Strogatz | k = 6, β = 0.3 | 221 |

### Key Takeaway

Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea
commodo consequat. Scale-free (Barabási–Albert) networks consistently converge fastest due
to the centralising effect of hub nodes. Small-world networks (Watts–Strogatz) are the
slowest because their regular local structure limits long-range opinion diffusion.
`,
  },
  {
    slug: "parameter-sensitivity-polarization",
    date: "2023-09-14",
    title: "Parameter Sensitivity: Tipping Points for Opinion Polarization",
    summary:
      "A sweep over tolerance radius and majority threshold parameters identifies the critical values at which DeGroot and SOM⁻ simulations transition from consensus to polarization.",
    content: `
### Overview

Lorem ipsum dolor sit amet, consectetur adipiscing elit. Duis aute irure dolor in
reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. This sensitivity
study maps the parameter space of the **SOM⁻ model** to identify bifurcation points where the
simulation outcome switches from global consensus to stable polarization.

### Parameter Grid

- **Tolerance radius (τ):** swept from 0.05 to 0.50 in steps of 0.05
- **Majority threshold (M):** swept from 0.20 to 0.80 in steps of 0.10
- Network: 200-agent Barabási–Albert, 300 iterations, 10 independent runs per parameter pair

### Critical Boundary

The transition from consensus to polarization is sharp: below **τ = 0.20**, more than 90 % of
runs produce stable polarized clusters regardless of M. Above τ = 0.35, consensus is nearly
guaranteed for M ≤ 0.50. This finding informs the default parameter recommendations surfaced
in the SiLEnSeSS UI.
`,
  },
  {
    slug: "hidden-consensus-som-plus",
    date: "2023-05-30",
    title: "Hidden Consensus Under the SOM⁺ Memory-Based Model",
    summary:
      "Using the memory-based variant, this experiment demonstrates how agents' private opinions converge to consensus while public discourse remains visibly polarized — the 'Hidden Consensus' phenomenon.",
    content: `
### Overview

Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut
labore et dolore magna aliqua. This experiment is the first to demonstrate the **Hidden
Consensus** phenomenon in a controlled SiLEnSeSS simulation. The **SOM⁺** model was applied
to a 350-agent network initialised with bimodal opinion distribution.

### Design

Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim
id est laborum. Each agent's public opinion was "sticky" — updated only when the agent was in a
speaking state. Private opinions evolved continuously via the weighted-average update rule.

### Observations

After 400 iterations:

- **Private opinions:** 94 % of agents within ε = 0.05 of the network mean — near-total consensus.
- **Public opinions:** standard deviation remained at 0.28 — visually indistinguishable from the
  initial polarized state.
- No agent perceived majority support sufficient to re-enter a speaking state.

This confirms the theoretical prediction that SOM⁺ can produce self-reinforcing silence even
when the underlying belief distribution has converged.
`,
  },
];
