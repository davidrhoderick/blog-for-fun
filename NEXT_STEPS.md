# Next steps

## Current handoff

Work locally until CI/CD is established. Do not repeatedly deploy incomplete
media changes by hand.

- The unified Fly deployment foundation is committed as `ec15c7a` (`Deploy
  unified application to Fly`). It runs Caddy, GraphQL, public, and admin in one
  `1gb` Machine supervised by PM2.
- Fly release `v4` is the current healthy release. A later media image was
  pushed as release `v5`, but it remained `pending` and had not replaced the
  Machine when this handoff was written. Check release state before any future
  deployment; do not create duplicate releases merely because one is pending.
- A public Tigris bucket named `blog-for-fun-media` exists and its S3-compatible
  credentials are attached to the Fly app as secrets. Never add those values to
  source control or logs.
- Authentication runbook documentation and generic failed-login service error
  handling are implemented locally but uncommitted.
- The initial media upload foundation is committed as `f522058`; the safer
  prepare/finalize lifecycle and attachment-context work is committed as
  `221926e`.
- The latest completed local checks pass: Biome, migration history, all 20 server
  tests, server TypeScript, Relay/admin typecheck, and public typecheck.

## Media library

### Target behavior

- Treat media as a site-wide library, similar to WordPress. Add a dedicated
  authenticated `/admin/media` page and a top-level Media navigation item next
  to Posts. The page owns upload, browsing, search, metadata editing, and safe
  deletion workflows.
- Keep every `MediaAsset` globally reusable. Add an optional
  `attached_post_id` relation recording the post from which an asset was first
  uploaded. Uploading from a post editor sets that post ID; uploading from the
  Media page leaves it null. Attachment records origin/context, not exclusive
  ownership, and deleting a post must not delete its attached assets.
- Track attachment separately from usage. An asset attached to one post can be
  embedded in other posts or selected as their featured image. Before deleting
  an asset, detect all Markdown embeds and featured-image references.
- Replace the full inline library currently shown below every post editor with a
  compact Add media action. It should open a reusable picker backed by the same
  global library, allow upload in the current post context, and insert the
  selected asset at the current MDXEditor selection.
- Persist asset identity in post content rather than a Tigris/provider URL. Use
  standard Markdown with a stable asset route:
  `![alt text](/media/<asset-id> "Optional caption")`. Resolve the asset ID at
  request/render time and keep provider URLs out of authored content. This
  preserves native Markdown/MDXEditor image support while allowing storage
  migration and metadata updates without rewriting every post.
- Keep per-asset metadata such as filename, MIME type, dimensions, and default
  alt text on `MediaAsset`. Keep per-embed alt text in the Markdown image text
  and use the optional Markdown image title as its caption when those values
  differ by post.

### Implemented locally

- Added the `media_assets` table and nullable `posts.featured_media_id` schema,
  plus migration `server/migrations/20260927002621_media-assets/`.
- Added administrator `media:read` and `media:write` permissions.
- Added protected GraphQL `mediaAssets`, `prepareMediaUpload`, and
  `finalizeMediaUpload` operations.
- Added Tigris S3 client and pre-signed `PUT` URLs. Uploads currently accept
  AVIF, GIF, JPEG, PNG, and WebP up to 10 MB.
- Added `storage:configure-cors`, allowing `PUT` from local admin development
  and `https://blog-for-fun.fly.dev`.
- Added a Fly release command that runs database migrations and configures
  bucket CORS before replacing the application Machine. Keep this behavior in
  the eventual CI/CD deployment workflow.
- Added an initial media grid to the post editor. It can select a local image,
  request an upload URL, upload directly to Tigris, and insert standard Markdown
  image syntax at the current MDXEditor selection. Existing assets can also be
  inserted, and the image plugin renders Markdown images inside the visual
  editor.
- Upload controls collect and validate explicit alt text through React Hook Form;
  the filename is only used as an editable initial suggestion.
