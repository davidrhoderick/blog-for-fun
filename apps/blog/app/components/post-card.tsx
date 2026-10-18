import { useFragment } from 'react-relay'
import { Link } from 'react-router'
import type { PostContent_post$key } from '~/__generated__/PostContent_post.graphql'
import { postContentFragment } from './post-content'
import { PostDate } from './post-date'
import { Reveal } from './reveal'

const excerpt = (markdown: string) =>
  markdown
    .replaceAll(/[^\w\s-]/g, '')
    .replaceAll(/\s+/g, ' ')
    .slice(0, 150)

export function PostCard({
  delay = 0,
  post,
}: {
  delay?: number
  post: PostContent_post$key
}) {
  const data = useFragment(postContentFragment, post)

  return (
    <Reveal delay={delay}>
      <article className="post-card">
        {/* publishedAt is nullable in the schema; public posts always have it. */}
        {data.publishedAt ? <PostDate value={data.publishedAt} /> : null}
        <Link prefetch="intent" to={`/posts/${data.slug}`}>
          <h3>{data.title}</h3>
          <p>{excerpt(data.markdownContent)}...</p>
          <span className="post-card-link">
            Read note <b>↗</b>
          </span>
        </Link>
      </article>
    </Reveal>
  )
}
