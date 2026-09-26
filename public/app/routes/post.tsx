import ReactMarkdown from 'react-markdown'
import { data, Link } from 'react-router'
import remarkGfm from 'remark-gfm'
import { PostDate } from '~/components/post-date'
import { Reveal } from '~/components/reveal'
import { SiteHeader } from '~/components/site-header'
import { requestPublicGraphQL } from '../lib/relay.server'
import type { Route } from './+types/post'

type PostData = {
  postBySlug: {
    id: string
    slug: string
    title: string
    markdownContent: string
    publishedAt: string
  } | null
}

const postQuery = `
  query PublicPostQuery($slug: Slug!) {
    postBySlug(slug: $slug) {
      id
      slug
      title
      markdownContent
      publishedAt
    }
  }
`

const description = (markdown: string) =>
  markdown
    .replaceAll(/[^\w\s-]/g, '')
    .replaceAll(/\s+/g, ' ')
    .slice(0, 160)

export const loader = async ({ params }: Route.LoaderArgs) => {
  if (!params.slug) throw data(null, { status: 404 })

  const result = await requestPublicGraphQL<PostData>(postQuery, {
    slug: params.slug,
  })
  if (!result?.postBySlug) throw data(null, { status: 404 })

  return result.postBySlug
}

export const headers: Route.HeadersFunction = () => ({
  'cache-control': 'public, max-age=60, s-maxage=300',
})

export const meta: Route.MetaFunction = ({ loaderData: post }) => {
  if (!post) return [{ title: 'Note not found | Field Notes' }]

  const summary = description(post.markdownContent)
  return [
    { title: `${post.title} | Field Notes` },
    { name: 'description', content: summary },
    { property: 'og:description', content: summary },
    { property: 'og:title', content: post.title },
    { property: 'og:type', content: 'article' },
  ]
}

export default function Post({ loaderData: post }: Route.ComponentProps) {
  return (
    <main className="site-shell">
      <SiteHeader />
      <article className="article">
        <Reveal>
          <Link className="back-link" prefetch="intent" to="/">
            <span aria-hidden="true">←</span> All dispatches
          </Link>
          <header className="article-header">
            <p className="eyebrow">
              <PostDate value={post.publishedAt} />
            </p>
            <h1>{post.title}</h1>
          </header>
        </Reveal>
        <Reveal delay={0.15}>
          <div className="article-prose">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {post.markdownContent}
            </ReactMarkdown>
          </div>
        </Reveal>
      </article>
    </main>
  )
}