- Added a local `s3rver` development command and CORS configuration so media can
  be tested without production Tigris credentials. The storage client supports
  configurable path-style endpoints, public URL bases, and object ACLs while
  retaining Tigris defaults in production.
- The current inline grid and direct Markdown URL insertion are prototypes to be
  replaced by the shared Media page/picker and ID-based embed syntax described
  above.
- Added a second forward-only migration with pending/ready upload status,
  optional post attachment context, dimensions, finalization timestamp, and
  indexes. Existing assets are backfilled as ready.
- Replaced one-step upload creation with `prepareMediaUpload` and
  `finalizeMediaUpload`. Signing occurs before persistence, pending assets stay
  out of the library, attachment post IDs are validated, and finalization uses
  S3 `HeadObject` to verify content type and byte size.
- Metadata mismatches delete both the object and pending database row. The post
  editor finalizes an upload before displaying or inserting it and supplies the
  current post ID as attachment context.

### Verified locally

- Applied all migrations to an isolated local libSQL database and bootstrapped a
  disposable administrator without using the remote Turso database.
- Verified GraphQL health, public SSR, admin login, authenticated admin routes,
  media authorization, signed upload creation, browser-upload CORS, object
  upload, public object retrieval, and media-library listing.
- Verified Biome, admin/public production builds, TypeScript, migration history,
  and all 20 server tests. Media lifecycle integration tests use isolated libSQL
  and S3 emulation. Manual browser verification of the updated editor interaction
  remains.

### Finish before considering uploads complete

1. Do not trust the browser-provided MIME type, size, or extension as proof of
   image content. On finalization, verify object metadata and decode or inspect
   the file signature before making the asset available. Define how malformed
   objects are deleted.
2. Add bounded cleanup for pending uploads that are abandoned before
   finalization, including deletion of any uploaded object.
3. Add an explicit decorative-image option before allowing empty alt text.
4. Add loading, upload-progress, success, retry, and accessible error
   states. Disable duplicate submissions and handle Relay/GraphQL errors without
   leaving the UI stuck.
5. Add pagination to `mediaAssets`; do not load an unbounded library in every
   post editor query. Add search or filtering when the library grows.
6. Add update-alt-text and delete workflows. Deletion must detect post usage,
   avoid breaking published content, remove the Tigris object safely, and handle
   partial storage/database failure.
7. Implement the selected stable `/media/:id` delivery route before publishing
   media broadly. The current API still returns a direct Tigris bucket URL;
   switch embeds to asset IDs and avoid persisting provider URLs in Markdown.
8. Add service and GraphQL tests for authorization, allowed types, size limits,
   filename normalization, ordering, missing storage configuration, signed URL
   generation, finalization, stale uploads, and anonymous access rejection.
9. Add browser tests covering upload, library refresh, insertion at the cursor,
   saving a post, reloading it, and rendering the image publicly.

### Featured and captioned images

1. Support one optional featured `MediaAsset` per post. Add a per-post
   presentation enum with `TITLE_ADJACENT` and `HERO` values; the setting only
   applies when a featured asset is selected.
2. Expose `featuredMedia` and `featuredMediaLayout` on `Post`, and
   `featuredMediaId` plus `featuredMediaLayout` on `PutPostInput`.
3. Resolve the featured asset efficiently and validate that a selected asset
   exists and is finalized before saving the post.
4. Include featured asset and layout changes in revision detection. Store
   `featured_media_id` and `featured_media_layout` on post revisions so
   restoration cannot silently lose, retain, or reposition the wrong image.
5. Add a featured-image picker, preview, replacement, clear action, and layout
   selector to the admin editor using React Hook Form and the reusable global
   Media picker. Uploads initiated there attach to the current post.
6. On public post details, render `TITLE_ADJACENT` media as part of the title
   composition and `HERO` media as a full-width lead image. Define responsive
   mobile behavior for both rather than forcing the desktop composition into a
   narrow viewport.
7. Render featured thumbnails or title-adjacent media consistently on public
   post lists. Include intrinsic dimensions, responsive sources/sizing, loading
   policy, and the selected asset in Open Graph/Twitter metadata.
