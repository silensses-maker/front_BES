import { describe, expect, it } from "vitest";
import { buildCsv } from "@/shared/lib/csv";
import {
  type CsvColumn,
  type CsvContext,
  type CsvSeries,
  csvLabel,
  csvNumber,
  fileStamp,
  LONG_HEADERS,
  longCsv,
  NETWORK_ID_CHARS,
  paramsText,
  polarizationCsv,
  polarizationCsvFileName,
  wideCsv,
} from "./polarization-csv";

// ─── Fixtures ────────────────────────────────────────────────────────────────

interface SeriesOptions {
  levels?: string[];
  classification?: object | null;
  packageVersion?: string | null;
  packageRef?: string | null;
}

/** `values[round]`: a number (value), null (none), a string (the package's error), undefined. */
function series(
  values: Array<number | null | string | undefined>,
  options?: SeriesOptions,
): CsvSeries {
  const {
    levels = [],
    classification = null,
    packageVersion = "0.1.0a2",
    packageRef = "0e05564ed0b7b23de368dd19becac3a1de4ef745",
  } = options ?? {};
  return {
    maxRound: values.length - 1,
    answeredAt: (round) => values[round] !== undefined,
    valueAt: (round) => {
      const value = values[round];
      return typeof value === "number" ? value : null;
    },
    levelAt: (round) => levels[round] ?? null,
    errorAt: (round) => {
      const value = values[round];
      return typeof value === "string" ? value : null;
    },
    classification,
    packageVersion,
    packageRef,
  };
}

const ESTEBAN_RAY = {
  id: "EstebanRay",
  params: [
    { name: "alpha", default: 0.8 },
    { name: "K", default: null },
  ],
};
const GENERALIZED_MEC = {
  id: "GeneralizedMEC",
  params: [
    { name: "alpha", default: 2 },
    { name: "alienation", default: "d" },
  ],
};
const BIPOL = { id: "BiPol", params: [] };
const THRESHOLDS = { method: "kmeans", levels: ["low", "medium", "high"], thresholds: [0.3, 0.5] };

function column(overrides: Partial<CsvColumn> & Pick<CsvColumn, "meta">): CsvColumn {
  const params = Object.fromEntries(overrides.meta.params.map((p) => [p.name, p.default]));
  const base: CsvColumn = {
    csvLabel: "",
    meta: overrides.meta,
    params,
    k: 5,
    belief: "private",
    supported: true,
    series: null,
  };
  const merged = { ...base, ...overrides };
  return { ...merged, csvLabel: overrides.csvLabel ?? csvLabel(merged) };
}

const CONTEXT: CsvContext = {
  runId: "run-42",
  networkId: "net-abcdef0123",
  fallbackPackage: { version: "0.0.9", ref: "catalogref" },
};

// ─── Values and parameters ───────────────────────────────────────────────────

describe("csvNumber", () => {
  it("keeps full precision (shortest round-trip), dot decimals, no grouping", () => {
    for (const value of [0.1 + 0.2, 1 / 3, 0.123456789012345, 1234567.25, 2, 0, 1e-7]) {
      expect(Number(csvNumber(value))).toBe(value);
    }
    expect(csvNumber(0.1 + 0.2)).toBe("0.30000000000000004");
    expect(csvNumber(1234567.25)).toBe("1234567.25");
    expect(csvNumber(1 / 3)).toBe("0.3333333333333333");
  });
});

describe("paramsText", () => {
  it("is a stable name=value list in the catalog's order, f(d) by its id, auto as null", () => {
    expect(paramsText({ meta: ESTEBAN_RAY, params: { K: null, alpha: 0.8 } })).toBe(
      "alpha=0.8,K=null",
    );
    expect(paramsText({ meta: ESTEBAN_RAY, params: { alpha: 1 / 3, K: 2 } })).toBe(
      "alpha=0.3333333333333333,K=2",
    );
    expect(
      paramsText({ meta: GENERALIZED_MEC, params: { alienation: "exp(2d)-1", alpha: 2 } }),
    ).toBe("alpha=2,alienation=exp(2d)-1");
    expect(paramsText({ meta: BIPOL, params: {} })).toBe("");
  });
});

describe("csvLabel", () => {
  it("names the measure id, k, belief and the parameters that differ from the defaults", () => {
    expect(csvLabel({ meta: BIPOL, params: {}, k: 5, belief: "private" })).toBe(
      "BiPol (k=5, private)",
    );
    expect(
      csvLabel({ meta: ESTEBAN_RAY, params: { alpha: 1.5, K: null }, k: 3, belief: "public" }),
    ).toBe("EstebanRay (k=3, public, alpha=1.5)");
    expect(
      csvLabel({
        meta: GENERALIZED_MEC,
        params: { alpha: 2, alienation: "d^2" },
        k: 7,
        belief: "private",
      }),
    ).toBe("GeneralizedMEC (k=7, private, alienation=d^2)");
  });
});

