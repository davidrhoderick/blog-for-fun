# Next steps

## Current revision behavior

- `posts` stores the current canonical version of each post.
- `post_revisions` stores an append-only history of prior title and Markdown
  values.
- Creating a post does not create a revision.
- Updating the title or Markdown saves the previous content as a revision before
  updating the post.
- Slug-only and no-op updates do not create revisions.
- Slugs are not revisioned or restored.
- Restoring a revision should use the normal update path so the current content
  is preserved as a new revision before the historical content becomes current.

## Direct revision query

Expose revisions for a specific post without requiring the post selection path.
The direct query should use the same connection and pagination implementation as
`Post.revisions`, not duplicate query logic.

Candidate API:

```graphql
type Query {
  postRevisions(postId: ID!, first: Int, after: String): PostRevisionConnection!
}
```

Decide whether revisions also need lookup by post slug. Prefer `postId` unless a
real client requirement justifies another access path.

## Authentication and authorization

Research the authentication boundary before building the admin editing UI.
Compare a hosted provider such as Clerk, a self-hosted option such as
SuperTokens, and a small application-owned session implementation. Avoid
choosing only from integration convenience; evaluate operational and security
requirements.

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

Implementation sequence:

1. Write a short decision record comparing the viable providers and an owned
   implementation.
2. Define the authenticated user and administrator authorization model.
3. Add request context or GraphQL Yoga middleware that resolves the session.
4. Add a reusable authorization guard for protected resolvers.
5. Protect all existing post mutations before connecting the admin UI.
6. Add integration tests proving anonymous reads work and anonymous mutations
   fail.
7. Build the admin login and session-expiration experience.

Do not implement custom password authentication casually. If an owned session
layer is selected, use established password hashing, session, CSRF, and cookie
libraries rather than implementing cryptographic primitives directly.
