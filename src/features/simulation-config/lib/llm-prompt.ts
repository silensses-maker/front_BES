/**
 * Static prompt downloaded from its own "Download AI prompt" button in the
 * Load step (see step-load.tsx), so users can paste it into any LLM chat
 * (Claude, ChatGPT, etc.) and describe, in plain language, the network they
 * want. The LLM's JSON reply can be dropped directly into the "Load file" step
 * of the wizard.
 *
 * Kept in English regardless of UI locale, matching the existing precedent of
 * the `_guide` block in the downloaded example JSON (see step-load.tsx).
 *
 * Field constraints mirror generatedSimSchema / customSimSchema in
 * ./validation.ts — keep this text in sync if those schemas change.
 * llm-prompt.test.ts parses both worked examples against those schemas.
 */
export const LLM_NETWORK_PROMPT = `You are helping configure a simulation for SiLEnSeSS, an opinion-dynamics simulator. Agents hold a belief (a number between 0 and 1), exchange opinions with their neighbors each round, and may stay silent or apply a cognitive bias when updating their belief.

TASK: the next message will describe, in plain language, a network the user wants to simulate. Reply with ONLY a single JSON object — no markdown code fences, no explanation, no text before or after. That JSON will be pasted as-is into the "Load file" step of the SiLEnSeSS wizard, so it must be valid on its own (no wrapping envelope needed).

Pick exactly ONE of these two shapes, whichever fits the request better.

============================================================
SHAPE 1 — "generated": a random network built from agent-type and bias-type distributions
============================================================
{
  "networkType": "generated",
  "numberOfAgents": <integer >= 1>,
  "numberOfNetworks": <integer >= 1>,          // independent network instances to run with this same config; usually 1
  "density": <integer >= 2>,                    // average number of neighbors per agent
  "iterationLimit": <integer >= 1>,             // max rounds; the run also stops early on convergence
  "stopThreshold": <number, 0 < x < 1>,         // convergence criterion (avg belief change between rounds); typical 0.01-0.001
  "seed": <integer or null>,                    // null = random seed each run; integer = reproducible
  "saveMode": <0 | 1 | 2>,                      // 0=FULL (every agent every round, heaviest), 1=STANDARD (aggregated + key states, default/recommended), 2=STANDARD_LIGHT (reduced, for large networks)
  "agentTypes": [
    {
      "id": "<unique string>",
      "count": <integer >= 1>,                  // how many agents get this combination
      "silenceStrategy": <0 | 1 | 2 | 3>,       // 0=DeGroot (always speaks) 1=Majority (speaks if enough neighbors agree) 2=Threshold (speaks above a configurable agreement fraction) 3=Confidence (speaks when own certainty passes a threshold)
      "silenceEffect": <0 | 1 | 2>,             // 0=DeGroot (no silence, classic model) 1=Memory (neighbors use the agent's last expressed opinion) 2=Memoryless (neighbors ignore the silent agent entirely)
      "majorityThreshold": <number 0-1, optional>, // required when silenceStrategy is 1 or 2: fraction of neighbors that must agree (within tolerance) for the agent to speak
      "confidence": <number 0-1, optional>       // required when silenceStrategy is 3: the agent's own certainty threshold to speak
    }
    // ... more rows as needed
  ],
  "biasTypes": [
    {
      "id": "<unique string>",
      "count": <integer >= 1>,                  // NOTE: this counts EDGES, not agents (see formula below)
      "cognitiveBias": <0 | 1 | 2 | 3 | 4>       // 0=None (pure average, DeGroot) 1=Confirmation (weighs agreeing opinions more) 2=Backfire (rejects very different opinions, hardens own belief) 3=Authority (defers to high-influence neighbors) 4=Insular (ignores most external opinions)
    }
    // ... more rows as needed
  ]
}

Hard invariants for "generated" (the app rejects the file otherwise):
- sum of agentTypes[].count MUST equal numberOfAgents exactly.
- sum of biasTypes[].count MUST equal the network's total edge count (maxEdges), computed as:
    maxEdges = 0                                              if numberOfAgents < density
    maxEdges = density*(density-1) + (numberOfAgents-density)*2*density   otherwise
  Compute this yourself from the numberOfAgents/density you chose and make biasTypes[].count sum to it exactly.

============================================================
SHAPE 2 — "custom": an explicit list of agents and directed edges
============================================================
{
  "networkType": "custom",
  "networkName": "<non-empty string, MAX 32 CHARACTERS>",
  "iterationLimit": <integer >= 1>,
  "stopThreshold": <number, 0 < x < 1>,
  "saveMode": <0 | 1 | 2>,                      // same meaning as above
  "agents": [
    {
      "name": "<unique non-empty string, MAX 32 CHARACTERS>", // referenced by edges below
      "belief": <number 0-1>,                   // initial opinion/position
      "toleranceRadius": <number 0-1>,          // how far another opinion can be from this agent's belief and still count as "close enough"
      "toleranceOffset": <number -1 to 1>,      // shifts the tolerance window asymmetrically around the belief
      "silenceStrategy": <0 | 1 | 2>,           // same meaning as above; note: value 3 (Confidence) is NOT available for custom agents
      "silenceEffect": <0 | 1>                  // same meaning as above; note: value 2 (Memoryless) is NOT available for custom agents
    }
    // ... more agents
  ],
  "edges": [
    {
      "source": "<agent name>",                 // must match an entry in agents[].name
      "target": "<agent name>",                 // must match an entry in agents[].name
      "influence": <number 0-1>,                // weight applied when target incorporates source's opinion
      "bias": <0 | 1 | 2 | 3>                   // same meaning as above; note: value 4 (Insular) is NOT available for custom edges
    }
    // ... more edges
  ]
}

Hard invariants for "custom":
- Every edge's source and target must be a name that exists in agents[].
- No two edges may share the same (source, target) pair (the graph is directed, so A→B and B→A are both allowed and distinct).
- agents[] and edges[] must each have at least one entry.
- networkName and every agents[].name MUST be 32 characters or fewer — the backend column is varchar(32) and the run fails to save if this is exceeded.

============================================================
Worked example — "generated" (10 agents, 2 opinion camps, mild disagreement handling, no bias)
============================================================
{
  "networkType": "generated",
  "numberOfAgents": 10,
  "numberOfNetworks": 1,
  "density": 2,
  "iterationLimit": 100,
  "stopThreshold": 0.01,
  "seed": null,
  "saveMode": 1,
  "agentTypes": [
    { "id": "a0", "count": 8, "silenceStrategy": 0, "silenceEffect": 0 },
    { "id": "a1", "count": 2, "silenceStrategy": 2, "silenceEffect": 1, "majorityThreshold": 0.4 }
  ],
  "biasTypes": [
    { "id": "b0", "count": 34, "cognitiveBias": 0 }
  ]
}
(Here density=2 and numberOfAgents=10, so maxEdges = 2*1 + (10-2)*2*2 = 2 + 32 = 34, matching biasTypes[0].count.)

============================================================
Worked example — "custom" (3 named agents, 4 directed edges)
============================================================
{
  "networkType": "custom",
  "networkName": "Example custom network",
  "iterationLimit": 100,
  "stopThreshold": 0.01,
  "saveMode": 1,
  "agents": [
    { "name": "A", "belief": 0.2, "toleranceRadius": 0.3, "toleranceOffset": 0, "silenceStrategy": 0, "silenceEffect": 0 },
    { "name": "B", "belief": 0.5, "toleranceRadius": 0.3, "toleranceOffset": 0, "silenceStrategy": 0, "silenceEffect": 0 },
    { "name": "C", "belief": 0.8, "toleranceRadius": 0.3, "toleranceOffset": 0, "silenceStrategy": 1, "silenceEffect": 0 }
  ],
  "edges": [
    { "source": "A", "target": "B", "influence": 0.5, "bias": 0 },
    { "source": "B", "target": "A", "influence": 0.5, "bias": 0 },
    { "source": "B", "target": "C", "influence": 0.4, "bias": 1 },
    { "source": "C", "target": "B", "influence": 0.4, "bias": 1 }
  ]
}

Now wait for the user's description of the network they want, then reply with ONLY the resulting JSON object.
`;
