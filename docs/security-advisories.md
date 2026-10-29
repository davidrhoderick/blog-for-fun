# Accepted security advisories

The trust pipeline's `audit` stage runs `pnpm audit --audit-level high`, so only
**high and critical** advisories block. Moderates are reported but do not fail
the gate — they are not ignored, they are simply below the threshold.

## Above the gate — accepted (cannot be fixed today)

`pnpm-workspace.yaml` → `auditConfig.ignoreGhsas` (pnpm 11 no longer reads the
`pnpm` field in `package.json`). **Accepted on 2026-10-15.** Review when the
package publishes a patched release.

| GHSA | Package | Severity | Why accepted |
|---|---|---|---|
| GHSA-vfj7-8cjw-p6xm | `braces` | high | The advisory names patched `>=3.0.4`, but **3.0.4 is not published** (npm latest is 3.0.3; no 4.x) — there is nothing to upgrade to. It is reached only through dev/build tooling, and only via `micromatch@4.0.8` (pulled by `@graphql-codegen/cli`, `ts-morph`, `fast-glob`, `globby`, `shadcn`, `@eddeee888/gcg-typescript-resolver-files`) and `chokidar@3` (pulled by `pm2`). Removing it would mean removing the GraphQL codegen toolchain, `shadcn`, and `pm2`'s file watcher. |

The advisory is a stack-exhaustion DoS from deeply nested patterns; here it only
ever sees trusted globs from our own config, and it never runs in the deployed
server. That is why it is accepted rather than blocking.

## Below the gate — not ignored

`sprintf-js` (GHSA-hp3w-g68c-fv3c, moderate) is reported by `pnpm audit` but does
not fail `--audit-level high`, so it needs no `ignoreGhsas` entry. Its patched
version (`>=1.1.4`) is likewise unpublished. If the gate is ever lowered, it
would need the same treatment as `braces`.

## OSV-only accepted finding

OSV Scanner reports every severity, so an unpatched low-severity development-
tool finding is recorded here and in `osv-scanner.toml` with a narrow ignore.

| GHSA | Package | Severity | Why accepted |
|---|---|---|---|
| GHSA-gcqx-w48m-w2h4 | `deepmerge` | low | No patched release is published. It is reachable only through the admin dev-only `shadcn` toolchain and is not a production dependency. Revisit when a fix is released. |

## Already cleared

Three advisories were removed by replacing the abandoned `s3rver` dev S3 mock
with SDK-level mocking (`aws-sdk-client-mock`) in the media test: `dicer`
(GHSA-wm7h-9275-46v2) and two `fast-xml-parser` advisories
(GHSA-x3cc-x39p-42qx, GHSA-gh4j-gqv2-49f6).