// ─── Long format ─────────────────────────────────────────────────────────────

describe("longCsv", () => {
  it("one row per round × series the server answered, with the package of each series", () => {
    const columns = [
      column({
        meta: ESTEBAN_RAY,
        series: series([0.1 + 0.2, 0.5], {
          levels: ["low", "medium"],
          classification: THRESHOLDS,
        }),
      }),
      column({ meta: BIPOL, belief: "public", series: series([1, null]) }),
    ];
    const csv = longCsv(columns, [0, 1], CONTEXT);
    expect(csv.headers).toEqual([...LONG_HEADERS]);
    expect(csv.headers.join(";")).toBe(
      "run_id;network_id;round;measure;params;k;belief;value;level;pol_measures_version;pol_measures_ref",
    );
    const ref = "0e05564ed0b7b23de368dd19becac3a1de4ef745";
    expect(csv.rows).toEqual([
      [
        "run-42",
        "net-abcdef0123",
        "0",
        "EstebanRay",
        "alpha=0.8,K=null",
        "5",
        "private",
        "0.30000000000000004",
        "low",
        "0.1.0a2",
        ref,
      ],
      ["run-42", "net-abcdef0123", "0", "BiPol", "", "5", "public", "1", "", "0.1.0a2", ref],
      [
        "run-42",
        "net-abcdef0123",
        "1",
        "EstebanRay",
        "alpha=0.8,K=null",
        "5",
        "private",
        "0.5",
        "medium",
        "0.1.0a2",
        ref,
      ],
      // Answered without a value: empty value and level
      ["run-42", "net-abcdef0123", "1", "BiPol", "", "5", "public", "", "", "0.1.0a2", ref],
    ]);
  });

  it("partial data: rounds a series has not answered yet are left out (no fake empty rows)", () => {
    const columns = [
      column({ meta: BIPOL, series: series([0.2, 0.3, 0.4]) }),
      column({ meta: BIPOL, belief: "public", series: series([0.9]) }),
    ];
    const rows = longCsv(columns, [0, 1, 2], CONTEXT).rows;
    expect(rows.map((row) => `${row[2]}:${row[6]}`)).toEqual([
      "0:private",
      "0:public",
      "1:private",
      "2:private",
    ]);
  });

  it("leaves out columns without data (measure not defined for k, no series yet)", () => {
    const columns = [
      column({ meta: { id: "Experts", params: [] }, k: 3, supported: false }),
      column({ meta: BIPOL }),
      column({ meta: BIPOL, series: series([0.5]) }),
    ];
    const rows = longCsv(columns, [0], CONTEXT).rows;
    expect(rows).toHaveLength(1);
    expect(rows[0]?.[3]).toBe("BiPol");
  });

  it("falls back to the catalog's package when a series has not reported one", () => {
    const columns = [
      column({ meta: BIPOL, series: series([0.5], { packageVersion: null, packageRef: null }) }),
    ];
    expect(longCsv(columns, [0], CONTEXT).rows[0]?.slice(-2)).toEqual(["0.0.9", "catalogref"]);
    expect(longCsv(columns, [0], { ...CONTEXT, fallbackPackage: null }).rows[0]?.slice(-2)).toEqual(
      ["", ""],
    );
  });

  it("empty data: only the header line", () => {
    const csv = longCsv([column({ meta: BIPOL, series: series([]) })], [], CONTEXT);
    expect(csv.rows).toEqual([]);
    expect(buildCsv(csv.headers, csv.rows).slice(1)).toBe(LONG_HEADERS.join(";"));
  });

  it("quotes a params field only when the CSV escaping needs it", () => {
    const odd = { id: "Odd", params: [{ name: "f", default: 'a;"b"' }] };
    const csv = longCsv([column({ meta: odd, series: series([0.5]) })], [0], CONTEXT);
    const text = buildCsv(csv.headers, csv.rows);
    expect(text).toContain(';"f=a;""b"""');
    // The usual params need none
    const usual = longCsv([column({ meta: ESTEBAN_RAY, series: series([0.5]) })], [0], CONTEXT);
    expect(buildCsv(usual.headers, usual.rows)).toContain(";alpha=0.8,K=null;");
  });
});

// ─── Wide format ─────────────────────────────────────────────────────────────

