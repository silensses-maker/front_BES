/**
 * Ported from ulvenforst/pol_measures @ 0e05564 (PROMUEVA), used with the authors' permission.
 *
 * - `minimizeScalarBounded`: SciPy's `minimize_scalar(fun, bounds=(a, b), method="bounded")`
 *   (`scipy.optimize._optimize._minimize_scalar_bounded`, Brent's method with golden-section
 *   fallback, xatol = 1e-5, maxiter = 500), statement for statement. MEC, MECNormalized and
 *   GeneralizedMEC call it exactly like the package, so the replica visits the same points and
 *   returns the same `fun`.
 * - `mecBisectionValue`: src/measures/utils/optimization.py `mec_bisection_value`, the package's
 *   reference optimizer for beta > 1 (benchmarks/tests only; the public MEC uses SciPy's).
 */

import { valueError } from "./errors";
import { npSign, npSum } from "./np";

export interface BoundedResult {
  fun: number;
  x: number;
  nfev: number;
  /** 0 = converged, 1 = max function calls reached, 2 = NaN encountered. */
  status: 0 | 1 | 2;
  success: boolean;
}

export function minimizeScalarBounded(
  func: (x: number) => number,
  bounds: readonly [number, number],
  { xatol = 1e-5, maxiter = 500 }: { xatol?: number; maxiter?: number } = {},
): BoundedResult {
  const maxfun = maxiter;
  const [x1, x2] = bounds;
  if (!Number.isFinite(x1) || !Number.isFinite(x2)) {
    throw valueError("Optimization bounds must be finite scalars.");
  }
  if (x1 > x2) throw valueError("The lower bound exceeds the upper bound.");

  let flag: 0 | 1 | 2 = 0;
  const sqrtEps = Math.sqrt(2.2e-16);
  const goldenMean = 0.5 * (3.0 - Math.sqrt(5.0));
  let a = x1;
  let b = x2;
  let fulc = a + goldenMean * (b - a);
  let nfc = fulc;
  let xf = fulc;
  let rat = 0.0;
  let e = 0.0;
  let x = xf;
  let fx = func(x);
  let num = 1;
  let fu = Number.POSITIVE_INFINITY;

  let ffulc = fx;
  let fnfc = fx;
  let xm = 0.5 * (a + b);
  let tol1 = sqrtEps * Math.abs(xf) + xatol / 3.0;
  let tol2 = 2.0 * tol1;

  while (Math.abs(xf - xm) > tol2 - 0.5 * (b - a)) {
    let golden = true;
    // Check for parabolic fit
    if (Math.abs(e) > tol1) {
      golden = false;
      let r = (xf - nfc) * (fx - ffulc);
      let q = (xf - fulc) * (fx - fnfc);
      let p = (xf - fulc) * q - (xf - nfc) * r;
      q = 2.0 * (q - r);
      if (q > 0.0) p = -p;
      q = Math.abs(q);
      r = e;
      e = rat;

      // Check for acceptability of parabola
      if (Math.abs(p) < Math.abs(0.5 * q * r) && p > q * (a - xf) && p < q * (b - xf)) {
        rat = (p + 0.0) / q;
        x = xf + rat;
        if (x - a < tol2 || b - x < tol2) {
          const si = npSign(xm - xf) + (xm - xf === 0 ? 1 : 0);
          rat = tol1 * si;
        }
      } else {
        golden = true;
      }
    }

    if (golden) {
      // golden-section step
      e = xf >= xm ? a - xf : b - xf;
      rat = goldenMean * e;
    }

    const si = npSign(rat) + (rat === 0 ? 1 : 0);
    x = xf + si * Math.max(Math.abs(rat), tol1);
    fu = func(x);
    num += 1;

    if (fu <= fx) {
      if (x >= xf) a = xf;
      else b = xf;
      fulc = nfc;
      ffulc = fnfc;
      nfc = xf;
      fnfc = fx;
      xf = x;
      fx = fu;
    } else {
      if (x < xf) a = x;
      else b = x;
      if (fu <= fnfc || nfc === xf) {
        fulc = nfc;
        ffulc = fnfc;
        nfc = x;
        fnfc = fu;
      } else if (fu <= ffulc || fulc === xf || fulc === nfc) {
        fulc = x;
        ffulc = fu;
      }
    }

    xm = 0.5 * (a + b);
    tol1 = sqrtEps * Math.abs(xf) + xatol / 3.0;
    tol2 = 2.0 * tol1;

    if (num >= maxfun) {
      flag = 1;
      break;
    }
  }

  if (Number.isNaN(xf) || Number.isNaN(fx) || Number.isNaN(fu)) flag = 2;

  return { fun: fx, x: xf, nfev: num, status: flag, success: flag === 0 };
}

