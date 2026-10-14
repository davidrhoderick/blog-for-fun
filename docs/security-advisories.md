# Accepted security advisories

The trust pipeline's `audit` stage runs `pnpm audit --audit-level high` and must
be green before it enforces. Most advisories are fixed by the version overrides
in `pnpm-workspace.yaml`; the ones below cannot be, so they are accepted in
`pnpm-workspace.yaml` → `auditConfig.ignoreGhsas` (pnpm 11 no longer reads the
`pnpm` field in `package.json`). **Accepted on 2026-10-14.**
Review when any listed package publishes a patched release.

An accepted advisory is a conscious, documented risk — not a permanent pass.
When a fix lands, remove its GHSA id from `ignoreGhsas` and drop the matching
`minimumReleaseAgeExclude` entry.

| GHSA | Package | Severity | Why accepted |
|---|---|---|---|
| GHSA-wm7h-9275-46v2 | `dicer` | high | The advisory names patched `>=0.3.2`, but **0.3.2 is not published** (npm latest is 0.3.1). Only reachable through `s3rver > busboy > dicer` — the dev-only S3 mock used in server tests, never the running server. |
| GHSA-vfj7-8cjw-p6xm | `braces` | high | Patched `>=3.0.4` **is not published** (latest is 3.0.3). Only through dev tooling (`pm2 > chokidar`, `shadcn > fast-glob > micromatch`). |
| GHSA-hp3w-g68c-fv3c | `sprintf-js` | moderate | Patched `>=1.1.4` **is not published** (latest is 1.1.3). Only through dev/build tooling (`babel-plugin-relay`, `drizzle-orm > @types/mssql > tedious`). |
| GHSA-x3cc-x39p-42qx | `fast-xml-parser` | moderate | The fix requires `>=5.7.0`; `s3rver` (dev S3 mock) requires the v3 API, so any override to v4/v5 breaks it (`xmlParser.parse is not a function`). |
| GHSA-gh4j-gqv2-49f6 | `fast-xml-parser` | moderate | Same as above — shares the `s3rver` v3 constraint. |

## Removing them for good

All five sit in dev/build tooling, not the deployed server path. They go away by
upgrading or replacing `s3rver`, `pm2`, and `shadcn` when their upstreams
release fixes, at which point the matching `ignoreGhsas` entries come out.
