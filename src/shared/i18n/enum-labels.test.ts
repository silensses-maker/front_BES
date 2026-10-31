import { describe, expect, it, vi } from "vitest";
import {
  COGNITIVE_BIAS_LABEL_KEYS,
  COGNITIVE_BIAS_OPTIONS,
  cognitiveBiasLabel,
  cognitiveBiasLabelKey,
  type EnumLabelKey,
  ROLE_LABEL_KEYS,
  type RoleLabelKey,
  roleLabel,
  SILENCE_EFFECT_LABEL_KEYS,
  SILENCE_EFFECT_OPTIONS,
  SILENCE_STRATEGY_LABEL_KEYS,
  SILENCE_STRATEGY_OPTIONS,
  silenceEffectLabel,
  silenceEffectLabelKey,
  silenceStrategyLabel,
  silenceStrategyLabelKey,
} from "./enum-labels";
import en from "./locales/en";
import es from "./locales/es";

// ─── Fixtures ────────────────────────────────────────────────────────────────

type Tree = { readonly [key: string]: string | Tree };

/** Resolves a dotted key in a locale tree (undefined when missing or not a leaf). */
function resolve(locale: Tree, key: string): string | undefined {
  let node: string | Tree | undefined = locale;
  for (const part of key.split(".")) {
    if (typeof node !== "object") return undefined;
    node = node[part];
  }
  return typeof node === "string" ? node : undefined;
}

/** Fake `t` that renders the key, so the tests see which key each helper asked for. */
const echo = (key: EnumLabelKey) => key;

const UNKNOWN_CODES = [-1, 1.5, Number.NaN, 99];

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("silence strategy labels", () => {
  it.each([
    [0, "enums.silenceStrategy.degroot", "DeGroot", "DeGroot"],
    [1, "enums.silenceStrategy.majority", "Majority", "Mayoría"],
    [2, "enums.silenceStrategy.threshold", "Threshold", "Umbral"],
    [3, "enums.silenceStrategy.confidence", "Confidence", "Confianza"],
  ] as const)("code %i → %s (%s / %s)", (code, key, enLabel, esLabel) => {
    expect(silenceStrategyLabelKey(code)).toBe(key);
    expect(silenceStrategyLabel(echo, code)).toBe(key);
    expect(resolve(en, key)).toBe(enLabel);
    expect(resolve(es, key)).toBe(esLabel);
  });

  it.each([...UNKNOWN_CODES, 4])("falls back to the raw code for unknown code %s", (code) => {
    const t = vi.fn(echo);
    expect(silenceStrategyLabelKey(code)).toBeUndefined();
    expect(silenceStrategyLabel(t, code)).toBe(String(code));
    expect(t).not.toHaveBeenCalled();
  });
});

describe("silence effect labels", () => {
  it.each([
    [0, "enums.silenceEffect.degroot", "DeGroot", "DeGroot"],
    [1, "enums.silenceEffect.memory", "Memory", "Memoria"],
    [2, "enums.silenceEffect.memoryless", "Memoryless", "Sin memoria"],
  ] as const)("code %i → %s (%s / %s)", (code, key, enLabel, esLabel) => {
    expect(silenceEffectLabelKey(code)).toBe(key);
    expect(silenceEffectLabel(echo, code)).toBe(key);
    expect(resolve(en, key)).toBe(enLabel);
    expect(resolve(es, key)).toBe(esLabel);
  });

  it.each([...UNKNOWN_CODES, 3])("falls back to the raw code for unknown code %s", (code) => {
    const t = vi.fn(echo);
    expect(silenceEffectLabelKey(code)).toBeUndefined();
    expect(silenceEffectLabel(t, code)).toBe(String(code));
    expect(t).not.toHaveBeenCalled();
  });
});

describe("cognitive bias labels", () => {
  it.each([
    [0, "enums.cognitiveBias.degroot", "None", "Ninguno"],
    [1, "enums.cognitiveBias.confirmation", "Confirmation", "Confirmación"],
    [2, "enums.cognitiveBias.backfire", "Backfire", "Efecto rebote"],
    [3, "enums.cognitiveBias.authority", "Authority", "Autoridad"],
    [4, "enums.cognitiveBias.insular", "Insular", "Insular"],
  ] as const)("code %i → %s (%s / %s)", (code, key, enLabel, esLabel) => {
    expect(cognitiveBiasLabelKey(code)).toBe(key);
    expect(cognitiveBiasLabel(echo, code)).toBe(key);
    expect(resolve(en, key)).toBe(enLabel);
    expect(resolve(es, key)).toBe(esLabel);
  });

  it.each([...UNKNOWN_CODES, 5])("falls back to the raw code for unknown code %s", (code) => {
    const t = vi.fn(echo);
    expect(cognitiveBiasLabelKey(code)).toBeUndefined();
    expect(cognitiveBiasLabel(t, code)).toBe(String(code));
    expect(t).not.toHaveBeenCalled();
  });
});

describe("select options", () => {
  it("lists every code in order with its label key", () => {
    expect(SILENCE_STRATEGY_OPTIONS.map((o) => o.value)).toEqual([0, 1, 2, 3]);
    expect(SILENCE_EFFECT_OPTIONS.map((o) => o.value)).toEqual([0, 1, 2]);
    expect(COGNITIVE_BIAS_OPTIONS.map((o) => o.value)).toEqual([0, 1, 2, 3, 4]);

    for (const option of SILENCE_STRATEGY_OPTIONS) {
      expect(option.labelKey).toBe(silenceStrategyLabelKey(option.value));
    }
    for (const option of SILENCE_EFFECT_OPTIONS) {
      expect(option.labelKey).toBe(silenceEffectLabelKey(option.value));
    }
    for (const option of COGNITIVE_BIAS_OPTIONS) {
      expect(option.labelKey).toBe(cognitiveBiasLabelKey(option.value));
    }
  });
});

describe("locale coverage", () => {
  it.each([
    ["silenceStrategy", SILENCE_STRATEGY_LABEL_KEYS],
    ["silenceEffect", SILENCE_EFFECT_LABEL_KEYS],
    ["cognitiveBias", COGNITIVE_BIAS_LABEL_KEYS],
  ] as const)("enums.%s holds exactly the helper's keys in en and es", (name, keys) => {
    const expected = Object.values(keys).sort();
    for (const locale of [en, es]) {
      const actual = Object.keys(locale.enums[name]).map((leaf) => `enums.${name}.${leaf}`);
      expect(actual.sort()).toEqual(expected);
    }
  });
});

// ─── User roles ───────────────────────────────────────────────────────────────

describe("roleLabel", () => {
  const echoRole = (key: RoleLabelKey) => key;

  it("maps every role to a key that both locales define", () => {
    for (const key of Object.values(ROLE_LABEL_KEYS)) {
      expect(resolve(en, key)).toBeTruthy();
      expect(resolve(es, key)).toBeTruthy();
    }
  });

  it("asks t for the role's key", () => {
    expect(roleLabel(echoRole, "SuperAdministrator")).toBe("roles.SuperAdministrator");
    expect(roleLabel(echoRole, "Guest")).toBe("roles.Guest");
  });

  it("renders an unknown role as itself without calling t", () => {
    const t = vi.fn(echoRole);
    expect(roleLabel(t, "Auditor")).toBe("Auditor");
    expect(roleLabel(t, "toString")).toBe("toString");
    expect(t).not.toHaveBeenCalled();
  });
});
