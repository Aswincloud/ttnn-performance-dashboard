# Copilot instructions — ttnn-performance-dashboard

## Code review scope

Do **not** review generated performance-data files. These are machine-produced
result dumps, not hand-written code — reviewing them is noise.

Skip files under:

- `data/**/*.json` — daily/latest eltwise perf result dumps (hundreds of files)

Do continue to review everything else normally, **including** config JSON that
is hand-edited: `package.json`, `package-lock.json`, `.prettierrc.json`.
