/**
 * CSV files the app exports (the data table, the polarization table): `;` separator, UTF-8 BOM
 * (Excel opens accents correctly), fields quoted only when they contain `;`, `"` or a newline.
 * Numbers are formatted by the caller (dot decimals, language-neutral).
 */

/** A field as it goes in the file: quoted (inner quotes doubled) only when needed. */
export function escapeField(value: string): string {
  return /[";\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** The file's content: BOM, the header line, then one line per row. */
export function buildCsv(
  headers: readonly string[],
  rows: ReadonlyArray<readonly string[]>,
): string {
  const lines = [headers.map(escapeField).join(";")];
  for (const row of rows) {
    lines.push(row.map(escapeField).join(";"));
  }
  return `\ufeff${lines.join("\n")}`;
}

/** Triggers a client-side download of the CSV content. */
export function downloadCsv(fileName: string, content: string): void {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const anchor = document.createElement("a");
  anchor.href = URL.createObjectURL(blob);
  anchor.download = fileName;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(anchor.href), 3000);
}
