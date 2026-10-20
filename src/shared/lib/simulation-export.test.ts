import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildEnvelope,
  buildRunEnvelope,
  downloadEnvelopeJson,
  parseEnvelope,
  readJsonFile,
  type SimConfigEnvelope,
  withRunSeed,
} from "./simulation-export";

/** package.json version — what rsbuild.config.ts and vitest.config.ts compile in (#127). */
const PACKAGE_VERSION: string = JSON.parse(
  readFileSync(resolve(process.cwd(), "package.json"), "utf8"),
).version;

// ─── Module mocks ────────────────────────────────────────────────────────────

const mockCreateObjectURL = vi.fn(() => "blob:mock-url");
const mockRevokeObjectURL = vi.fn();
const mockClick = vi.fn();
const mockCreateElement = vi.fn();

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("buildEnvelope", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns an object with a createdAt ISO string", () => {
    const envelope = buildEnvelope({ networkType: "generated" });
    expect(typeof envelope.createdAt).toBe("string");
    expect(() => new Date(envelope.createdAt)).not.toThrow();
    expect(new Date(envelope.createdAt).toISOString()).toBe(envelope.createdAt);
  });

  it("includes the provided payload verbatim", () => {
    const payload = { networkType: "generated", numberOfAgents: 10 };
    const envelope = buildEnvelope(payload);
    expect(envelope.payload).toEqual(payload);
  });

  it("sets appVersion to the package.json version compiled in at build time (#127)", () => {
    const envelope = buildEnvelope({});
    expect(envelope.appVersion).toBe(__APP_VERSION__);
    expect(envelope.appVersion).toBe(PACKAGE_VERSION);
    expect(envelope.appVersion).toMatch(/^\d+\.\d+\.\d+/);
    expect(envelope.appVersion).not.toBe("unknown");
  });

  it("does not include runId when not provided", () => {
    const envelope = buildEnvelope({ networkType: "generated" });
    expect(envelope).not.toHaveProperty("runId");
  });

  it("includes runId when provided", () => {
    const envelope = buildEnvelope({ networkType: "generated" }, "run-42");
    expect(envelope.runId).toBe("run-42");
  });

  it("does not include runId when undefined is passed explicitly", () => {
    const envelope = buildEnvelope({ networkType: "generated" }, undefined);
    expect(envelope).not.toHaveProperty("runId");
  });
});

describe("buildRunEnvelope", () => {
  const generated = { networkType: "generated", seed: null, numberOfAgents: 10 };

  it("records appVersion, runId and the exact seed, before the payload", () => {
    const envelope = buildRunEnvelope(generated, {
      runId: "7123456789012345678",
      seed: "987654321",
    });
    expect(Object.keys(envelope)).toEqual(["createdAt", "appVersion", "runId", "seed", "payload"]);
    expect(envelope.appVersion).toBe(PACKAGE_VERSION);
    expect(envelope.runId).toBe("7123456789012345678");
    expect(envelope.seed).toBe("987654321");
    expect(envelope.payload.seed).toBe(987654321);
    expect(new Date(envelope.createdAt).toISOString()).toBe(envelope.createdAt);
  });

  it("writes the run's seed into a generated payload, so loading the file replays the run", () => {
    const envelope = buildRunEnvelope(generated, { runId: "1", seed: "42" });
    expect(envelope.payload).toEqual({ ...generated, seed: 42 });
    // The launched configuration itself is not mutated
    expect(generated.seed).toBeNull();
  });

  it("keeps 64-bit seeds exact in the envelope; the payload only takes 0 … 2^53 − 1", () => {
    for (const seed of ["9223372036854775807", "-9223372036854775808", "9007199254740992", "-1"]) {
      const envelope = buildRunEnvelope(generated, { runId: "1", seed });
      expect(JSON.parse(JSON.stringify(envelope)).seed).toBe(seed);
      expect(envelope.payload).toBe(generated);
    }
    for (const [seed, value] of [
      ["0", 0],
      ["9007199254740991", Number.MAX_SAFE_INTEGER],
    ] as const) {
      expect(buildRunEnvelope(generated, { runId: "1", seed }).payload.seed).toBe(value);
    }
  });

  it("omits seed when the backend reports none (custom runs, older backends) or a non-integer", () => {
    const custom = { networkType: "custom", agents: [] };
    for (const seed of [null, undefined, "", "1.5", "1e3", "0x10", " 42", "042", "abc"]) {
      const envelope = buildRunEnvelope(custom, { runId: "r", seed });
      expect(envelope).not.toHaveProperty("seed");
      expect(envelope.runId).toBe("r");
      expect(envelope.payload).toBe(custom);
    }
  });

  it("withRunSeed leaves custom payloads and malformed seeds alone", () => {
    const custom = { networkType: "custom", agents: [] };
    expect(withRunSeed(custom, "42")).toBe(custom);
    for (const seed of ["", "1.5", "1e3", "042", "abc"]) {
      expect(withRunSeed(generated, seed)).toBe(generated);
    }
  });

  it("round-trips through parseEnvelope with runId and seed", () => {
    const envelope = buildRunEnvelope(generated, { runId: "run-9", seed: "5" });
    const parsed = parseEnvelope(JSON.parse(JSON.stringify(envelope)));
    expect(parsed).toEqual(envelope);
  });
});

