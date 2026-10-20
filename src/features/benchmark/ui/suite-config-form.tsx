import { useEffect, useState } from "react";
import { cn } from "@/shared/lib/utils";
import {
  CLUSTER_MODES,
  DEFAULT_SUITE_CONFIG,
  EXTRA_CANVAS_VARIANTS,
  LOD_PRESET_CONFIG,
  PHASE_GROUPS,
  type PhaseGroup,
  PLAYBACK_SPEED_OPTIONS,
  type SuiteClusterMode,
  type SuiteConfig,
} from "../lib/suite-config";
import "./bench.css";

/**
 * Suite configuration form of the /bench page (#126). Developer tool: English only.
 * Sizes and densities are comma lists ("10k, 25k" works); times are in seconds.
 */

const PHASE_HINTS: Record<PhaseGroup, string> = {
  layout: "FPS while the force layout runs (until the canvas freezes)",
  idle: "frozen canvas, no input",
  interaction: "scripted zoom in/out and pan through the Cosmograph API",
  repaint: "timeline playback: one store frame per round, as the replay engine does",
  cluster: "grouping on: transition, then idle and interaction",
};

const STAGES = ["1280x720", "1920x1080", "1600x900", "fill"] as const;

function parseList(text: string): number[] | null {
  const parts = text
    .split(",")
    .map((p) => p.trim().toLowerCase())
    .filter((p) => p.length > 0);
  const values = parts.map((p) => (p.endsWith("k") ? Number(p.slice(0, -1)) * 1_000 : Number(p)));
  return values.every((v) => Number.isFinite(v) && v > 0) ? values.map(Math.round) : null;
}

const listText = (values: number[]) => values.join(", ");

const sameList = (a: number[] | null, b: number[]) =>
  a !== null && a.length === b.length && a.every((v, i) => v === b[i]);

