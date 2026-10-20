/**
 * Ported from ulvenforst/pol_measures @ 0e05564 (PROMUEVA), used with the authors' permission.
 *
 * Alienation functions f(d) for GeneralizedER / GeneralizedMEC. The package takes any callable
 * (default: the identity, f(d) = d); these are the ones its own validation uses
 * (benchmarks/generalized_er_validation/run_validation.py, ALIENATION_FUNCTIONS), written with the
 * same operations so they evaluate identically.
 */

export type Alienation = (d: number) => number;

export const ALIENATION_IDS = [
  "d",
  "d^2",
  "d^3",
  "d+d^2",
  "d+2d^2",
  "exp(d)-1",
  "exp(2d)-1",
] as const;

export type AlienationId = (typeof ALIENATION_IDS)[number];

export const ALIENATIONS: Readonly<Record<AlienationId, Alienation>> = {
  d: (d) => d,
  "d^2": (d) => d ** 2,
  "d^3": (d) => d ** 3,
  "d+d^2": (d) => d + d ** 2,
  "d+2d^2": (d) => d + 2 * d ** 2,
  "exp(d)-1": (d) => Math.exp(d) - 1,
  "exp(2d)-1": (d) => Math.exp(2 * d) - 1,
};

/** TeX for each alienation (wiki and parameter labels). */
export const ALIENATION_TEX: Readonly<Record<AlienationId, string>> = {
  d: "d",
  "d^2": "d^{2}",
  "d^3": "d^{3}",
  "d+d^2": "d + d^{2}",
  "d+2d^2": "d + 2d^{2}",
  "exp(d)-1": "e^{d} - 1",
  "exp(2d)-1": "e^{2d} - 1",
};

export function isAlienationId(value: unknown): value is AlienationId {
  return typeof value === "string" && (ALIENATION_IDS as readonly string[]).includes(value);
}
