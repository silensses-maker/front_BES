import { type ComponentType, type LazyExoticComponent, lazy, Suspense } from "react";
import type { PolarizationPanelProps } from "./polarization-panel";

export type { PolarizationPanelProps } from "./polarization-panel";

let LazyView: LazyExoticComponent<ComponentType<PolarizationPanelProps>> | null = null;

const Nothing: ComponentType<PolarizationPanelProps> = () => null;

/**
 * The run charts' Polarization view, loaded on first render: the view (ECharts, the catalog and
 * series models, the table and its CSV export) is its own async chunk. The lazy component is
 * created on first use, not at module load, so this module stays side-effect free; the `import()`
 * sits behind `__POLARIZATION__` so a build with polarization disabled does not even emit the
 * chunk. The page passes the run / network (the export names the file after them) and its seek.
 */
export function PolarizationPanel(props: PolarizationPanelProps) {
  LazyView ??= lazy(() =>
    __POLARIZATION__
      ? import(/* webpackChunkName: "run-polarization" */ "./polarization-panel").then((m) => ({
          default: m.PolarizationPanelView,
        }))
      : Promise.resolve({ default: Nothing }),
  );
  return (
    <Suspense fallback={null}>
      <LazyView {...props} />
    </Suspense>
  );
}
