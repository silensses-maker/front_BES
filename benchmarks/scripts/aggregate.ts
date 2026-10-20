/**
 * Aggregates exported benchmark results into report tables (#126).
 *
 *   bun benchmarks/scripts/aggregate.ts [--results <dir>] [--out <dir>] [--threshold 30]
 *                                       [--include-dev] [--include-software]
 *   (or `bun run bench:report -- …`)
 *
 * Reads every `*.json` in the results directory (default `benchmarks/results/`), validates its
 * `schemaVersion` and harness marker, and writes to the output directory (default
 * `benchmarks/report/`):
 *   - summary.md   Markdown tables per machine: size × density × phase (median FPS, p5, p1,
 *                  slow-frame share, heap, GPU estimate, pass/fail) and load timings;
 *   - summary.csv  the same frame-rate table as CSV;
 *   - load.csv     the load-timings table as CSV;
 *   - phases.csv   every scenario × phase row of every included file (flattened).
 * The pure logic lives in src/features/benchmark/lib/aggregate.ts (unit-tested).
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  type AggregateOptions,
  aggregateResults,
  DEFAULT_AGGREGATE_OPTIONS,
  type LoadedResult,
  loadCsv,
  renderMarkdown,
  summaryCsv,
} from "../../src/features/benchmark/lib/aggregate";
import { CSV_COLUMNS, toCsv } from "../../src/features/benchmark/lib/result-csv";
import { validateResultDocument } from "../../src/features/benchmark/lib/result-schema";

/** Warnings and errors go to stderr; the summary to stdout. */
const warn = (message: string) => process.stderr.write(`${message}\n`);

interface CliArgs {
  results: string;
  out: string;
  options: AggregateOptions;
}

function parseArgs(argv: string[]): CliArgs {
  const root = resolve(import.meta.dir, "..");
  const args: CliArgs = {
    results: join(root, "results"),
    out: join(root, "report"),
    options: { ...DEFAULT_AGGREGATE_OPTIONS },
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const value = () => {
      const next = argv[++i];
      if (next === undefined) throw new Error(`${arg} needs a value`);
      return next;
    };
    if (arg === "--results") args.results = resolve(value());
    else if (arg === "--out") args.out = resolve(value());
    else if (arg === "--threshold") args.options.threshold = Number(value());
    else if (arg === "--include-dev") args.options.includeDev = true;
    else if (arg === "--include-software") args.options.includeSoftware = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!Number.isFinite(args.options.threshold)) throw new Error("--threshold must be a number");
  return args;
}

function main(): number {
  const args = parseArgs(process.argv.slice(2));
  const files = readdirSync(args.results)
    .filter((f) => f.endsWith(".json"))
    .sort();
  const loaded: LoadedResult[] = [];
  let invalid = 0;
  for (const file of files) {
    let raw: unknown;
    try {
      raw = JSON.parse(readFileSync(join(args.results, file), "utf8"));
    } catch (error) {
      warn(`skip ${file}: not valid JSON (${(error as Error).message})`);
      invalid++;
      continue;
    }
    const validation = validateResultDocument(raw);
    if (!validation.ok) {
      warn(`skip ${file}: ${validation.error}`);
      invalid++;
      continue;
    }
    loaded.push({ file, doc: validation.doc });
  }

  const report = aggregateResults(loaded, args.options);
  mkdirSync(args.out, { recursive: true });
  writeFileSync(join(args.out, "summary.md"), renderMarkdown(report, new Date().toISOString()));
  writeFileSync(join(args.out, "summary.csv"), summaryCsv(report));
  writeFileSync(join(args.out, "load.csv"), loadCsv(report));
  writeFileSync(join(args.out, "phases.csv"), toCsv(CSV_COLUMNS, report.rows));

  console.log(
    `${files.length} file(s): ${loaded.length} valid, ${invalid} invalid, ${report.excluded.length} excluded`,
  );
  for (const e of report.excluded) console.log(`  excluded ${e.file}: ${e.reason}`);
  console.log(
    `${report.machines.length} machine(s), ${report.phases.length} phase row(s), ${report.failures.length} failed scenario(s)`,
  );
  console.log(`wrote ${args.out}/{summary.md,summary.csv,load.csv,phases.csv}`);
  return 0;
}

try {
  process.exitCode = main();
} catch (error) {
  warn((error as Error).message);
  process.exitCode = 1;
}
