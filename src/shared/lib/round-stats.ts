// polarization (#129): binning only, not the barrel (keeps the polarization barrel out of the
// frame worker). Remove with src/shared/lib/polarization.
import { accumulateFineHistogram, FINE_BINS } from "@/shared/lib/polarization/binning";

/**
 * Per-round statistics of a merged frame — the source of the round-aggregates store. Computed in
 * the frame worker for live / REST-fallback frames (posted with the frame) and on the main thread
 * for frames merged there (cold-load sweep). O(n): one pass for sums, extremes, speaking and the
 * fine histograms, one more for the exact (two-pass) variances.
 */
export interface RoundStats {
  meanPublic: number;
  meanPrivate: number;
  /** max − min of private beliefs — the run's "dispersión". */
  spread: number;
  /** Fraction of agents speaking this round, 0..1. */
  participation: number;
  /** Population variance of the public beliefs, (1/n) Σ (bᵢ − μ)². */
  variancePublic: number;
  /** Population variance of the private beliefs. */
  variancePrivate: number;
  /**
   * polarization (#129): 210-bin histograms of each belief type, or null when polarization is
   * compiled out or not requested.
   */
  fine: { public: Uint32Array; private: Uint32Array } | null;
}

export interface RoundStatsOptions {
  /** Also bin both belief types into FINE_BINS bins (polarization). */
  fineHistograms: boolean;
}

export function computeRoundStats(
  publicBelief: Float32Array,
  privateBelief: Float32Array,
  speaking: Uint8Array,
  { fineHistograms }: RoundStatsOptions,
): RoundStats {
  // polarization (#129): remove with src/shared/lib/polarization + src/features/run-polarization
  const fine =
    __POLARIZATION__ && fineHistograms
      ? { public: new Uint32Array(FINE_BINS), private: new Uint32Array(FINE_BINS) }
      : null;

  const len = publicBelief.length;
  if (len === 0) {
    return {
      meanPublic: 0,
      meanPrivate: 0,
      spread: 0,
      participation: 0,
      variancePublic: 0,
      variancePrivate: 0,
      fine,
    };
  }

  let sumPublic = 0;
  let sumPrivate = 0;
  let speakingCount = 0;
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < len; i++) {
    const pub = publicBelief[i] ?? 0;
    const priv = privateBelief[i] ?? 0;
    sumPublic += pub;
    sumPrivate += priv;
    speakingCount += speaking[i] ?? 0;
    if (priv < min) min = priv;
    if (priv > max) max = priv;
  }
  const meanPublic = sumPublic / len;
  const meanPrivate = sumPrivate / len;

  let squaresPublic = 0;
  let squaresPrivate = 0;
  for (let i = 0; i < len; i++) {
    const dPub = (publicBelief[i] ?? 0) - meanPublic;
    const dPriv = (privateBelief[i] ?? 0) - meanPrivate;
    squaresPublic += dPub * dPub;
    squaresPrivate += dPriv * dPriv;
  }

  // polarization (#129): remove with src/shared/lib/polarization + src/features/run-polarization
  if (__POLARIZATION__ && fine !== null) {
    accumulateFineHistogram(publicBelief, fine.public);
    accumulateFineHistogram(privateBelief, fine.private);
  }

  return {
    meanPublic,
    meanPrivate,
    spread: max - min,
    participation: speakingCount / len,
    variancePublic: squaresPublic / len,
    variancePrivate: squaresPrivate / len,
    fine,
  };
}
