"""
Golden fixture generator for the TypeScript replica of pol_measures (#129).

Runs the REAL Python package (ulvenforst/pol_measures, PROMUEVA) over a fixed set of histograms
and parameter combinations and writes the values the replica in src/shared/lib/polarization/ must
reproduce. The fixture records the package commit and the command that produced it.

How to run (never install anything into the repo; everything below lives in a scratch folder):

    SCRATCH=/tmp/pol-measures-golden          # any folder OUTSIDE the repo
    COMMIT=0e05564ed0b7
    mkdir -p "$SCRATCH/src" && cd "$SCRATCH"
    gh api "repos/ulvenforst/pol_measures/tarball/$COMMIT" > pol_measures.tar.gz
    tar -xzf pol_measures.tar.gz -C "$SCRATCH/src"
    python3 -m venv "$SCRATCH/venv"
    "$SCRATCH/venv/bin/pip" install numpy scipy

    # from the repo root:
    "$SCRATCH/venv/bin/python" -I scripts/generate-pol-measures-golden.py \
        --source "$SCRATCH/src/ulvenforst-pol_measures-$COMMIT/src" \
        --commit "$COMMIT" \
        --out src/shared/lib/polarization/__fixtures__/pol-measures-golden.json

`-I` (isolated mode) ignores PYTHONPATH and keeps the current directory off sys.path, so the
package source is passed with --source and prepended to sys.path by this script instead: the only
code imported from the download is the `measures` package itself. To update the replica to a newer
commit, re-run with that commit and fix the TypeScript until `vitest` passes again.
"""

from __future__ import annotations

import argparse
import json
import math
import platform
import sys
from typing import Any, Callable


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[1])
    parser.add_argument("--source", required=True, help="pol_measures src/ folder (holds measures/)")
    parser.add_argument("--commit", required=True, help="pol_measures commit the source was taken from")
    parser.add_argument("--out", required=True, help="output JSON path")
    return parser.parse_args()


ARGS = parse_args()
sys.path.insert(0, ARGS.source)

import numpy as np  # noqa: E402
import scipy  # noqa: E402

from measures.metrics.literature import (  # noqa: E402
    EMDPol,
    EstebanRay,
    Experts,
    GeneralizedER,
    ShannonPol,
    VanDerEijkPol,
)
from measures.metrics.proposed import MEC, BiPol, GeneralizedMEC, MECNormalized  # noqa: E402
from measures.utils.optimization import mec_bisection_value  # noqa: E402

# ── Alienation functions (the set used by the package's benchmarks/generalized_er_validation) ──
ALIENATIONS: dict[str, Callable[[Any], Any]] = {
    "d": lambda d: d,
    "d^2": lambda d: d**2,
    "d^3": lambda d: d**3,
    "d+d^2": lambda d: d + d**2,
    "d+2d^2": lambda d: d + 2 * d**2,
    "exp(d)-1": lambda d: np.exp(d) - 1,
    "exp(2d)-1": lambda d: np.exp(2 * d) - 1,
}


def encode_number(value: Any) -> Any:
    """JSON has no NaN/Infinity: encode them as strings the TS test decodes."""
    value = float(value)
    if math.isnan(value):
        return "NaN"
    if math.isinf(value):
        return "Infinity" if value > 0 else "-Infinity"
    return value


def positions(k: int) -> np.ndarray:
    """Category values j/(k-1): the same doubles the replica's categoryPositions(k) produces."""
    return np.arange(k, dtype=np.float64) / (k - 1)