function NumberField({
  label,
  value,
  onChange,
  step = 1,
  min = 0,
  disabled,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  disabled?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <input
        type="number"
        className="h-8 w-24 rounded-md border border-input bg-background px-2 text-sm"
        value={value}
        step={step}
        min={min}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

const VARIANT_HINTS: Record<(typeof EXTRA_CANVAS_VARIANTS)[number], string> = {
  "links-transparent": 'the product\'s "hide links" toggle (transparent, still drawn)',
  "links-off": "renderLinks: false",
  "straight-links": "curvedLinks: false",
  "one-link-per-pair": "one of the two reciprocal edges per pair (reloads the canvas)",
};

export interface SuiteConfigFormProps {
  config: SuiteConfig;
  onChange: (config: SuiteConfig) => void;
  disabled?: boolean;
  /** Estimated duration of a configuration, shown on the preset buttons. */
  estimate?: (config: SuiteConfig) => string;
}

export function SuiteConfigForm({
  config,
  onChange,
  disabled = false,
  estimate,
}: SuiteConfigFormProps) {
  const [sizesText, setSizesText] = useState(listText(config.sizes));
  const [densitiesText, setDensitiesText] = useState(listText(config.densities));

  // Presets replace the config from outside: resync the free-text fields (not while typing).
  useEffect(
    () =>
      setSizesText((prev) =>
        sameList(parseList(prev), config.sizes) ? prev : listText(config.sizes),
      ),
    [config.sizes],
  );
  useEffect(
    () =>
      setDensitiesText((prev) =>
        sameList(parseList(prev), config.densities) ? prev : listText(config.densities),
      ),
    [config.densities],
  );

  const set = (patch: Partial<SuiteConfig>) => onChange({ ...config, ...patch });
  const toggle = <T,>(list: readonly T[], item: T): T[] =>
    list.includes(item) ? list.filter((v) => v !== item) : [...list, item];
  const stageValue =
    config.stage === "fill" ? "fill" : `${config.stage.width}x${config.stage.height}`;

  return (
    <fieldset disabled={disabled} className="grid gap-4 text-sm md:grid-cols-2">
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-muted-foreground">Network sizes (agents)</span>
          <input
            className={cn(
              "h-8 rounded-md border border-input bg-background px-2 text-sm",
              parseList(sizesText) === null && "border-destructive",
            )}
            value={sizesText}
            onChange={(e) => {
              setSizesText(e.target.value);
              const parsed = parseList(e.target.value);
              if (parsed !== null) set({ sizes: parsed });
            }}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-muted-foreground">Densities (Barabási–Albert m)</span>
          <input
            className={cn(
              "h-8 rounded-md border border-input bg-background px-2 text-sm",
              parseList(densitiesText) === null && "border-destructive",
            )}
            value={densitiesText}
            onChange={(e) => {
              setDensitiesText(e.target.value);
              const parsed = parseList(e.target.value);
              if (parsed !== null) set({ densities: parsed });
            }}
          />
        </label>
        <div className="flex flex-wrap gap-3">
          <NumberField
            label="Repetitions"
            value={config.repetitions}
            min={1}
            onChange={(v) => set({ repetitions: Math.max(1, Math.round(v)) })}
          />
          <NumberField
            label="Warm-up (s)"
            value={config.warmupMs / 1000}
            step={0.5}
            onChange={(v) => set({ warmupMs: Math.max(0, v * 1000) })}
          />
          <NumberField
            label="Measure (s)"
            value={config.measureMs / 1000}
            step={0.5}
            onChange={(v) => set({ measureMs: Math.max(0, v * 1000) })}
          />
          <NumberField
            label="Settle (s)"
            value={config.settleMs / 1000}
            step={0.5}
            onChange={(v) => set({ settleMs: Math.max(0, v * 1000) })}
          />
          <NumberField
            label="Seed"
            value={config.seed}
            onChange={(v) => set({ seed: Math.round(v) })}
          />
        </div>
        <div className="flex flex-wrap gap-3">
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-muted-foreground">Canvas (CSS px)</span>
            <select
              className="h-8 rounded-md border border-input bg-background px-2 text-sm"
              value={stageValue}
              onChange={(e) => {
                const v = e.target.value;
                if (v === "fill") set({ stage: "fill" });
                else {
                  const [w, h] = v.split("x").map(Number);
                  set({ stage: { width: w ?? 1280, height: h ?? 720 } });
                }
              }}
            >
              {[...new Set([...STAGES, stageValue])].map((s) => (
                <option key={s} value={s}>
                  {s === "fill" ? "fill the window" : s.replace("x", " × ")}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-muted-foreground">Cluster mode</span>
            <select
              className="h-8 rounded-md border border-input bg-background px-2 text-sm"
              value={config.clusterMode}
              onChange={(e) => set({ clusterMode: e.target.value as SuiteClusterMode })}
            >
              {CLUSTER_MODES.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <span className="text-xs text-muted-foreground">Phases</span>
          {PHASE_GROUPS.map((phase) => (
            <label key={phase} className="flex items-start gap-2 text-xs">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={config.phases.includes(phase)}
                onChange={() =>
                  set({
                    phases: PHASE_GROUPS.filter((p) => toggle(config.phases, phase).includes(p)),
                  })
                }
              />
              <span>
                <span className="font-medium">{phase}</span>{" "}
                <span className="text-muted-foreground">— {PHASE_HINTS[phase]}</span>
              </span>
            </label>
          ))}
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-xs text-muted-foreground">
            Repaint playback speeds (×1 = 10 rounds/s; ≥ ×16 renders a new round every frame at 60
            Hz)
          </span>
          <div className="flex gap-3">
            {PLAYBACK_SPEED_OPTIONS.map((speed) => (
              <label key={speed} className="flex items-center gap-1.5 text-xs">
                <input
                  type="checkbox"
                  checked={config.repaintSpeeds.includes(speed)}
                  onChange={() =>
                    set({
                      repaintSpeeds: toggle(config.repaintSpeeds, speed).sort((a, b) => a - b),
                    })
                  }
                />
                ×{speed}
              </label>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-xs text-muted-foreground">
            Canvas variants (LOD study, #50) — measured after the baseline in idle, interaction and
            repaint (first speed)
          </span>
          {EXTRA_CANVAS_VARIANTS.map((variant) => (
            <label key={variant} className="flex items-start gap-2 text-xs">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={config.canvasVariants.includes(variant)}
                onChange={() =>
                  set({
                    canvasVariants: EXTRA_CANVAS_VARIANTS.filter((v) =>
                      toggle(config.canvasVariants, variant).includes(v),
                    ),
                  })
                }
              />
              <span>
                <span className="font-medium">{variant}</span>{" "}
                <span className="text-muted-foreground">— {VARIANT_HINTS[variant]}</span>
              </span>
            </label>
          ))}
        </div>
        <label className="flex items-start gap-2 text-xs">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={config.prewarm}
            onChange={() => set({ prewarm: !config.prewarm })}
          />
          <span>
            <span className="font-medium">pre-warm</span>{" "}
            <span className="text-muted-foreground">
              — load an unmeasured 500-agent network first (DuckDB-WASM download + compile)
            </span>
          </span>
        </label>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-md border border-input px-2.5 py-1 text-xs hover:bg-accent"
            onClick={() => onChange({ ...DEFAULT_SUITE_CONFIG })}
          >
            Default matrix{estimate ? ` (≈ ${estimate(DEFAULT_SUITE_CONFIG)})` : ""}
          </button>
          <button
            type="button"
            className="rounded-md border border-input px-2.5 py-1 text-xs hover:bg-accent"
            onClick={() => onChange({ ...LOD_PRESET_CONFIG })}
          >
            LOD preset{estimate ? ` (≈ ${estimate(LOD_PRESET_CONFIG)})` : ""}
          </button>
          <button
            type="button"
            className="rounded-md border border-input px-2.5 py-1 text-xs hover:bg-accent"
            onClick={() =>
              onChange({
                ...DEFAULT_SUITE_CONFIG,
                sizes: [1_000, 5_000],
                densities: [3],
                repetitions: 1,
                warmupMs: 500,
                measureMs: 2_000,
                settleMs: 500,
              })
            }
          >
            Smoke test (1k, 5k)
          </button>
        </div>
      </div>
    </fieldset>
  );
}
