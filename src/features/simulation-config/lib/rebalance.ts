/**
 * Proportionally redistributes counts across rows so they sum to `newTotal`,
 * while enforcing a minimum of 1 per row whenever the new total can afford it.
 *
 * Used when network-level params (`numberOfAgents`, `density`) change and the
 * downstream `agentTypes` / `biasTypes` rows need to be kept in sync without
 * forcing the user to manually re-enter each row.
 *
 * The min=1 floor matters because the schema requires `count >= 1` per row —
 * rebalancing to a configuration where some rows would be zero would silently
 * break the launch button at submit time.
 *
 * Algorithm:
 *   - If totals already match → return rows unchanged.
 *   - If `safeTotal === 0` → zero everything (the user must remove rows).
 *   - If `safeTotal < n` → scatter 1s in the first `safeTotal` rows, zero out
 *     the rest. Schema will then surface "too many rows for this total" via
 *     the count=0 error so the user knows to delete excess rows.
 *   - Otherwise: reserve 1 for each row, then scale the surplus
 *     `(oldRow.count - 1)` proportionally onto the surplus pool, with the last
 *     row absorbing rounding remainder.
 */
export function rebalanceCounts<T extends { count: number }>(rows: T[], newTotal: number): T[] {
  const n = rows.length;
  if (n === 0) return rows;

  const safeTotal = Math.max(0, Math.floor(newTotal));
  const oldTotal = rows.reduce((s, r) => s + r.count, 0);

  if (oldTotal === safeTotal) return rows;

  if (safeTotal === 0) {
    return rows.map((row) => ({ ...row, count: 0 }));
  }

  if (safeTotal < n) {
    // Cannot satisfy min=1 for every row. Scatter 1s where we can.
    return rows.map((row, i) => ({ ...row, count: i < safeTotal ? 1 : 0 }));
  }

  // safeTotal >= n: every row gets at least 1; distribute the surplus.
  const surplus = safeTotal - n;

  if (oldTotal === 0) {
    // No prior signal — split surplus evenly above the floor of 1.
    const base = Math.floor(surplus / n);
    const remainder = surplus - base * n;
    return rows.map((row, i) => ({
      ...row,
      count: 1 + base + (i < remainder ? 1 : 0),
    }));
  }

  // The "old surplus" is what each row had above the mandatory 1.
  // Treat row.count < 1 as 0 surplus contribution (defensive against bad data).
  const oldDeltas = rows.map((r) => Math.max(0, r.count - 1));
  const oldSurplus = oldDeltas.reduce((s, d) => s + d, 0);

  if (oldSurplus === 0) {
    // All rows were already at or below 1 — spread surplus evenly above the floor.
    const base = Math.floor(surplus / n);
    const remainder = surplus - base * n;
    return rows.map((row, i) => ({
      ...row,
      count: 1 + base + (i < remainder ? 1 : 0),
    }));
  }

  // Scale each row's surplus proportionally. Last row absorbs rounding error.
  let assigned = 0;
  return rows.map((row, i) => {
    if (i === n - 1) {
      return { ...row, count: 1 + Math.max(0, surplus - assigned) };
    }
    const newDelta = Math.max(0, Math.round((oldDeltas[i] * surplus) / oldSurplus));
    assigned += newDelta;
    return { ...row, count: 1 + newDelta };
  });
}
