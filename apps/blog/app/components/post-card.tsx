import { graphql, useFragment } from 'react-relay'
import { Link } from 'react-router'
import type { PostCard_post$key } from '~/__generated__/PostCard_post.graphql'
import { PostDate } from './post-date'
import { Reveal } from './reveal'

const postCardFragment = graphql`
  fragment PostCard_post on Post {
    id
    slug
    title
    markdownContent
    publishedAt
  }
`

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
  post: PostCard_post$key
}) {
  const data = useFragment(postCardFragment, post)

  return (
    <Reveal delay={delay}>
      <article className="post-card">
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
