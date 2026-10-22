/** Combining diacritical marks (U+0300–U+036F), left over once a text is NFD-normalized. */
const COMBINING_MARKS = /[̀-ͯ]/g;

/** Runs of anything but ASCII letters and digits. */
const NON_ALPHANUMERIC = /[^a-z0-9]+/g;

/**
 * URL-fragment id for a heading text: lower case, accents dropped ("Configuración" →
 * "configuracion"), every other run of non-alphanumeric characters turned into a single "-",
 * with no leading or trailing "-". An empty or symbol-only text gives "".
 */
export function slugify(text: string): string {
  const dashed = text
    .normalize("NFD")
    .replace(COMBINING_MARKS, "")
    .toLowerCase()
    .replace(NON_ALPHANUMERIC, "-");
  // Runs are already collapsed, so at most one "-" sits at each end
  const start = dashed.startsWith("-") ? 1 : 0;
  const end = dashed.endsWith("-") ? dashed.length - 1 : dashed.length;
  return start >= end ? "" : dashed.slice(start, end);
}
