import { useEffect, useState } from "react";
import { type ChartTheme, readChartTheme } from "./chart-theme";

/**
 * Theme-aware chart palette: re-reads the tokens whenever the root element's attributes change
 * (next-themes toggles `class="dark"` there), and keeps the same object while the colors are
 * unchanged so chart options are not rebuilt for nothing.
 */
export function useChartTheme(): ChartTheme {
  const [theme, setTheme] = useState<ChartTheme>(readChartTheme);

  useEffect(() => {
    const update = () =>
      setTheme((previous) => {
        const next = readChartTheme();
        return next.key === previous.key ? previous : next;
      });
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "style", "data-theme"],
    });
    update();
    return () => observer.disconnect();
  }, []);

  return theme;
}