8. Define caption syntax that remains valid Markdown. Implement parsing and
   rendering as semantic `figure`, `img`, and `figcaption` elements without
   allowing unsafe HTML.
9. Style featured and inline figures for mobile, desktop, light, and dark themes;
   preserve reduced-motion behavior and avoid layout shift.
10. Add public rendering tests for ordinary images, captioned images, decorative
    images, malformed syntax, both featured layouts, responsive behavior, and
    featured-image metadata.

### Shared admin library

1. Populate image dimensions during verified finalization. The nullable columns
   and safe upload status are already present.
2. Add a paginated administrator media connection with search/filter support and
   fields for attachment, usage, dimensions, upload status, and metadata.
3. Add `/admin/media`, navigation adjacent to Posts, and reusable Media library
   components for grid/list browsing, uploading, selection, metadata editing,
   and safe deletion.
4. Reuse the same picker in the post editor. Opening it from a post supplies the
   post ID to uploads but does not filter the library to that post.
5. Replace provider-URL insertion with
   `![alt](/media/<asset-id> "Optional caption")`. Keep MDXEditor's native image
   representation and add picker fields for per-embed alt text and caption.
6. Add a public `/media/:id` resource route that resolves the asset to storage
   without exposing provider identity in authored content. Add Markdown rendering
   that treats the optional image title as a caption and emits semantic
   `figure`/`img`/`figcaption` markup while handling missing assets safely.
7. Add tests proving global reuse, attachment nulling on post deletion, usage
   detection, picker behavior, stable image URL round-tripping, captions, and
   public rendering.

### Local media verification

1. Use a local Turso/libSQL database with all committed migrations applied.
2. For isolated local storage, create `server/.local/media`, run
   `pnpm --filter server storage:dev`, and configure the GraphQL process with the
   local S3 endpoint, path-style access, public media URL, and disposable S3
   credentials. Use Tigris credentials only when explicitly testing Tigris.
3. When testing Tigris, run `pnpm --filter server storage:configure-cors` once
   for the intended local admin origin after confirming the bucket and account.
4. Bootstrap the local administrator with `pnpm --filter server auth:bootstrap`.
5. Start the GraphQL, public, and admin applications and exercise the workflow
   through the same-origin admin GraphQL proxy.
6. Verify that unauthorized media queries and mutations fail, valid uploads can
   be fetched from the public URL, failed uploads do not appear in the library,
   and saved Markdown survives reload.

## Authentication security roadmap

The application-owned session boundary is implemented. The following security
work remains, ordered by priority.

### High priority

- Bootstrap the first production administrator after deployment. Open a
  production console with `fly ssh console --app blog-for-fun`, then run
  `BOOTSTRAP_EMAIL=admin@example.com BOOTSTRAP_DISPLAY_NAME='Blog Administrator' pnpm --filter server auth:bootstrap` and enter a password at the prompt.
  The command deliberately refuses to run when any authentication user already
  exists. Do not pass `BOOTSTRAP_PASSWORD` on a command line, where it could be
  retained in shell history or process inspection.
- Add a tested administrator password-recovery command before exposing any
  password-reset link. It should be invoked through a controlled Fly console,
  validate the replacement password, update `password_changed_at`, revoke all
  sessions, and write an audit event. A public email reset flow needs dedicated
  token storage, expiry, rate limits, delivery, and anti-enumeration controls.
- Make GraphQL authorization fail closed for mutations through middleware, a
  schema directive, or an explicit mutation policy registry. Require every
  mutation to declare either a permission or an intentionally public policy;
  reserve the public policy for operations such as login and idempotent logout.
- Add a schema-level test that inventories all mutation fields and fails when a
  mutation has no policy. Keep resolver permission checks where they provide
  useful defense in depth.
- Add structured mutation auditing at the GraphQL boundary. Record the actor,
  operation, affected entity, outcome, and request correlation data without
  storing request bodies, passwords, session tokens, or post content.

### Persistent throttling

