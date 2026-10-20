/**
 * Polarization replica (#129) — builds a measure instance from its registry id and parameters
 * (missing parameters take the package defaults). Constructor validation is the package's, so
 * invalid parameters throw a `PolarizationError`.
 */

import { ALIENATIONS } from "./alienation";
import type { PolarizationMeasure } from "./base";
import { EMDPol } from "./literature/emd-pol";
import { EstebanRay } from "./literature/esteban-ray";
import { Experts } from "./literature/experts";
import { GeneralizedER } from "./literature/generalized-er";
import { ShannonPol } from "./literature/shannon-pol";
import { VanDerEijkPol } from "./literature/van-der-eijk-pol";
import { BiPol } from "./proposed/bipol";
import { GeneralizedMEC } from "./proposed/generalized-mec";
import { MEC } from "./proposed/mec";
import { MECNormalized } from "./proposed/mec-normalized";
import { defaultParams, type MeasureId, type MeasureParams } from "./registry";

export function createMeasure(id: MeasureId, params: MeasureParams = {}): PolarizationMeasure {
  const p = { ...defaultParams(id), ...params };
  const alpha = p.alpha as number;
  const beta = p.beta as number;
  switch (id) {
    case "EstebanRay":
      return new EstebanRay(alpha, p.K ?? null);
    case "GeneralizedER":
      return new GeneralizedER(alpha, ALIENATIONS[p.alienation ?? "d"]);
    case "EMDPol":
      return new EMDPol();
    case "Experts":
      return new Experts();
    case "ShannonPol":
      return new ShannonPol();
    case "VanDerEijkPol":
      return new VanDerEijkPol();
    case "MEC":
      return new MEC(alpha, beta);
    case "MECNormalized":
      return new MECNormalized(alpha, beta);
    case "GeneralizedMEC":
      return new GeneralizedMEC(alpha, ALIENATIONS[p.alienation ?? "d"]);
    case "BiPol":
      return new BiPol();
  }
}
