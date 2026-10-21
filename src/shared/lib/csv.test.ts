import { afterEach, describe, expect, it, vi } from "vitest";
import { buildCsv, downloadCsv, escapeField } from "./csv";

describe("escapeField", () => {
  it("leaves plain fields as they are", () => {
    expect(escapeField("plain")).toBe("plain");
    expect(escapeField("alpha=0.8,K=null")).toBe("alpha=0.8,K=null");
    expect(escapeField("")).toBe("");
  });

  it("quotes fields with the separator, a quote or a newline, doubling inner quotes", () => {
    expect(escapeField("a;b")).toBe('"a;b"');
    expect(escapeField('say "hi"')).toBe('"say ""hi"""');
    expect(escapeField("multi\nline")).toBe('"multi\nline"');
  });
});

describe("buildCsv", () => {
  it("joins with ; prefixed by the UTF-8 BOM", () => {
    const csv = buildCsv(["a", "b"], [["1", "2"]]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.slice(1)).toBe("a;b\n1;2");
  });

  it("quotes fields containing separator, quote or newline", () => {
    const csv = buildCsv(["x"], [['va;l"ue'], ["multi\nline"], ["plain"]]);
    expect(csv).toContain('"va;l""ue"');
    expect(csv).toContain('"multi\nline"');
    expect(csv).toContain("plain");
  });

  it("escapes the headers too, and has only the header line without rows", () => {
    expect(buildCsv(["a;b", "c"], []).slice(1)).toBe('"a;b";c');
  });
});

describe("downloadCsv", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("downloads via an object-URL anchor click and revokes the URL later", () => {
    vi.useFakeTimers();
    const createObjectURL = vi.fn(() => "blob:mock");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });
    let downloaded = "";
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      downloaded = this.download;
    });

    downloadCsv("silensess-run-rondas.csv", "a;b\n1;2");

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
    expect(downloaded).toBe("silensess-run-rondas.csv");
    expect(revokeObjectURL).not.toHaveBeenCalled();

    vi.advanceTimersByTime(3000);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:mock");
  });
});
