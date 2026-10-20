import type { ScenarioResult } from "../lib/result-schema";
import "./bench.css";

/** Results of the scenarios run so far (#126) — one row per scenario × phase. English only. */

const MB = 1024 * 1024;
const f1 = (v: number | null | undefined) => (v === null || v === undefined ? "–" : v.toFixed(1));
const ms = (v: number | null | undefined) =>
  v === null || v === undefined ? "–" : Math.round(v).toLocaleString("en-US");

function fpsClass(v: number | null): string {
  if (v === null) return "";
  return v > 30 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400";
}

export function SuiteResultsTable({ scenarios }: { scenarios: readonly ScenarioResult[] }) {
  if (scenarios.length === 0) {
    return <p className="text-xs text-muted-foreground">No scenario finished yet.</p>;
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[900px] text-left font-mono text-[11px]">
        <thead className="bg-muted/50 text-muted-foreground">
          <tr>
            {[
              "scenario",
              "edges",
              "load total (ms)",
              "phase",
              "frames",
              "median FPS",
              "p5 FPS",
              "p1 FPS",
              "> 33.3 ms",
              "> 50 ms",
              "long tasks",
              "heap max (MB)",
              "repaints/s",
            ].map((h) => (
              <th key={h} className="px-2 py-1.5 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {scenarios.flatMap((s) => {
            if (s.phases.length === 0) {
              return [
                <tr key={s.id} className="border-t border-border">
                  <td className="px-2 py-1">{s.id}</td>
                  <td className="px-2 py-1">{s.edges.toLocaleString("en-US")}</td>
                  <td className="px-2 py-1">{ms(s.load.totalMs)}</td>
                  <td className="px-2 py-1 text-destructive" colSpan={10}>
                    {s.status}: {s.error}
                  </td>
                </tr>,
              ];
            }
            return s.phases.map((p, i) => (
              <tr key={`${s.id}-${p.phase}-${p.variant ?? ""}`} className="border-t border-border">
                <td className="px-2 py-1">{i === 0 ? s.id : ""}</td>
                <td className="px-2 py-1">{i === 0 ? s.edges.toLocaleString("en-US") : ""}</td>
                <td className="px-2 py-1">{i === 0 ? ms(s.load.totalMs) : ""}</td>
                <td className="px-2 py-1">{p.variant ? `${p.phase} (${p.variant})` : p.phase}</td>
                <td className="px-2 py-1">{p.frames.frames}</td>
                <td className={`px-2 py-1 font-semibold ${fpsClass(p.frames.fps.median)}`}>
                  {f1(p.frames.fps.median)}
                </td>
                <td className="px-2 py-1">{f1(p.frames.fps.p5)}</td>
                <td className="px-2 py-1">{f1(p.frames.fps.p1)}</td>
                <td className="px-2 py-1">
                  {p.frames.slowFrameShare === null
                    ? "–"
                    : `${(p.frames.slowFrameShare * 100).toFixed(1)} %`}
                </td>
                <td className="px-2 py-1">{p.frames.framesOver50ms}</td>
                <td className="px-2 py-1">{p.longTasks.supported ? p.longTasks.count : "n/a"}</td>
                <td className="px-2 py-1">
                  {p.heap.maxBytes === null ? "n/a" : Math.round(p.heap.maxBytes / MB)}
                </td>
                <td className="px-2 py-1">{p.repaint ? f1(p.repaint.repaintsPerSecond) : ""}</td>
              </tr>
            ));
          })}
        </tbody>
      </table>
    </div>
  );
}