# ── Histograms ──────────────────────────────────────────────────────────────────────────────────
def histogram_cases() -> list[dict[str, Any]]:
    cases: list[dict[str, Any]] = []
    for k in (3, 5, 7, 10):
        mid = (k - 1) // 2
        shapes: dict[str, np.ndarray] = {}
        shapes["uniform"] = np.full(k, 12)
        consensus = np.zeros(k, dtype=np.int64)
        consensus[mid] = 100
        shapes["consensus-center"] = consensus
        first = np.zeros(k, dtype=np.int64)
        first[0] = 37
        shapes["single-bin-first"] = first
        last = np.zeros(k, dtype=np.int64)
        last[-1] = 91
        shapes["single-bin-last"] = last
        poles = np.zeros(k, dtype=np.int64)
        poles[0] = poles[-1] = 50
        shapes["two-poles"] = poles
        uneven = np.zeros(k, dtype=np.int64)
        uneven[0], uneven[-1] = 60, 40
        shapes["two-poles-uneven"] = uneven
        clusters = np.zeros(k, dtype=np.int64)
        clusters[0], clusters[mid], clusters[-1] = 30, 40, 30
        shapes["three-clusters"] = clusters
        shapes["skewed"] = np.array([2 ** (k - i) for i in range(k)], dtype=np.int64)
        near = np.zeros(k, dtype=np.int64)
        near[mid], near[mid + 1] = 70, 30
        shapes["adjacent-pair"] = near
        for seed in (1, 2, 3, 4):
            rng = np.random.default_rng(seed * 1000 + k)
            counts = rng.integers(0, 40, size=k)
            if seed % 2 == 0:
                counts[rng.integers(0, k)] = 0  # make sure some histograms have empty bins
            if counts.sum() == 0:
                counts[0] = 1
            shapes[f"random-{seed}"] = counts
        for name, counts in shapes.items():
            counts = np.asarray(counts, dtype=np.int64)
            weights = counts / counts.sum()
            cases.append(
                {
                    "id": f"k{k}/{name}",
                    "k": k,
                    "counts": [int(c) for c in counts],
                    "x": [float(v) for v in positions(k)],
                    "weights": [float(w) for w in weights],
                }
            )
    return cases


# ── Measure configurations ──────────────────────────────────────────────────────────────────────
def configs() -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []

    def add(measure: str, params: dict[str, Any], factory: Callable[[], Any]) -> None:
        out.append({"measure": measure, "params": params, "factory": factory})

    for alpha in (0.8, 0.5, 1.0, 1.6):
        add("EstebanRay", {"alpha": alpha, "K": None}, lambda a=alpha: EstebanRay(alpha=a))
    add("EstebanRay", {"alpha": 0.8, "K": 1.0}, lambda: EstebanRay(alpha=0.8, K=1.0))
    for name, fn in ALIENATIONS.items():
        add("GeneralizedER", {"alpha": 0.8, "alienation": name},
            lambda f=fn: GeneralizedER(alpha=0.8, alienation=f))
    for name in ("d", "d^2", "exp(2d)-1"):
        add("GeneralizedER", {"alpha": 1.6, "alienation": name},
            lambda f=ALIENATIONS[name]: GeneralizedER(alpha=1.6, alienation=f))
    add("GeneralizedER", {"alpha": 2.5, "alienation": "d", "K": 0.5},
        lambda: GeneralizedER(alpha=2.5, K=0.5))
    add("EMDPol", {}, EMDPol)
    add("Experts", {}, Experts)
    add("ShannonPol", {}, ShannonPol)
    add("VanDerEijkPol", {}, VanDerEijkPol)
    for alpha, beta in ((2.0, 1.15), (1.0, 1.0), (2.0, 2.0), (1.0, 2.0), (2.0, 1.2), (1.5, 0.8), (0.5, 3.0)):
        add("MEC", {"alpha": alpha, "beta": beta}, lambda a=alpha, b=beta: MEC(alpha=a, beta=b))
    for alpha, beta in ((2.0, 1.15), (1.0, 1.0), (2.0, 2.0), (1.2, 1.2)):
        add("MECNormalized", {"alpha": alpha, "beta": beta},
            lambda a=alpha, b=beta: MECNormalized(alpha=a, beta=b))
    for name, fn in ALIENATIONS.items():
        add("GeneralizedMEC", {"alpha": 2.0, "alienation": name},
            lambda f=fn: GeneralizedMEC(alpha=2.0, alienation=f))
    for name in ("d", "d^2"):
        add("GeneralizedMEC", {"alpha": 1.0, "alienation": name},
            lambda f=ALIENATIONS[name]: GeneralizedMEC(alpha=1.0, alienation=f))
    add("BiPol", {}, BiPol)
    return out


def run_call(measure: Any, x: Any, weights: Any, **kwargs: Any) -> dict[str, Any]:
    try:
        return {"value": encode_number(measure(np.asarray(x), np.asarray(weights), **kwargs))}
    except Exception as exc:  # the replica must raise the same error type + message
        return {"error": {"type": type(exc).__name__, "message": str(exc)}}


