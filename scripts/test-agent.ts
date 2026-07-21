#!/usr/bin/env bun
/**
 * test-agent.ts — Entry point for the Automated Testing Agent.
 *
 * Reads the agent definition from .claude/agents/test-agent.md,
 * extracts the prompt (everything after YAML frontmatter), and
 * invokes Claude Code CLI in non-interactive mode.
 *
 * Usage: bun run test-agent
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");
const AGENT_FILE = resolve(ROOT, ".claude/agents/test-agent.md");

// ── Read and parse agent definition ─────────────────────────────────────────

const raw = readFileSync(AGENT_FILE, "utf-8");

// Extract frontmatter values
const frontmatterMatch = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
if (!frontmatterMatch) {
  console.error("Could not parse agent definition frontmatter.");
  process.exit(1);
}

const frontmatter = frontmatterMatch[1];
const prompt = frontmatterMatch[2].trim();

// Parse model from frontmatter (default: sonnet)
const modelMatch = frontmatter.match(/^model:\s*(.+)$/m);
const model = modelMatch?.[1]?.trim() ?? "sonnet";

// Parse tools from frontmatter
const toolsMatch = frontmatter.match(/^tools:\s*(.+)$/m);
const tools = toolsMatch?.[1]?.trim().split(/,\s*/) ?? [
  "Read",
  "Write",
  "Glob",
  "Grep",
  "Bash",
  "Skill",
];

// ── Preflight checks ────────────────────────────────────────────────────────

// Verify claude CLI is available before attempting to spawn
const which = Bun.spawnSync(["which", "claude"], { stderr: "ignore" });
if (which.exitCode !== 0) {
  console.error(
    "Error: Claude Code CLI not found.\n" +
    "Install it from: https://claude.ai/code\n" +
    "Then run: npm install -g @anthropic-ai/claude-code",
  );
  process.exit(1);
}

// ── Invoke Claude CLI ───────────────────────────────────────────────────────

console.log("Starting test agent...\n");

let proc: ReturnType<typeof Bun.spawn>;

try {
  proc = Bun.spawn(
    [
      "claude",
      "-p",
      "--output-format",
      "text",
      "--model",
      model,
      "--allowedTools",
      tools.join(","),
    ],
    {
      cwd: ROOT,
      stdin: new TextEncoder().encode(prompt),
      stdout: "inherit",
      stderr: "inherit",
    },
  );
} catch (err) {
  console.error("Error: Failed to start Claude CLI process.");
  if (err instanceof Error) console.error(err.message);
  process.exit(1);
}

const exitCode = await proc.exited;

if (exitCode !== 0) {
  console.error(`\nAgent exited with code ${exitCode}.`);
}

process.exit(exitCode);