describe("downloadEnvelopeJson", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockCreateElement.mockReturnValue({
      href: "",
      download: "",
      click: mockClick,
    });

    vi.stubGlobal("URL", {
      createObjectURL: mockCreateObjectURL,
      revokeObjectURL: mockRevokeObjectURL,
    });
    vi.spyOn(document, "createElement").mockImplementation(mockCreateElement);
  });

  const mockEnvelope: SimConfigEnvelope = {
    createdAt: "2024-01-01T00:00:00.000Z",
    appVersion: "1.0.0",
    payload: { networkType: "generated" },
  };

  it("creates a Blob and calls URL.createObjectURL", () => {
    downloadEnvelopeJson(mockEnvelope, "generated");
    expect(mockCreateObjectURL).toHaveBeenCalledOnce();
  });

  it("creates an anchor element and clicks it", () => {
    downloadEnvelopeJson(mockEnvelope, "generated");
    expect(mockCreateElement).toHaveBeenCalledWith("a");
    expect(mockClick).toHaveBeenCalledOnce();
  });

  it("revokes the object URL after clicking", () => {
    downloadEnvelopeJson(mockEnvelope, "generated");
    expect(mockRevokeObjectURL).toHaveBeenCalledWith("blob:mock-url");
  });

  it("sets the download filename to include networkType", () => {
    const anchor = { href: "", download: "", click: mockClick };
    mockCreateElement.mockReturnValue(anchor);

    downloadEnvelopeJson(mockEnvelope, "custom");
    expect(anchor.download).toMatch(/^bes-config-custom-\d+\.json$/);
  });

  it("names the file after the run when the envelope has a runId (#127)", () => {
    const anchor = { href: "", download: "", click: mockClick };
    mockCreateElement.mockReturnValue(anchor);

    const file = downloadEnvelopeJson(
      { ...mockEnvelope, runId: "7123456789012345678" },
      "generated",
    );
    expect(anchor.download).toBe("bes-config-generated-7123456789012345678.json");
    expect(file).toBe(anchor.download);
  });

  it("returns the downloaded file name (shown by the export toasts)", () => {
    const anchor = { href: "", download: "", click: mockClick };
    mockCreateElement.mockReturnValue(anchor);

    const file = downloadEnvelopeJson(mockEnvelope, "custom");
    expect(file).toBe(anchor.download);
    expect(file).toMatch(/^bes-config-custom-\d+\.json$/);
  });

  it("sets the anchor href to the created object URL", () => {
    const anchor = { href: "", download: "", click: mockClick };
    mockCreateElement.mockReturnValue(anchor);

    downloadEnvelopeJson(mockEnvelope, "generated");
    expect(anchor.href).toBe("blob:mock-url");
  });
});

describe("readJsonFile", () => {
  it("resolves with parsed JSON when the file contains valid JSON", async () => {
    const content = JSON.stringify({ networkType: "generated", count: 5 });
    const file = new File([content], "config.json", { type: "application/json" });

    const result = await readJsonFile(file);
    expect(result).toEqual({ networkType: "generated", count: 5 });
  });

  it("resolves with an array when the file contains a JSON array", async () => {
    const content = JSON.stringify([1, 2, 3]);
    const file = new File([content], "data.json", { type: "application/json" });

    const result = await readJsonFile(file);
    expect(result).toEqual([1, 2, 3]);
  });

  it("rejects with SyntaxError when the file contains invalid JSON", async () => {
    const file = new File(["not valid json {{"], "bad.json", { type: "application/json" });

    await expect(readJsonFile(file)).rejects.toBeInstanceOf(SyntaxError);
  });

  it("rejects with SyntaxError when the file is empty", async () => {
    const file = new File([""], "empty.json", { type: "application/json" });

    await expect(readJsonFile(file)).rejects.toBeInstanceOf(SyntaxError);
  });
});

