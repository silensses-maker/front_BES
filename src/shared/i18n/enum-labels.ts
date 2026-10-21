import type { CognitiveBias, SilenceEffect, SilenceStrategy } from "@/shared/api/backend";

/**
 * Backend enum code → i18n key under `enums.*`: the single source of these labels (#94). Codes
 * follow the canonical spec (strategies 0–3, effects 0–2, biases 0–4).
 */
export const SILENCE_STRATEGY_LABEL_KEYS = {
  0: "enums.silenceStrategy.degroot",
  1: "enums.silenceStrategy.majority",
  2: "enums.silenceStrategy.threshold",
  3: "enums.silenceStrategy.confidence",
} as const satisfies Record<SilenceStrategy, string>;

export const SILENCE_EFFECT_LABEL_KEYS = {
  0: "enums.silenceEffect.degroot",
  1: "enums.silenceEffect.memory",
  2: "enums.silenceEffect.memoryless",
} as const satisfies Record<SilenceEffect, string>;

export const COGNITIVE_BIAS_LABEL_KEYS = {
  0: "enums.cognitiveBias.degroot",
  1: "enums.cognitiveBias.confirmation",
  2: "enums.cognitiveBias.backfire",
  3: "enums.cognitiveBias.authority",
  4: "enums.cognitiveBias.insular",
} as const satisfies Record<CognitiveBias, string>;

export type EnumLabelKey =
  | (typeof SILENCE_STRATEGY_LABEL_KEYS)[SilenceStrategy]
  | (typeof SILENCE_EFFECT_LABEL_KEYS)[SilenceEffect]
  | (typeof COGNITIVE_BIAS_LABEL_KEYS)[CognitiveBias];

/** The part of `t` (useTranslation) the label helpers need. */
export type EnumLabelTranslator = (key: EnumLabelKey) => string;

/** A select option: the code and the i18n key of its label. */
export interface EnumOption<Code extends number> {
  value: Code;
  labelKey: EnumLabelKey;
}

function labelKeyOf<Code extends number>(
  keys: Readonly<Record<Code, EnumLabelKey>>,
  code: number,
): EnumLabelKey | undefined {
  // A numeric code can only match an own key: Object.prototype has no integer-named members.
  return code in keys ? keys[code as Code] : undefined;
}

function optionsOf<Code extends number>(
  keys: Readonly<Record<Code, EnumLabelKey>>,
): readonly EnumOption<Code>[] {
  // Integer keys enumerate in ascending order, so the options follow the codes.
  return Object.keys(keys).map((code) => {
    const value = Number(code) as Code;
    return { value, labelKey: keys[value] };
  });
}

/** Label key of a silence strategy, or `undefined` for a code the spec does not define. */
export function silenceStrategyLabelKey(code: number): EnumLabelKey | undefined {
  return labelKeyOf(SILENCE_STRATEGY_LABEL_KEYS, code);
}

/** Label key of a silence effect, or `undefined` for a code the spec does not define. */
export function silenceEffectLabelKey(code: number): EnumLabelKey | undefined {
  return labelKeyOf(SILENCE_EFFECT_LABEL_KEYS, code);
}

/** Label key of a cognitive bias, or `undefined` for a code the spec does not define. */
export function cognitiveBiasLabelKey(code: number): EnumLabelKey | undefined {
  return labelKeyOf(COGNITIVE_BIAS_LABEL_KEYS, code);
}

/** Localized silence strategy; an unknown code renders as the code itself. */
export function silenceStrategyLabel(t: EnumLabelTranslator, code: number): string {
  const key = silenceStrategyLabelKey(code);
  return key === undefined ? String(code) : t(key);
}

/** Localized silence effect; an unknown code renders as the code itself. */
export function silenceEffectLabel(t: EnumLabelTranslator, code: number): string {
  const key = silenceEffectLabelKey(code);
  return key === undefined ? String(code) : t(key);
}

/** Localized cognitive bias; an unknown code renders as the code itself. */
export function cognitiveBiasLabel(t: EnumLabelTranslator, code: number): string {
  const key = cognitiveBiasLabelKey(code);
  return key === undefined ? String(code) : t(key);
}

/** Every silence strategy in code order, for selects. */
export const SILENCE_STRATEGY_OPTIONS = optionsOf(SILENCE_STRATEGY_LABEL_KEYS);

/** Every silence effect in code order, for selects. */
export const SILENCE_EFFECT_OPTIONS = optionsOf(SILENCE_EFFECT_LABEL_KEYS);

/** Every cognitive bias in code order, for selects. */
export const COGNITIVE_BIAS_OPTIONS = optionsOf(COGNITIVE_BIAS_LABEL_KEYS);
