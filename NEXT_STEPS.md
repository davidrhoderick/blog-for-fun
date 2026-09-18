# Next steps

## Authentication security roadmap

The application-owned session boundary is implemented. The following security
work remains, ordered by priority.

### High priority

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
- Add a tested administrator password-recovery command. It must validate a new
  password, update `password_changed_at`, revoke every existing session, and
  write an audit event. Document how access to this operational command is
  restricted and recovered.

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

## Set up CI/CD to run tests

We want tp run tests in GitHub.

Let's also see about running a review agent depending on cost.  We care about semantic coding styles so we can review PRs more easily.

## Set up the admin UI

We want to be able to log in and log out as well as CRUD posts.  This should be a client-side SPA with no SSR.

## Set up the public facing app

This should be SSR driven apollo client hydrating client-side where necessary (deferred loading) for high performance.

Start without worrying about styling.  Add it later.  Use something like `@apply` for it with tailwind.
