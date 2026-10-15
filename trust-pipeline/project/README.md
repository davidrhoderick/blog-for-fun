# project — this repo's half

The values the generic engine needs and the project-specific checks it cannot
generalize. Everything here is this repository's; none of it is reusable as-is.

## Contract

- **Belongs here:** `config.ts` (stage commands, thresholds, ignore globs, root,
  dev-server port), `patterns/` (tsarch rules), `rules/` (Opengrep YAML),
  `rubric.md` (the Jev pass/fail questions), and the scanner configs
  (`jscpd.json`, `osv-scanner.toml`).
- **Does not belong here:** orchestration, stage machinery, the `doctor` check,
  the retry ladder, or the Jev harness and verdict. Those live in `../engine/`.
- `project/` may import `../engine/` (`config.ts` takes the `ProjectConfig` type
  and `DEFAULT_IGNORE`); the reverse direction never crosses into app code, and
  is the seam extraction replaces.

## `config.ts`

Exports the single `config: ProjectConfig` the engine runs on. It is the only
file that names this repo's commands, thresholds, and globs, so changing the
pipeline's behaviour needs no engine edit.