describe("wideCsv", () => {
  it("one row per round, a value column per series plus a level column when it has thresholds", () => {
    const columns = [
      column({
        meta: ESTEBAN_RAY,
        series: series([0.25, 1 / 3], { levels: ["low", "high"], classification: THRESHOLDS }),
      }),
      column({ meta: BIPOL, series: series([0.75, undefined]) }),
    ];
    const csv = wideCsv(columns, [0, 1], CONTEXT);
    expect(csv.headers).toEqual([
      "run_id",
      "network_id",
      "round",
      "EstebanRay (k=5, private)",
      "EstebanRay (k=5, private) level",
      "BiPol (k=5, private)",
      "pol_measures_version",
      "pol_measures_ref",
    ]);
    const ref = "0e05564ed0b7b23de368dd19becac3a1de4ef745";
    expect(csv.rows).toEqual([
      ["run-42", "net-abcdef0123", "0", "0.25", "low", "0.75", "0.1.0a2", ref],
      // BiPol has not reached round 1 yet: an empty cell
      ["run-42", "net-abcdef0123", "1", "0.3333333333333333", "high", "", "0.1.0a2", ref],
    ]);
  });

  it("uses the columns' unique labels (two copies of a series)", () => {
    const columns = [
      column({ meta: BIPOL, csvLabel: "BiPol (k=5, private)", series: series([0.5]) }),
      column({ meta: BIPOL, csvLabel: "BiPol (k=5, private) (2)", series: series([0.5]) }),
    ];
    expect(wideCsv(columns, [0], CONTEXT).headers.slice(3, 5)).toEqual([
      "BiPol (k=5, private)",
      "BiPol (k=5, private) (2)",
    ]);
  });

  it("has constant package columns: the first series that reported them, else the catalog's", () => {
    const columns = [
      column({ meta: BIPOL, series: series([0.5], { packageVersion: null, packageRef: null }) }),
      column({ meta: BIPOL, belief: "public", series: series([0.5], { packageRef: "abc" }) }),
    ];
    expect(wideCsv(columns, [0], CONTEXT).rows[0]?.slice(-2)).toEqual(["0.1.0a2", "abc"]);
    const none = [
      column({ meta: BIPOL, series: series([0.5], { packageVersion: null, packageRef: null }) }),
    ];
    expect(wideCsv(none, [0], CONTEXT).rows[0]?.slice(-2)).toEqual(["0.0.9", "catalogref"]);
    expect(wideCsv(none, [0], { ...CONTEXT, fallbackPackage: null }).rows[0]?.slice(-2)).toEqual([
      "",
      "",
    ]);
  });

  it("leaves out columns without data, and is only the header without rounds", () => {
    const columns = [
      column({ meta: { id: "Experts", params: [] }, k: 3, supported: false }),
      column({ meta: BIPOL, series: series([]) }),
    ];
    const csv = wideCsv(columns, [], CONTEXT);
    expect(csv.headers).toEqual([
      "run_id",
      "network_id",
      "round",
      "BiPol (k=5, private)",
      "pol_measures_version",
      "pol_measures_ref",
    ]);
    expect(csv.rows).toEqual([]);
  });

  it("polarizationCsv picks the format", () => {
    const columns = [column({ meta: BIPOL, series: series([0.5]) })];
    expect(polarizationCsv("long", columns, [0], CONTEXT)).toEqual(longCsv(columns, [0], CONTEXT));
    expect(polarizationCsv("wide", columns, [0], CONTEXT)).toEqual(wideCsv(columns, [0], CONTEXT));
  });
});

// ─── File name ───────────────────────────────────────────────────────────────

describe("polarizationCsvFileName", () => {
  const date = new Date(2026, 9, 21, 9, 5);

  it("stamps the local date and time as YYYYMMDD-HHmm", () => {
    expect(fileStamp(date)).toBe("20261021-0905");
    expect(fileStamp(new Date(2027, 0, 2, 23, 59))).toBe("20270102-2359");
  });

  it("names the mode, the format, the run and the network (short)", () => {
    expect(
      polarizationCsvFileName({
        mode: "series",
        format: "long",
        runId: "run-42",
        networkId: "a1b2c3d4e5f6a7b8",
        date,
      }),
    ).toBe("polarization-series-long-runrun-42-neta1b2c3d4-20261021-0905.csv");
    expect(
      polarizationCsvFileName({ mode: "all", format: "wide", runId: "7", networkId: "n1", date }),
    ).toBe("polarization-all-measures-wide-run7-netn1-20261021-0905.csv");
    expect(NETWORK_ID_CHARS).toBe(8);
  });

  it("keeps the name file-system safe", () => {
    expect(
      polarizationCsvFileName({
        mode: "series",
        format: "wide",
        runId: "a/b c",
        networkId: "x:y",
        date,
      }),
    ).toBe("polarization-series-wide-runa_b_c-netx_y-20261021-0905.csv");
    expect(
      polarizationCsvFileName({ mode: "series", format: "wide", runId: "", networkId: "", date }),
    ).toBe("polarization-series-wide-rununknown-netunknown-20261021-0905.csv");
  });
});
