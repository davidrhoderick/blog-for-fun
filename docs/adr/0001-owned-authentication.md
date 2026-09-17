# ADR 0001: Application-owned authentication

- Status: accepted
- Date: 2026-09-18

## Context

The blog needs a private administration application, while published content
remains readable without authentication. The API already uses GraphQL Yoga,
Drizzle, and libSQL, and the administration application runs as a server-rendered
React Router application.

## Decision

The application owns password authentication and opaque database-backed
sessions. Passwords use Argon2id. Only SHA-256 hashes of random session tokens
are persisted. Sessions have idle and absolute expiration and can be revoked.

The administration application is a backend for frontend (BFF). Browser cookies
belong to the administration origin; React Router loaders and actions forward
them to GraphQL. The GraphQL server remains responsible for authenticating every
request and authorizing every protected operation.

Role assignments are stored in the database without defaults. The static
role-to-permission policy is defined in server code. The initial bootstrap
command explicitly assigns the first user the `administrator` role and refuses
to run after any authentication user exists.

Login, logout, and viewer lookup are GraphQL operations. Session tokens are
never returned in GraphQL data. Yoga response metadata carries cookie headers,
which the BFF propagates to the browser.

## Consequences

- Authentication state is immediately revocable and does not require signing
  key rotation.
- Password recovery is initially an operational command rather than an email
  workflow.
- Adding a permission does not grant it to existing roles automatically.
- The BFF must forward request cookies and all session cookie updates.
- Unsafe BFF requests require same-origin verification in addition to SameSite
  cookie protection.
- Authenticated GraphQL traffic remains protected even if the API is reachable
  directly.

## Deferred

- Public registration and invitations
- Email verification and email-based password recovery
- User-defined roles and database-managed permissions
- Third-party identity providers