- Replace the process-local email attempt map with bounded database-backed
  throttle state. Store mutable counters and `blocked_until` on one row per
  existing authentication account; never create throttle rows for arbitrary
  submitted email addresses. This bounds storage by the number of accounts and
  avoids an attacker growing a table with invented identities.
- Add a separate source-level control at the reverse proxy or application edge.
  Per-account state alone permits deliberate administrator lockout, while
  source-only state permits distributed password guessing. Do not trust client
  forwarding headers unless the request came through a configured trusted
  proxy.
- Replace the current hard account lockout with escalating delays and a capped
  `blocked_until`. Successful authentication should reset the mutable state.
- Add tests for persistence across restarts, concurrent updates, bounded
  storage, expiry, and behavior across multiple server instances.

### Audit retention

- Record authentication failures and throttle decisions without storing
  passwords, session tokens, or raw submitted identifiers.
- Do not append an unlimited audit row for every anonymous attempt. Aggregate
  repetitive failures into fixed time buckets and apply both an age-based
  retention window and a maximum retained-row policy.
- Run periodic deletion in small batches and monitor database size. Security
  events such as administrator bootstrap, account disablement, and successful
  session creation should have a longer retention class than repetitive failed
  logins.

### Lower priority

- Apply CSRF and origin checks through a shared React Router action wrapper so
  future unsafe BFF actions cannot omit them. Add a GraphQL mutation origin
  policy as defense in depth and configure trusted production origins
  explicitly.
- Validate `GRAPHQL_URL` and all other production-only settings during process
  startup rather than waiting for the first request.
- Schedule `deleteExpiredSessions` in bounded batches and monitor session-table
  growth. Presented expired sessions should continue to be deleted immediately.
- Design soft deletion or a separate retained archive before adding deleted-post
  restoration. Current hard deletion cascades through revision history, so there
  is no source from which to restore.

### Stronger authentication

- Evaluate TOTP or, preferably, WebAuthn/passkeys for the administrator. A
  second factor reduces account takeover risk but does not replace throttling:
  OTP verification can be guessed, and emailed/SMS OTP delivery can itself be
  abused for cost and availability attacks.
- Add recovery codes and a tested operational recovery procedure before making
  a second factor mandatory.

Required behavior:

- Public users can query published content without authentication.
- Every create, update, delete, restore, and future publication mutation
  requires an authenticated administrator.
- Authorization is enforced on the GraphQL server, never only in the admin UI.
- Sessions use secure, HTTP-only, same-site cookies where practical.
- Production mutations have CSRF protection, strict CORS/origin policy, rate
  limiting, and structured audit logging.
- Authentication failures do not reveal sensitive account or session details.
- Secrets and signing keys are validated at startup and never exposed to the
  browser bundle or logs.
- The design includes session revocation, expiration, key rotation, password or
  identity-provider recovery, and administrator bootstrap procedures.

Continue using established password hashing, session, CSRF, and cookie libraries
rather than implementing cryptographic primitives directly.

## Environment and secrets

- Replace direct `dotenv` loading with dotenvx. Prefer invoking development,
  migration, bootstrap, storage, test, and other environment-dependent commands
  through `dotenvx run --` so configuration is loaded at the process boundary
  rather than through application imports.
- Inventory the environment variables required by each workspace and document
  safe local examples without real credentials. Validate required variables at
  startup with clear errors.
- Decide whether to commit dotenvx-encrypted environment files or keep local
  files ignored. If encrypted files are committed, keep decryption keys outside
  the repository and provide them only through approved developer and CI secret
  stores.
- Do not replace Fly secrets with dotenvx files in production. Continue injecting
  Turso, Tigris, and other production credentials through Fly or the CI deployment
  environment, and never bake secrets into the Docker image.
- Update package scripts, Docker/CI commands, documentation, and tests together,
  then remove the direct `dotenv` dependency and `config()` call after every
  supported command works through dotenvx.

## Set up CI/CD to run tests

Prefer GitHub Actions unless CircleCI provides a concrete required capability.

