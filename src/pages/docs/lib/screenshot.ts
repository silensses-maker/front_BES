import type { DocLang } from "../model/sections";

export type ScreenshotTheme = "light" | "dark";

/** Slot names: lower-case words joined by dashes (they are file names). */
const SLOT_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isScreenshotName(name: string): boolean {
  return SLOT_NAME.test(name);
}

/** The theme variant to show for next-themes' resolved theme (anything but dark reads light). */
export function screenshotTheme(resolvedTheme: string | undefined): ScreenshotTheme {
  return resolvedTheme === "dark" ? "dark" : "light";
}

/**
 * Public URL of a manual screenshot: `/docs/<lang>/<theme>/<name>.webp`, served from
 * `public/docs/<lang>/<theme>/<name>.webp`. Each slot has four files (two languages × two themes).
 */
export function screenshotSrc(name: string, lang: DocLang, theme: ScreenshotTheme): string {
  if (!isScreenshotName(name)) {
    throw new Error(`Invalid screenshot name "${name}": use lower-case words joined by dashes.`);
  }
  return `/docs/${lang}/${theme}/${name}.webp`;
}
