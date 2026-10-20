import { type ComponentType, type LazyExoticComponent, lazy, Suspense } from "react";

let LazyView: LazyExoticComponent<ComponentType> | null = null;

const Nothing: ComponentType = () => null;

/**
 * The run charts' Polarization view, loaded on first render: the view (ECharts, the measures) is
 * its own async chunk. The lazy component is created on first use, not at module load, so this
 * module stays side-effect free; the `import()` sits behind `__POLARIZATION__` so a build with the
 * replica disabled does not even emit the chunk.
 */
export function PolarizationPanel() {
  LazyView ??= lazy(() =>
    __POLARIZATION__
      ? import(/* webpackChunkName: "run-polarization" */ "./polarization-panel").then((m) => ({
          default: m.PolarizationPanelView,
        }))
      : Promise.resolve({ default: Nothing }),
  );
  return (
    <Suspense fallback={null}>
      <LazyView />
    </Suspense>
  );
}