- On pull requests, use a frozen pnpm install and run code generation, Biome,
  server tests, all workspace typechecks, production builds, and migration
  history validation.
- Add isolated integration tests using a temporary local libSQL database. Do not
  run tests against production Turso or Tigris resources.
- Add browser tests for authentication, post editing/publication, and media
  upload/insertion. Use dedicated test storage or an S3-compatible local service
  with deterministic cleanup.
- Build the Docker image in CI and smoke-test `/health`, `/`, and `/admin/`
  before publishing it.
- Deploy only from the protected main branch after required checks pass. Use
  GitHub/Fly secrets, a concurrency group to prevent overlapping releases, and
  Fly's release command for forward-only migrations and storage configuration.
- Verify Fly Machine health and the public/admin endpoints after deployment. Do
  not automatically roll back a database migration; deploy a forward fix.
- Add a manual production administrator bootstrap/recovery job only if it can
  require protected-environment approval and avoid passwords in arguments,
  logs, workflow inputs, and shell history. Otherwise retain the controlled Fly
  console procedure.
- Evaluate an automated review agent only after estimating cost. Reviews should
  prioritize correctness, security, migration safety, accessibility, and the
  semantic styling conventions in this document.

## Set up the admin UI

The admin keeps React Router SSR only for document rendering, authentication
validation, redirects, and login/logout actions. Editorial data must not be
loaded in SSR route loaders.

- Use Relay for client-side editorial queries and mutations.
- Route Relay browser traffic through the same-origin `/api/graphql` BFF proxy.
  The proxy forwards the session cookie to the private GraphQL service and
  returns GraphQL data plus any session-cookie updates unchanged.
- Keep the GraphQL service private to browser traffic. Do not enable
  credentialed cross-origin GraphQL access for the admin.
- Generate the merged server SDL and Relay TypeScript artifacts before every
  development, build, test, and CI invocation. The authored server SDL remains
  the single schema source of truth.
- Create `packages/graphql-runtime` for shared Relay Environment and network
  factories. Admin injects its same-origin BFF transport; the public site will
  later inject SSR and hydration transports.
- Create `packages/ui` for themed shadcn primitives and shared presentation
  components. Keep application routes and feature-specific fragments in each
  application.
- Standardize cacheable persisted records on Relay `Node`, opaque global IDs,
  `node(id:)`, and connection-based pagination. Use distinct public and
  administrator post connections so draft visibility is explicit.

Implemented so far:

- Login/logout and authenticated route protection.
- Same-origin `/api/graphql` BFF proxy for Relay browser requests.
- Client-only Relay environment and generated Relay artifacts.
- Posts list and Markdown-compatible MDXEditor post editor with update and
  publish/unpublish actions.
- Editor styling includes the MDXEditor package stylesheet and semantic Tailwind
  component classes.

Remaining admin work:

- Browser-test the authenticated workflow end-to-end: open a post, edit its
  title/slug/Markdown, update it, and publish/unpublish it.
- Add create and delete post workflows to complete CRUD.
- Migrate the server schema to Relay conventions: `Node`, opaque global IDs,
  `node(id:)`, and separate public/admin paginated post connections.
- Extract repeated post-action panel markup if future editor actions make the
  duplication costly to maintain.

### Frontend conventions

- Keep route JSX free of long Tailwind utility strings. Define reusable styles
  with Tailwind v4 `@apply` in component CSS and apply semantic class names in
  markup.
- Put themed shadcn primitives in `packages/ui`. Put composed, application-wide
  components in an app-level common component layer; keep feature-specific
  composition with its feature.
- Use React Hook Form for application forms. Form state belongs to the form;
  submit handlers should only adapt validated form values to mutation inputs.
- Add feature-local adapters that map Relay entity data to form defaults and
  form values to GraphQL mutation variables. Do not embed those mappings in
  route components.

## Set up the public facing app

This should be SSR driven Relay client hydrating client-side where necessary
(deferred loading) for high performance.

Start without worrying about styling.  Add it later.  Use something like `@apply` for it with tailwind.
