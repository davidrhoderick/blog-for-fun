import ReactMarkdown from 'react-markdown'
import { graphql, useFragment } from 'react-relay'
import { Link } from 'react-router'
import remarkGfm from 'remark-gfm'
import type { Article_post$key } from '~/__generated__/Article_post.graphql'
import { PostDate } from './post-date'
import { Reveal } from './reveal'

const articleFragment = graphql`
  fragment Article_post on Post {
    id
    slug
    title
    markdownContent
    publishedAt
  }
`

export function Article({ post }: { post: Article_post$key }) {
  const data = useFragment(articleFragment, post)

  return (
    <article className="article">
      <Reveal>
        <Link className="back-link" prefetch="intent" to="/">
          <span aria-hidden="true">←</span> All dispatches
        </Link>
        <header className="article-header">
          <p className="eyebrow">
            {data.publishedAt ? <PostDate value={data.publishedAt} /> : null}
          </p>
          <h1>{data.title}</h1>
        </header>
      </Reveal>
      <Reveal delay={0.15}>
        <div className="article-prose">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {data.markdownContent}
          </ReactMarkdown>
        </div>
      </Reveal>
    </article>
  )
}