describe("parseEnvelope", () => {
  describe("null and non-object inputs", () => {
    it("returns null for null input", () => {
      expect(parseEnvelope(null)).toBeNull();
    });

    it("returns null for a string input", () => {
      expect(parseEnvelope("some string")).toBeNull();
    });

    it("returns null for a number input", () => {
      expect(parseEnvelope(42)).toBeNull();
    });

    it("returns null for a boolean input", () => {
      expect(parseEnvelope(true)).toBeNull();
    });
  });

  describe("enveloped format", () => {
    it("parses a valid enveloped payload", () => {
      const raw = {
        createdAt: "2024-01-01T00:00:00.000Z",
        appVersion: "1.2.3",
        payload: { networkType: "generated", numberOfAgents: 10 },
      };
      const result = parseEnvelope(raw);
      expect(result).not.toBeNull();
      expect(result?.createdAt).toBe("2024-01-01T00:00:00.000Z");
      expect(result?.appVersion).toBe("1.2.3");
      expect(result?.payload).toEqual({ networkType: "generated", numberOfAgents: 10 });
    });

    it("includes runId when present in the envelope", () => {
      const raw = {
        createdAt: "2024-01-01T00:00:00.000Z",
        appVersion: "1.0.0",
        runId: "run-xyz",
        payload: { networkType: "custom" },
      };
      const result = parseEnvelope(raw);
      expect(result?.runId).toBe("run-xyz");
    });

    it("keeps the run's seed string and ignores a non-string seed", () => {
      const base = {
        createdAt: "2024-01-01T00:00:00.000Z",
        appVersion: "1.0.0",
        payload: { networkType: "generated" },
      };
      expect(parseEnvelope({ ...base, seed: "9223372036854775807" })?.seed).toBe(
        "9223372036854775807",
      );
      expect(parseEnvelope({ ...base, seed: 42 })).not.toHaveProperty("seed");
    });

    it("omits runId when not present in the envelope", () => {
      const raw = {
        createdAt: "2024-01-01T00:00:00.000Z",
        appVersion: "1.0.0",
        payload: { networkType: "custom" },
      };
      const result = parseEnvelope(raw);
      expect(result).not.toHaveProperty("runId");
    });

    it("falls back appVersion to 'unknown' when missing", () => {
      const raw = {
        createdAt: "2024-01-01T00:00:00.000Z",
        payload: { networkType: "generated" },
      };
      const result = parseEnvelope(raw);
      expect(result?.appVersion).toBe("unknown");
    });

    it("returns null when payload exists but lacks networkType", () => {
      const raw = {
        createdAt: "2024-01-01T00:00:00.000Z",
        payload: { someOtherKey: true },
      };
      expect(parseEnvelope(raw)).toBeNull();
    });

    it("returns null when payload is null", () => {
      const raw = {
        createdAt: "2024-01-01T00:00:00.000Z",
        payload: null,
      };
      expect(parseEnvelope(raw)).toBeNull();
    });

    it("returns null when payload.networkType is not a string", () => {
      const raw = {
        createdAt: "2024-01-01T00:00:00.000Z",
        payload: { networkType: 99 },
      };
      expect(parseEnvelope(raw)).toBeNull();
    });
  });

  describe("bare payload format (legacy)", () => {
    it("parses a bare payload with networkType at root", () => {
      const raw = { networkType: "generated", numberOfAgents: 5 };
      const result = parseEnvelope(raw);
      expect(result).not.toBeNull();
      expect(result?.payload).toEqual({ networkType: "generated", numberOfAgents: 5 });
    });

    it("sets appVersion to 'unknown' for bare payloads", () => {
      const raw = { networkType: "custom" };
      const result = parseEnvelope(raw);
      expect(result?.appVersion).toBe("unknown");
    });

    it("sets a valid createdAt ISO string for bare payloads", () => {
      const raw = { networkType: "generated" };
      const result = parseEnvelope(raw);
      expect(result?.createdAt).toBeDefined();
      expect(() => new Date(result!.createdAt)).not.toThrow();
    });

    it("returns null for an object without networkType and without createdAt", () => {
      const raw = { someField: "value" };
      expect(parseEnvelope(raw)).toBeNull();
    });
  });
});
