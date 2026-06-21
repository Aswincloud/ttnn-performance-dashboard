# Contributing

Thanks for your interest in improving the TTNN Eltwise Performance Tracker.

## Local development walkthrough

End-to-end steps from cloning the repo to seeing your change live on a PR preview.

### 1. Clone and install

```bash
git clone https://github.com/Aswincloud/ttnn-performance-dashboard.git
cd ttnn-performance-dashboard

nvm use            # pins to the Node version in .nvmrc (currently Node 20)
npm ci             # exact, lockfile-based install
```

No `nvm`? Install Node 20+ from [nodejs.org](https://nodejs.org/) and skip the `nvm use` step.

### 2. Run the dev server

```bash
npm run dev
```

The dashboard is now live at **http://localhost:3000** with hot module reload — saving a file in `src/` updates the page in your browser immediately.

The dashboard reads performance JSON from `data/` (served via the `public/data → ../data` symlink at build time).

### 3. Create a feature branch and make changes

```bash
git checkout -b feat/short-description    # use feat/, fix/, chore/, or docs/
```

Edit files. The dev server picks up changes automatically.

### 4. Verify the production build

CI will run this on your PR; you should too:

```bash
npm run build
```

This catches type errors, unused imports, and any issue that only surfaces in the bundled output.

### 5. Commit and push

```bash
git add path/to/changed/files
git commit -m "feat: short summary of the change"
git push -u origin feat/short-description
```

Follow [Conventional Commit](https://www.conventionalcommits.org/) prefixes where reasonable: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`.

### 6. Open the pull request

Push the branch and open a PR on GitHub. Within ~1–2 minutes Cloudflare Workers Builds will:

1. Run lint + build against your branch.
2. Deploy a **preview URL** and post it as a comment on your PR — looks like `<branch-name>-ttnn-eltwise-performance.aswincloud.workers.dev`.
3. Re-deploy the preview on every push to the branch.

Share that preview URL with reviewers — they can see your change live without cloning the branch locally.

## Pull request guidelines

- Keep PRs focused. Refactors, behaviour changes, and dependency bumps belong in separate PRs.
- Update or add tests when you change `src/utils/` or alert logic.
- The PR template walks through summary / test plan / screenshots — please fill it in.

## Python pipeline

`push_to_github.py` publishes measurement results to this repo and uses only the Python standard library (nothing to install — `requirements.txt` is intentionally empty of dependencies).

Performance **alerting** no longer runs in Python/CI: it moved to the Cloudflare Worker (`worker/alerts.js`) backed by a D1 subscriber list. See [PERFORMANCE_ALERTS.md](docs/PERFORMANCE_ALERTS.md) and [SETUP_ALERTS.md](docs/SETUP_ALERTS.md). To work on the Worker locally:

```bash
npm run build
npx wrangler dev --local        # serves the dashboard + /api/* + a local D1
```

The on-device measurement scripts (`perf_measurement_script.py`, `test_eltwise_operations.py`) run under tt-metal's environment on Tenstorrent hardware and are **not** pinned here.

## Reporting issues

Use the [issue templates](https://github.com/Aswincloud/ttnn-performance-dashboard/issues/new/choose):

- **Bug report** — something is broken
- **UI improvement** — visual or UX suggestion
- **Feature request** — new functionality

For performance-alert tuning or pipeline questions, see [`PERFORMANCE_ALERTS.md`](docs/PERFORMANCE_ALERTS.md) and [`SETUP_ALERTS.md`](docs/SETUP_ALERTS.md).
