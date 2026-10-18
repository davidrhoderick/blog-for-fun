import ReactMarkdown from 'react-markdown'
import { useFragment } from 'react-relay'
import { Link } from 'react-router'
import remarkGfm from 'remark-gfm'
import type { PostContent_post$key } from '~/__generated__/PostContent_post.graphql'
import { postContentFragment } from './post-content'
import { PostDate } from './post-date'
import { Reveal } from './reveal'

export function Article({ post }: { post: PostContent_post$key }) {
  const data = useFragment(postContentFragment, post)

  return (
    <article className="article">
      <Reveal>
        <Link className="back-link" prefetch="intent" to="/">
          <span aria-hidden="true">←</span> All dispatches
        </Link>
        <header className="article-header">
          <p className="eyebrow">
            <PostDate value={data.publishedAt} />
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
