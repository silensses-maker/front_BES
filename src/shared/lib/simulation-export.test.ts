import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildEnvelope,
  downloadEnvelopeJson,
  parseEnvelope,
  readJsonFile,
  type SimConfigEnvelope,
} from "./simulation-export";

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

  it("sets appVersion to a non-empty string (package version or 'unknown' fallback)", () => {
    const envelope = buildEnvelope({});
    expect(typeof envelope.appVersion).toBe("string");
    expect(envelope.appVersion.length).toBeGreaterThan(0);
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
