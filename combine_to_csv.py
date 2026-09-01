#!/usr/bin/env python3
"""Combine tt-metal test-dispatch shard artifacts into per-combo JSON + CSV.

A test-dispatch run uploads 20 artifacts:
    eltwise-perf-results-<HW>-<SHAPE>-shard-<i>   (HW in N150/P100a,
                                                    SHAPE in small/large, i in 1..5)
each holding one `shard-<i>.json`. This groups them into the 4 board×shape
combos, merges each combo's 5 shards with the SAME reconciliation the pipeline
uses (perf_measurement_script.merge_result_files — dedup by test_name, a success
anywhere beats a failure, deterministic order), then writes both a merged JSON
and a CSV per combo. Device-free: pure post-processing, no ttperf / no HW.

Usage:
    # 1. download the run's artifacts (needs gh + TT_METAL_PAT/gh auth on tt-metal)
    gh run download <run_id> -R tenstorrent/tt-metal -D artifacts

    # 2. produce n150_small.{json,csv}, n150_large.*, p100a_small.*, p100a_large.*
    python3 combine_to_csv.py                # reads ./artifacts, writes ./
    python3 combine_to_csv.py <artifacts_dir> <out_dir>
"""

import csv
import glob
import json
import os
import sys

from perf_measurement_script import merge_result_files

# Same dtype/shape grid the daily pipeline uses (all on N150).
DTYPES = ["bf16", "fp32"]
SHAPES = ["32x32", "256x256"]

# CSV columns match perf_measurement_script.save_results() (the 'runs' array is
# dropped — it's per-repeat raw timings, not tabular).
CSV_FIELDS = [
    "test_name", "operation_name", "average_duration_ns",
    "std_deviation_ns", "min_duration_ns", "max_duration_ns",
    "successful_runs", "timestamp",
]


def json_to_csv(json_path: str, csv_path: str) -> int:
    with open(json_path) as f:
        results = json.load(f).get("results", [])
    with open(csv_path, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=CSV_FIELDS)
        w.writeheader()
        for r in results:
            w.writerow({k: r.get(k) for k in CSV_FIELDS})
    return len(results)


def main() -> int:
    art_dir = sys.argv[1] if len(sys.argv) > 1 else "artifacts"
    out_dir = sys.argv[2] if len(sys.argv) > 2 else "."
    os.makedirs(out_dir, exist_ok=True)

    made = 0
    for hw in DTYPES:
        for shape in SHAPES:
            shards = sorted(glob.glob(
                os.path.join(art_dir,
                             f"eltwise-perf-results-{hw}-{shape}-shard-*",
                             "shard-*.json")))
            combo = f"{hw.lower()}_{shape}"
            if not shards:
                print(f"⚠️  {combo}: no shard artifacts found under {art_dir}/ — skipping")
                continue
            if len(shards) != 5:
                print(f"⚠️  {combo}: expected 5 shards, found {len(shards)} "
                      f"(merging what's present)")

            merged_json = os.path.join(out_dir, f"{combo}.json")
            merge_result_files(shards, merged_json)
            csv_path = os.path.join(out_dir, f"{combo}.csv")
            n = json_to_csv(merged_json, csv_path)
            print(f"✅ {combo}: {len(shards)} shards -> {csv_path} ({n} ops)")
            made += 1

    if made == 0:
        print(f"❌ No combos produced. Is '{art_dir}/' the `gh run download` output?",
              file=sys.stderr)
        return 1
    print(f"\n🎉 {made} combined CSV(s) written to {out_dir}/")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
