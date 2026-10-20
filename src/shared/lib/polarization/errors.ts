/**
 * Ported from ulvenforst/pol_measures @ 0e05564 (PROMUEVA), used with the authors' permission.
 * Python raises `ValueError` / `TypeError` / `ZeroDivisionError`; the replica throws one error
 * class that records which Python exception the package would have raised, with the same message,
 * so the golden tests can compare both.
 */

export type PythonErrorType = "ValueError" | "TypeError" | "ZeroDivisionError";

export class PolarizationError extends Error {
  readonly pythonType: PythonErrorType;

  constructor(pythonType: PythonErrorType, message: string) {
    super(message);
    this.name = "PolarizationError";
    this.pythonType = pythonType;
  }
}

export function valueError(message: string): PolarizationError {
  return new PolarizationError("ValueError", message);
}

export function isPolarizationError(err: unknown): err is PolarizationError {
  return err instanceof PolarizationError;
}
