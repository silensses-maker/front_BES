/** Locale-aware integer formatting; ∞ for non-finite (unlimited quotas). */
export function formatNumber(n: number, lang: string): string {
  if (!Number.isFinite(n)) return "∞";
  return n.toLocaleString(lang);
}