def classify(measure: Any, x: Any, weights: Any) -> dict[str, Any]:
    """labels=3 (the replica's UI scheme: kmeans, 3 levels) and labels='all'."""
    value, label = measure(np.asarray(x), np.asarray(weights), labels=3)
    everything = measure(np.asarray(x), np.asarray(weights), labels="all")
    classifications = {
        method: {str(n): cat for n, cat in per_n.items()}
        for method, per_n in everything.get("classifications", {}).items()
    }
    return {"labels3": label, "labelsAll": classifications, "labelsAllError": everything.get("error")}


def main() -> None:
    cases = histogram_cases()
    # One entry per configuration; `values[i]` belongs to `cases[i]` (a number, an encoded
    # NaN/Infinity string, or {"error": {...}}). Classification outputs are recorded for the
    # measures the package has thresholds for (and MEC, which has none: "no_classification").
    results: list[dict[str, Any]] = []
    for config in configs():
        entry: dict[str, Any] = {"measure": config["measure"], "params": config["params"],
                                 "values": []}
        with_labels = config["measure"] in ("EstebanRay", "BiPol", "MECNormalized", "MEC")
        with_all = with_labels and config["params"] in (
            {"alpha": 0.8, "K": None}, {}, {"alpha": 2.0, "beta": 1.15})
        if with_labels:
            entry["labels3"] = []
        if with_all:
            entry["labelsAll"] = []
        for case in cases:
            outcome = run_call(config["factory"](), case["x"], case["weights"])
            entry["values"].append(outcome["value"] if "value" in outcome else outcome)
            if with_labels:
                labels = classify(config["factory"](), case["x"], case["weights"])
                entry["labels3"].append(labels["labels3"])
                if with_all:
                    entry["labelsAll"].append(
                        labels["labelsAll"] if labels["labelsAllError"] is None
                        else {"error": labels["labelsAllError"]})
        results.append(entry)

    # ── Validation, options and error semantics ─────────────────────────────────────────────────
    x5 = [float(v) for v in positions(5)]
    special: list[dict[str, Any]] = []

    def add_special(name: str, measure_name: str, params: dict[str, Any], factory: Callable[[], Any],
                    x: list[float], weights: list[float], **kwargs: Any) -> None:
        entry: dict[str, Any] = {"id": name, "measure": measure_name, "params": params, "x": x,
                                 "weights": weights, "options": kwargs}
        try:
            measure = factory()
        except Exception as exc:
            entry["error"] = {"type": type(exc).__name__, "message": str(exc), "at": "constructor"}
            special.append(entry)
            return
        entry.update(run_call(measure, x, weights, **kwargs))
        special.append(entry)

    add_special("empty-support", "BiPol", {}, BiPol, x5, [0.0] * 5)
    add_special("single-category", "EMDPol", {}, EMDPol, [0.0], [1.0])
    add_special("negative-weight", "ShannonPol", {}, ShannonPol, x5, [0.2, -0.2, 0.4, 0.3, 0.3])
    add_special("not-increasing", "EstebanRay", {"alpha": 0.8, "K": None}, EstebanRay,
                [0.0, 0.25, 0.2, 0.75, 1.0], [0.2] * 5)
    add_special("shape-mismatch", "EMDPol", {}, EMDPol, x5, [0.25] * 4)
    for k in (3, 7, 10):
        add_special(f"experts-k{k}", "Experts", {}, Experts, [float(v) for v in positions(k)],
                    [1.0 / k] * k)
    add_special("van-der-eijk-k2", "VanDerEijkPol", {}, VanDerEijkPol, [0.0, 1.0], [0.5, 0.5])
    add_special("er-alpha-too-big", "EstebanRay", {"alpha": 2.0, "K": None},
                lambda: EstebanRay(alpha=2.0), x5, [0.2] * 5)
    add_special("er-alpha-zero", "EstebanRay", {"alpha": 0.0, "K": None},
                lambda: EstebanRay(alpha=0.0), x5, [0.2] * 5)
    add_special("ger-alpha-zero", "GeneralizedER", {"alpha": 0.0, "alienation": "d"},
                lambda: GeneralizedER(alpha=0.0), x5, [0.2] * 5)
    add_special("mec-alpha-zero", "MEC", {"alpha": 0.0, "beta": 1.15},
                lambda: MEC(alpha=0.0), x5, [0.2] * 5)
    add_special("mec-beta-negative", "MECNormalized", {"alpha": 2.0, "beta": -1.0},
                lambda: MECNormalized(beta=-1.0), x5, [0.2] * 5)
    add_special("gmec-alpha-zero", "GeneralizedMEC", {"alpha": 0.0, "alienation": "d"},
                lambda: GeneralizedMEC(alpha=0.0), x5, [0.2] * 5)
    add_special("gmec-negative-alienation", "GeneralizedMEC", {"alpha": 1.0, "alienation": "d-1"},
                lambda: GeneralizedMEC(alpha=1.0, alienation=lambda d: d - 1.0), x5, [0.2] * 5)
    # BiPol: a single mass whose weighted mean rounds away from its position leaves one side
    # without mass -> numpy.average raises ZeroDivisionError (0.3 rounds back exactly -> 0).
    for w in (0.7, 0.3):
        add_special(f"bipol-rounding-{w}", "BiPol", {}, BiPol, [0.1, 0.2, 0.3], [w, 0.0, 0.0],
                    normalize_positions=False)
    raw_counts = [12.0, 20.0, 40.0, 21.0, 7.0]  # benchmarks/expert_validation distribution 1
    for name, params, factory in (
        ("EstebanRay", {"alpha": 0.8, "K": None}, EstebanRay),
        ("MEC", {"alpha": 2.0, "beta": 1.15}, MEC),
        ("Experts", {}, Experts),
        ("VanDerEijkPol", {}, VanDerEijkPol),
        ("BiPol", {}, BiPol),
    ):
        add_special(f"raw-counts-{name}", name, params, factory, x5, raw_counts)
        add_special(f"normalize-weights-{name}", name, params, factory, x5, raw_counts,
                    normalize_weights=True)
    for name, params, factory in (
        ("EstebanRay", {"alpha": 0.8, "K": None}, EstebanRay),
        ("ShannonPol", {}, ShannonPol),
        ("MECNormalized", {"alpha": 2.0, "beta": 1.15}, MECNormalized),
        ("EMDPol", {}, EMDPol),
    ):
        add_special(f"positions-1to5-{name}", name, params, factory, [1.0, 2.0, 3.0, 4.0, 5.0],
                    [0.1, 0.2, 0.4, 0.2, 0.1])
        add_special(f"positions-raw-{name}", name, params, factory, [1.0, 2.0, 3.0, 4.0, 5.0],
                    [0.1, 0.2, 0.4, 0.2, 0.1], normalize_positions=False)

    # ── utils.optimization.mec_bisection_value (the package's reference optimizer) ─────────────
    bisection: list[dict[str, Any]] = []
    for case in cases:
        if case["k"] not in (5, 10):
            continue
        for alpha, beta in ((2.0, 1.15), (1.0, 2.0)):
            value = mec_bisection_value(np.asarray(case["x"]), np.asarray(case["weights"]),
                                        alpha=alpha, beta=beta)
            bisection.append({"case": case["id"], "alpha": alpha, "beta": beta,
                              "value": encode_number(value)})

    fixture = {
        "header": {
            "source": "https://github.com/ulvenforst/pol_measures",
            "commit": ARGS.commit,
            "package": "measures 0.1.0a2",
            "generator": "scripts/generate-pol-measures-golden.py",
            "command": (
                "<venv>/bin/python -I scripts/generate-pol-measures-golden.py "
                f"--source <pol_measures@{ARGS.commit}>/src --commit {ARGS.commit} "
                "--out src/shared/lib/polarization/__fixtures__/pol-measures-golden.json"
            ),
            "python": platform.python_version(),
            "numpy": np.__version__,
            "scipy": scipy.__version__,
            "positions": "x_j = j/(k-1)",
            "weights": "counts / counts.sum() (float64)",
            "encoding": "NaN and +/-Infinity are encoded as the strings 'NaN', 'Infinity', '-Infinity'",
        },
        "cases": cases,
        "results": results,
        "special": special,
        "bisection": bisection,
    }
    with open(ARGS.out, "w", encoding="utf-8") as handle:
        json.dump(fixture, handle, separators=(",", ":"), allow_nan=False)
        handle.write("\n")
    print(f"wrote {len(results)} configurations x {len(cases)} cases, {len(special)} special cases, "
          f"{len(bisection)} bisection values to {ARGS.out}")


main()
