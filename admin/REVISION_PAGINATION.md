# Revision Pagination

`Post.revisions` is a cursor-paginated connection. Revisions are returned by
descending revision number, so the first page contains the newest revisions and
each subsequent page moves toward older revisions.

## Connection Shape

```graphql
type PostRevisionConnection {
  edges: [PostRevisionEdge!]!
  nodes: [PostRevision!]!
  pageInfo: PageInfo!
}

type PostRevisionEdge {
  cursor: String!
  node: PostRevision!
}
```

An edge pairs a revision with its position in the paginated result:

```ts
type PostRevisionEdge = {
  cursor: string
  node: PostRevision
}
```

`edges[i].node` and `nodes[i]` represent the same revision in the same order.
They are two ways to access the connection data:

- Use `nodes` when rendering revisions and no per-revision cursor is needed.
- Use `edges` when each rendered revision also needs its cursor.
- Use `pageInfo.endCursor` to request the next page.

GraphQL only returns fields selected by the query. Usually select either
`nodes` or `edges`, not both, to avoid requesting duplicate revision fields.

## Requesting A Page

The `first` argument defaults to `20`, accepts `0` through `100`, and controls
the maximum number of revisions returned. Omit `after` for the newest page.

```graphql
query PostRevisions($postId: ID!, $first: Int, $after: String) {
  post(id: $postId) {
    id
    revisions(first: $first, after: $after) {
      nodes {
        id
        revisionNumber
        title
        markdownContent
        createdAt
      }
      pageInfo {
        hasNextPage
        hasPreviousPage
        startCursor
        endCursor
      }
    }
  }
}
```

Variables for the first page:

```json
{
  "postId": "the-post-id",
  "first": 2,
  "after": null
}
```

A response has this shape:

```json
{
  "data": {
    "post": {
      "id": "the-post-id",
      "revisions": {
        "nodes": [
          {
            "id": "revision-105",
            "revisionNumber": 105,
            "title": "Current title",
            "markdownContent": "Previous content",
            "createdAt": "2026-09-17T12:00:00.000Z"
          },
          {
            "id": "revision-104",
            "revisionNumber": 104,
            "title": "Previous title",
            "markdownContent": "Earlier content",
            "createdAt": "2026-09-16T12:00:00.000Z"
          }
        ],
        "pageInfo": {
          "hasNextPage": true,
          "hasPreviousPage": false,
          "startCursor": "cursor-for-revision-105",
          "endCursor": "cursor-for-revision-104"
        }
      }
    }
  }
}
```

The cursor strings above are illustrative. Actual cursor values are encoded
pagination tokens and should not be decoded or constructed by the frontend.

## Requesting Older Revisions

When `hasNextPage` is `true`, pass the current `pageInfo.endCursor` as the next
request's `after` value:

```json
{
  "postId": "the-post-id",
  "first": 2,
  "after": "cursor-returned-in-pageInfo-endCursor"
}
```

The next response starts after that cursor and therefore contains older
revisions. Continue until `hasNextPage` is `false`.

Do not use the last revision ID or revision number as `after`. Always pass the
cursor returned by the API. Cursors are scoped to their post, so a cursor from
one post cannot paginate another post's revisions.

## Rendering Nodes

Use `nodes` for the simplest rendering loop:

```tsx
<ol>
  {connection.nodes.map((revision) => (
    <li key={revision.id}>
      Revision {revision.revisionNumber}: {revision.title}
    </li>
  ))}
</ol>
```

The connection is already newest-first. Do not reverse or sort the array in the
frontend.

## Rendering Edges

Select edges when the cursor must remain associated with each rendered item:

```graphql
revisions(first: $first, after: $after) {
  edges {
    cursor
    node {
      id
      revisionNumber
      title
      createdAt
    }
  }
  pageInfo {
    hasNextPage
    endCursor
  }
}
```

```tsx
<ol>
  {connection.edges.map(({ cursor, node }) => (
    <li key={node.id} data-cursor={cursor}>
      Revision {node.revisionNumber}: {node.title}
    </li>
  ))}
</ol>
```

The edge cursor belongs to `edge.node`. However, loading the next page should
still use `pageInfo.endCursor` rather than reading the final edge manually.

## React Router Loader Example

The admin application uses React Router Framework Mode with SSR. A route loader
can read `after` from the URL, call GraphQL on the server, and return one page to
the component. Keeping the cursor in the URL makes pagination refreshable and
shareable.

```tsx
import { Link } from 'react-router'
import type { Route } from './+types/post-revisions'

const POST_REVISIONS_QUERY = `
  query PostRevisions($postId: ID!, $first: Int, $after: String) {
    post(id: $postId) {
      id
      revisions(first: $first, after: $after) {
        nodes {
          id
          revisionNumber
          title
          createdAt
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  }
`

type PostRevision = {
  id: string
  revisionNumber: number
  title: string
  createdAt: string
}

type RevisionConnection = {
  nodes: PostRevision[]
  pageInfo: {
    hasNextPage: boolean
    endCursor: string | null
  }
}

type QueryResponse = {
  data?: {
    post: {
      id: string
      revisions: RevisionConnection
    } | null
  }
  errors?: Array<{ message: string }>
}

export async function loader({ params, request }: Route.LoaderArgs) {
  if (!params.postId) throw new Response('Post ID is required', { status: 400 })

  const after = new URL(request.url).searchParams.get('after')
  const response = await fetch(
    process.env.GRAPHQL_URL ?? 'http://localhost:4000/graphql',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        query: POST_REVISIONS_QUERY,
        variables: { postId: params.postId, first: 20, after },
      }),
    },
  )
  const result = (await response.json()) as QueryResponse

  if (!response.ok || result.errors) {
    throw new Response(result.errors?.[0]?.message ?? 'GraphQL request failed', {
      status: 502,
    })
  }
  if (!result.data?.post) {
    throw new Response('Post not found', { status: 404 })
  }

  return result.data.post.revisions
}

export default function PostRevisions({ loaderData }: Route.ComponentProps) {
  const { nodes, pageInfo } = loaderData
  const nextSearch = new URLSearchParams()
  if (pageInfo.endCursor) nextSearch.set('after', pageInfo.endCursor)

  return (
    <main>
      <ol>
        {nodes.map((revision) => (
          <li key={revision.id}>
            Revision {revision.revisionNumber}: {revision.title}
          </li>
        ))}
      </ol>

      {pageInfo.hasNextPage && pageInfo.endCursor ? (
        <Link to={`?${nextSearch}`}>Older revisions</Link>
      ) : null}
    </main>
  )
}
```

This example replaces the displayed page when the link is followed. For an
append-style "Load more" interface, retain the previously loaded nodes in
component state and append the next response's nodes. Deduplicate by revision
`id`, and continue using the latest response's `pageInfo.endCursor`.

## PageInfo Reference

| Field | Meaning |
| --- | --- |
| `hasNextPage` | More, older revisions are available after this page. |
| `hasPreviousPage` | This page was requested after an earlier page. Reverse pagination is not currently supported. |
| `startCursor` | Cursor associated with the first revision on this page. |
| `endCursor` | Cursor associated with the last revision on this page; pass it as `after` to request older revisions. |

For an empty connection, `nodes` and `edges` are empty, both cursor fields are
`null`, and `hasNextPage` is `false`.
