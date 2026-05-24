# Contributing

Thanks for your interest in improving the TTNN Eltwise Performance Tracker.

## Getting started

```bash
# Use the pinned Node version (see .nvmrc)
nvm use            # or: nvm install

npm ci             # exact, lockfile-based install
npm run dev        # local dev server on :3000
```

The dashboard reads performance JSON from `data/` (served via the
`public/data → ../data` symlink at build time).

## Before opening a PR

Run this locally — CI will re-run it on your PR:

```bash
npm run build       # production build must succeed
```

A Vitest test suite, an ESLint flat config, and a Prettier `format` script
are planned follow-ups; the config files (`.prettierrc.json`,
`.prettierignore`, `.editorconfig`) are already in the repo so installs
match once those scripts land.

## Python pipeline

The alert and publish scripts (`check_perf_changes.py`, `push_to_github.py`,
`test_perf_alerts.py`) install from `requirements.txt`:

```bash
pip install -r requirements.txt
```

The on-device measurement scripts (`perf_measurement_script.py`,
`test_eltwise_operations.py`) run under tt-metal's environment on Tenstorrent
hardware and are **not** pinned here.

## Pull request guidelines

- Keep PRs focused. Refactors, behaviour changes, and dependency bumps belong
  in separate PRs.
- Update or add tests when you change `src/utils/` or alert logic.
- Follow Conventional Commit prefixes where reasonable (`feat:`, `fix:`,
  `chore:`, `docs:`, `refactor:`).
- The PR template walks through summary / test plan / screenshots — please
  fill it in.

## Reporting issues

Use [GitHub Issues](https://github.com/Aswincloud/ttnn-performance-dashboard/issues).
For performance-alert tuning or pipeline questions, see
[`PERFORMANCE_ALERTS.md`](PERFORMANCE_ALERTS.md) and
[`SETUP_ALERTS.md`](SETUP_ALERTS.md).
