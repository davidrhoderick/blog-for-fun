import { graphql, useLazyLoadQuery } from 'react-relay'
import { Link } from 'react-router'
import type { PostsListQuery } from '../__generated__/PostsListQuery.graphql'
import { RelayClientProvider } from './relay.client'

const formatDate = (date: string) =>
  new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeZone: 'UTC',
  }).format(new Date(date))

const postsListQuery = graphql`
  query PostsListQuery {
    posts {
      id
      slug
      title
      publishedAt
      updatedAt
    }
  }
`

const PostsList = () => {
  const data = useLazyLoadQuery<PostsListQuery>(postsListQuery, {})

  if (data.posts.length === 0) {
    return (
      <p className="border border-dashed border-slate-300 px-5 py-8 text-sm text-slate-500">
        No posts yet.
      </p>
    )
  }

  return (
    <div className="overflow-hidden border border-slate-200 bg-white">
      <div className="hidden grid-cols-[minmax(0,1fr)_10rem_10rem] gap-6 border-b border-slate-200 bg-slate-50 px-5 py-3 text-xs font-medium tracking-[0.1em] text-slate-500 uppercase sm:grid">
        <span>Post</span>
        <span>Status</span>
        <span>Updated</span>
      </div>
      <ul>
        {data.posts.map((post) => (
          <li
            key={post.id}
            className="grid gap-3 border-b border-slate-200 px-5 py-4 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_10rem_10rem] sm:items-center sm:gap-6"
          >
            <div className="min-w-0">
              <Link
                className="block truncate font-heading text-lg font-semibold text-slate-950 transition hover:text-cyan-800"
                to={`/posts/${post.id}`}
              >
                {post.title}
              </Link>
              <p className="mt-1 truncate text-sm text-slate-500">
                /{post.slug}
              </p>
            </div>
            <p className="text-sm text-slate-600">
              {post.publishedAt ? 'Published' : 'Draft'}
            </p>
            <p className="text-sm text-slate-500">
              Updated {formatDate(post.updatedAt)}
            </p>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default function PostsClient() {
  return (
    <RelayClientProvider>
      <PostsList />
    </RelayClientProvider>
  )
}
