#!/usr/bin/env python3
"""
Workflow data index + per-combo "latest" generator.

The daily perf pipeline lands results for 4 combos — 2 dtypes (bf16, fp32) x
2 shapes (32x32, 256x256), all measured on N150 — under

    data/workflow/<dtype>/<shape>/<YYYY-MM-DD>_..._final.json

This script scans those files and writes, for the dashboard to consume:

  * data/workflow/index.json   — one entry per combo: its newest-first file list
                                  (with the legacy N150/32x32 history merged in for
                                  bf16_32x32) plus the path to its "latest" snapshot.
  * data/latest/latest_<dtype>_<shape>.json — a flat snapshot (same shape as the
                                  legacy data/latest/latest_results.json) of each
                                  combo's newest complete run.

It is idempotent (a pure function of what's on disk, apart from `last_updated`)
and safe when a combo directory is missing or empty. The legacy data/index.json
and data/latest/latest_results.json are left untouched — they remain the
first-deploy fallback the loader uses before this script has ever run.

Run from the repo root (no arguments):  python3 generate_workflow_index.py
"""

import json
from datetime import datetime
from pathlib import Path

# (dtype, shape) combos, in the order they appear in the output. Everything
# runs on N150 now: the second axis was the board (N150/P100a) until the sweep
# was re-cut to trade Blackhole and the 1024x1024 shape for a dtype axis.
# These must match the tt-metal matrix's dtype/shape values and the directory
# names the daily workflow commits into (data/workflow/<dtype>/<shape>/).
COMBOS = [
    ("bf16", "32x32"),
    ("bf16", "256x256"),
    ("fp32", "32x32"),
    ("fp32", "256x256"),
]

DATA_DIR = Path("data")
WORKFLOW_DIR = DATA_DIR / "workflow"
LATEST_DIR = DATA_DIR / "latest"
LEGACY_INDEX = DATA_DIR / "index.json"
LEGACY_LATEST = LATEST_DIR / "latest_results.json"
WORKFLOW_INDEX = WORKFLOW_DIR / "index.json"

# The 7 index fields carried per file, mirroring push_to_github._update_index so
# the loader sees an identical entry shape whether it comes from the legacy index
# or from a freshly-scanned workflow file.
INDEX_FIELDS = (
    "filename",
    "path",
    "measurement_date",
    "git_commit_id",
    "total_tests",
    "successful_tests",
    "failed_tests",
)


def _is_complete_run(meta):
    """A run is complete when every test either passed or failed (no partial /
    interrupted shard). Copied from push_to_github._is_complete_run so this stays
    a standalone, dependency-free script."""
    total = meta.get("total_tests", 0)
    successful = meta.get("successful_tests", 0)
    failed = meta.get("failed_tests", 0)
    return total > 0 and total == (successful + failed)


def _metadata_entry(path, meta, source):
    """One index entry for a results file. `path` is stored POSIX-style and
    verbatim so the loader can fetch `${base}${path}` unchanged (legacy entries
    keep data/daily/..., workflow entries get data/workflow/<hw>/<shape>/...)."""
    return {
        "filename": path.name,
        "path": path.as_posix(),
        "measurement_date": meta.get("measurement_date", ""),
        "git_commit_id": meta.get("git_commit_id", "unknown"),
        "total_tests": meta.get("total_tests", 0),
        "successful_tests": meta.get("successful_tests", 0),
        "failed_tests": meta.get("failed_tests", 0),
        "source": source,
    }


def _scan_combo_dir(hw, shape):
    """Load every results JSON under data/workflow/<hw>/<shape>/.

    Returns a list of (path, metadata, results_data). A missing directory yields
    an empty list (Path.glob over a nonexistent dir is empty). A single corrupt /
    unreadable file is skipped with a warning rather than aborting the whole run."""
    combo_dir = WORKFLOW_DIR / hw / shape
    scanned = []
    for path in sorted(combo_dir.glob("*.json")):
        try:
            with open(path) as fh:
                data = json.load(fh)
        except Exception as e:  # noqa: BLE001 — one bad file must not sink the run
            print(f"  ⚠️  skipping unreadable {path}: {e}", flush=True)
            continue
        scanned.append((path, data.get("metadata", {}), data))
    return scanned


