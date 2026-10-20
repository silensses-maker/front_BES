import { describe, expect, it } from "vitest";
import { estimateGpuMemory, GPU_ESTIMATE_MODEL } from "./gpu-estimate";

describe("estimateGpuMemory", () => {
  it("sums point textures, link textures, vertex buffers and screen buffers", () => {
    const e = estimateGpuMemory({
      points: 100,
      links: 50,
      clustering: false,
      canvasWidth: 10,
      canvasHeight: 10,
      devicePixelRatio: 2,
    });
    // side 10 → 100 texels × 16 B × 9 textures
    expect(e.breakdown.pointTextures).toBe(100 * 16 * 9);
    // ceil(√100) = 10 → 100 texels × 16 B × 3 textures
    expect(e.breakdown.linkTextures).toBe(100 * 16 * 3);
    expect(e.breakdown.linkBuffers).toBe(50 * 44);
    expect(e.breakdown.pointBuffers).toBe(100 * 32);
    // 20 × 20 device px × (16 + 8) B
    expect(e.breakdown.screenBuffers).toBe(400 * 24);
    expect(e.totalBytes).toBe(14_400 + 4_800 + 2_200 + 3_200 + 9_600);
    expect(e.kind).toBe("estimate");
    expect(e.model).toBe(GPU_ESTIMATE_MODEL);
  });

  it("adds the two cluster textures when clustering and scales to 100k agents", () => {
    const base = {
      points: 100_000,
      links: 599_988,
      canvasWidth: 1280,
      canvasHeight: 720,
      devicePixelRatio: 1,
    };
    const plain = estimateGpuMemory({ ...base, clustering: false });
    const clustered = estimateGpuMemory({ ...base, clustering: true });
    expect(clustered.breakdown.pointTextures - plain.breakdown.pointTextures).toBe(
      317 * 317 * 16 * 2,
    );
    expect(plain.totalBytes / 1024 / 1024).toBeGreaterThan(50);
    expect(plain.totalBytes / 1024 / 1024).toBeLessThan(200);
  });

  it("handles an empty network", () => {
    const e = estimateGpuMemory({
      points: 0,
      links: 0,
      clustering: false,
      canvasWidth: 0,
      canvasHeight: 0,
      devicePixelRatio: 1,
    });
    expect(e.totalBytes).toBe(0);
  });
});
