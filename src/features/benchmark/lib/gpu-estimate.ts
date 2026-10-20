/**
 * GPU memory ESTIMATE for a Cosmograph network (#126). A page cannot read GPU memory, so this
 * models the buffers cosmos.gl 3 (the renderer inside Cosmograph 2.3) allocates, from the
 * allocations in `@cosmos.gl/graph/dist/index.js`:
 *
 * - point-state textures, rgba32float (16 B/texel), side `ceil(√points)`: current/previous
 *   position, velocity, selected, greyout status, pinned status, size, random values and the
 *   link first-index/amount texture (9); +2 with clustering (cluster, cluster force coefficient);
 * - link-force textures, rgba32float, side `ceil(√(2·links))`: indices, bias & strength,
 *   random distance (3);
 * - per-link vertex buffers: point A (2 f32), point B (2), colour (4), width (1), arrow (1),
 *   link index (1) → 44 B per link;
 * - per-point vertex buffers: colour (4 f32), size (1), shape (1), point index (2) → 32 B;
 * - screen-sized buffers: the link-index picking texture (rgba32float) and the double-buffered
 *   RGBA8 drawing buffer, at device pixels.
 *
 * Driver overhead, alignment padding, shader programs, atlases and the browser compositor are
 * NOT included. Always label this value as an estimate.
 */

export interface GpuEstimateInput {
  points: number;
  links: number;
  clustering: boolean;
  /** Canvas size in CSS pixels. */
  canvasWidth: number;
  canvasHeight: number;
  devicePixelRatio: number;
}

export interface GpuMemoryEstimate {
  kind: "estimate";
  totalBytes: number;
  breakdown: {
    pointTextures: number;
    linkTextures: number;
    linkBuffers: number;
    pointBuffers: number;
    screenBuffers: number;
  };
  model: string;
}

const RGBA32F_BYTES = 16;
const POINT_TEXTURES = 9;
const CLUSTER_TEXTURES = 2;
const LINK_TEXTURES = 3;
const BYTES_PER_LINK = 11 * 4;
const BYTES_PER_POINT = 8 * 4;

export const GPU_ESTIMATE_MODEL = "cosmos.gl-3.0-buffers-v1";

export function estimateGpuMemory(input: GpuEstimateInput): GpuMemoryEstimate {
  const pointSide = Math.ceil(Math.sqrt(Math.max(0, input.points)));
  const linkSide = Math.ceil(Math.sqrt(Math.max(0, input.links) * 2));
  const pointTexel = pointSide * pointSide * RGBA32F_BYTES;
  const textures = POINT_TEXTURES + (input.clustering ? CLUSTER_TEXTURES : 0);
  const devicePixels =
    Math.round(input.canvasWidth * input.devicePixelRatio) *
    Math.round(input.canvasHeight * input.devicePixelRatio);

  const breakdown = {
    pointTextures: pointTexel * textures,
    linkTextures: linkSide * linkSide * RGBA32F_BYTES * LINK_TEXTURES,
    linkBuffers: input.links * BYTES_PER_LINK,
    pointBuffers: input.points * BYTES_PER_POINT,
    screenBuffers: devicePixels * (RGBA32F_BYTES + 2 * 4),
  };
  const totalBytes = Object.values(breakdown).reduce((sum, v) => sum + v, 0);
  return { kind: "estimate", totalBytes, breakdown, model: GPU_ESTIMATE_MODEL };
}