/**
 * MEC by bisection on the first-order condition (beta > 1): the derivative of
 * F(y) = Σ wᵢ^α |xᵢ − y|^β is monotone, so its root is bracketed and halved
 * ⌈log2(width/ε)⌉ times; returns F at the final bracket's midpoint.
 */
export function mecBisectionValue(
  x: ArrayLike<number>,
  weights: ArrayLike<number>,
  { alpha, beta, epsilon = 1e-8 }: { alpha: number; beta: number; epsilon?: number },
): number {
  if (alpha <= 0) throw valueError("alpha must be positive");
  if (beta <= 1) throw valueError("bisection MEC requires beta > 1");
  if (epsilon <= 0) throw valueError("epsilon must be positive");

  const xs = Float64Array.from(x);
  const ws = Float64Array.from(weights);
  if (xs.length !== ws.length) throw valueError("x and weights must have the same shape");
  if (xs.length < 2) throw valueError("At least two points are required");
  for (let i = 1; i < xs.length; i++) {
    if (!((xs[i] as number) - (xs[i - 1] as number) > 0)) {
      throw valueError("x values must be strictly increasing");
    }
  }
  let anyPositive = false;
  for (const w of ws) {
    if (w < 0) throw valueError("All weights must be non-negative");
    if (w > 0) anyPositive = true;
  }
  if (!anyPositive) throw valueError("At least one weight must be positive");
  for (let i = 0; i < xs.length; i++) {
    if (!Number.isFinite(xs[i] as number) || !Number.isFinite(ws[i] as number)) {
      throw valueError("x and weights must be finite");
    }
  }

  const n = xs.length;
  const weightsAlpha = ws.map((w) => w ** alpha);
  const terms = new Float64Array(n);
  const valueAt = (y: number): number => {
    for (let i = 0; i < n; i++) {
      terms[i] = (weightsAlpha[i] as number) * Math.abs((xs[i] as number) - y) ** beta;
    }
    return npSum(terms);
  };

  let lo = xs[0] as number;
  let hi = xs[n - 1] as number;
  const width = hi - lo;
  if (width <= epsilon) {
    const yStar = 0.5 * (lo + hi);
    for (let i = 0; i < n; i++) {
      terms[i] = (ws[i] as number) ** alpha * Math.abs((xs[i] as number) - yStar) ** beta;
    }
    return npSum(terms);
  }

  const iterations = Math.max(1, Math.ceil(Math.log2(width / epsilon)));
  for (let it = 0; it < iterations; it++) {
    const mid = 0.5 * (lo + hi);
    for (let i = 0; i < n; i++) {
      const delta = mid - (xs[i] as number);
      terms[i] = (weightsAlpha[i] as number) * npSign(delta) * Math.abs(delta) ** (beta - 1.0);
    }
    const derivativeWithoutBeta = npSum(terms);
    if (derivativeWithoutBeta < 0.0) lo = mid;
    else hi = mid;
  }

  return valueAt(0.5 * (lo + hi));
}