def _load_legacy_entries():
    """The legacy data/index.json file list (N150/32x32 history), each tagged
    source='legacy'. Returns [] if the legacy index is absent or malformed."""
    if not LEGACY_INDEX.exists():
        return []
    try:
        with open(LEGACY_INDEX) as fh:
            index = json.load(fh)
    except Exception as e:  # noqa: BLE001
        print(f"  ⚠️  legacy index unreadable ({e}); treating as empty", flush=True)
        return []
    entries = []
    for f in index.get("files", []):
        entry = {k: f.get(k) for k in INDEX_FIELDS}
        entry["source"] = "legacy"
        entries.append(entry)
    return entries


def _dedup_sort(entries):
    """Newest-first, deduped by (measurement_date, git_commit_id). When a legacy
    and a workflow entry collide on that key, the workflow one wins — callers pass
    workflow entries first, and we keep the first occurrence after the stable
    newest-first sort."""
    ordered = sorted(
        entries, key=lambda e: e.get("measurement_date", ""), reverse=True
    )
    seen = set()
    out = []
    for e in ordered:
        key = (e.get("measurement_date", ""), e.get("git_commit_id", ""))
        if key in seen:
            continue
        seen.add(key)
        out.append(e)
    return out


def _pick_latest(scanned):
    """The results_data for a combo's "latest" snapshot: the newest COMPLETE
    workflow run, else the newest workflow run of any kind, else None (empty
    combo). Legacy files are never latest candidates — `latest` always reflects
    the freshest workflow run; the legacy history still shows in the table."""
    if not scanned:
        return None

    def mdate(item):
        return item[1].get("measurement_date", "")

    complete = [s for s in scanned if _is_complete_run(s[1])]
    pool = complete or scanned
    newest = max(pool, key=mdate)
    return newest[2]  # results_data


def _write_latest(hw, shape, results_data):
    """Write data/latest/latest_<hw>_<shape>.json (same shape as the legacy
    latest_results.json). Returns the POSIX path string for the index."""
    LATEST_DIR.mkdir(parents=True, exist_ok=True)
    out = LATEST_DIR / f"latest_{hw}_{shape}.json"
    with open(out, "w") as fh:
        json.dump(results_data, fh, indent=2)
    return out.as_posix()


def _legacy_latest_fallback():
    """The legacy data/latest/latest_results.json contents, or None. Used so the
    default combo (bf16_32x32) has a populated snapshot on day one, before any
    nested workflow bf16/32x32 file has landed."""
    if not LEGACY_LATEST.exists():
        return None
    try:
        with open(LEGACY_LATEST) as fh:
            return json.load(fh)
    except Exception as e:  # noqa: BLE001
        print(f"  ⚠️  legacy latest unreadable ({e})", flush=True)
        return None


def main():
    legacy_entries = _load_legacy_entries()
    combos = {}

    for hw, shape in COMBOS:
        combo_key = f"{hw}_{shape}"
        scanned = _scan_combo_dir(hw, shape)
        wf_entries = [_metadata_entry(p, m, "workflow") for p, m, _ in scanned]

        # bf16_32x32 is the only merged combo: its workflow files sit on top of
        # the long legacy N150/32x32 history, which was measured at bfloat16 on
        # a 32x32 tile — i.e. the same configuration, so the series is
        # continuous. The other three are workflow-only.
        if combo_key == "bf16_32x32":
            entries = _dedup_sort(wf_entries + legacy_entries)
        else:
            entries = _dedup_sort(wf_entries)

        results_data = _pick_latest(scanned)
        # Day-one fallback: keep the default view populated even before a nested
        # workflow bf16/32x32 run exists.
        if results_data is None and combo_key == "bf16_32x32":
            results_data = _legacy_latest_fallback()

        latest_path = None
        if results_data is not None:
            latest_path = _write_latest(hw, shape, results_data)

        combos[combo_key] = {
            "latest": latest_path,
            "totalAvailable": len(entries),
            "files": entries,
        }
        n_wf = len(wf_entries)
        print(
            f"  {combo_key}: {len(entries)} files "
            f"({n_wf} workflow"
            + (f" + {len(entries) - n_wf} legacy" if combo_key == "bf16_32x32" else "")
            + f"), latest={'yes' if latest_path else 'none'}",
            flush=True,
        )

    WORKFLOW_DIR.mkdir(parents=True, exist_ok=True)
    with open(WORKFLOW_INDEX, "w") as fh:
        json.dump(
            {"last_updated": datetime.now().isoformat(), "combos": combos},
            fh,
            indent=2,
        )
    print(f"✅ wrote {WORKFLOW_INDEX}", flush=True)


if __name__ == "__main__":
    main()
