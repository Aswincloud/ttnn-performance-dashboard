# GitHub Actions Workflows

## Daily eltwise perf: `daily-eltwise-perf.yml`

This repo holds **no tenstorrent credential**. PATs are banned for tenstorrent repos (ITSEC-295), so the only writes to `tenstorrent/tt-metal` happen on the owner's machine, and this workflow only reads (tt-metal is public).

```
owner's machine, cron 01:00 IST: ~/bin/perf-ci-dispatch.sh   (local gh login; never leaves the box)
  rebase Aswinmcw/test_eltwise_perf onto tt-metal main -> push
  dispatch test-dispatch.yaml (return_run_details -> exact run id)
  gh workflow run daily-eltwise-perf.yml -f mode=monitor -f run_id=<id>
                      │
this workflow (github.token only)
  monitor:  check the run is our branch's test-dispatch run -> poll -> download artifacts
            -> merge shards -> provenance check -> auto-merging data PR
```

### Modes

| Mode | Started by | What it does |
|---|---|---|
| `monitor` | the dispatch box (`workflow_dispatch`, `run_id` required) | Poll the given tt-metal run, then ingest it. |
| `recover` | you (`workflow_dispatch`, `run_id` optional) | Ingest an already-finished, successful run (blank `run_id` = newest successful run on the branch). |
| `freshness` | cron `30 23 * * *` (05:00 IST) | Read-only: every combo in `COMBOS` must have a result measured in the last 24 h (per `data/workflow/index.json`). Ingests nothing. |

Any failure (including `stale-data` from `freshness`) files or updates a labelled issue and posts to Slack.

### When something fails

- **Partial tt-metal failure** (some combos failed): on the dispatch box, `~/bin/perf-ci-dispatch.sh --rerun <run_id>` re-runs the failed jobs and starts `monitor` again. This workflow can't, because re-running is a write on tt-metal.
- **Nothing dispatched or rebase conflict:** the box posts to Slack itself. See `~/perf-ci-dispatch.log`.
- **Re-run the whole day:** `~/bin/perf-ci-dispatch.sh --force` on the box.
- **Ingest a finished run by hand:** Actions → *Daily eltwise perf (tt-metal)* → Run workflow → `mode=recover`, `run_id=<id>`.
