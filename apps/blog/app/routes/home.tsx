import { Link } from 'react-router'
import { PostDate } from '~/components/post-date'
import { Reveal } from '~/components/reveal'
import { SiteHeader } from '~/components/site-header'
import { requestPublicGraphQL } from '../lib/relay.server'
import type { Route } from './+types/home'

type PostIndexData = {
  posts: {
    id: string
    slug: string
    title: string
    markdownContent: string
    publishedAt: string
  }[]
}

const postIndexQuery = `
  query PublicPostIndexQuery {
    posts {
      id
      slug
      title
      markdownContent
      publishedAt
    }
  }
`

const excerpt = (markdown: string) =>
  markdown
    .replaceAll(/[^\w\s-]/g, '')
    .replaceAll(/\s+/g, ' ')
    .slice(0, 150)

export const loader = async () => {
  const result = await requestPublicGraphQL<PostIndexData>(postIndexQuery)
  return result ?? { posts: [] }
}

export const headers: Route.HeadersFunction = () => ({
  'cache-control': 'public, max-age=60, s-maxage=300',
})

export const meta: Route.MetaFunction = () => [
  { title: 'Field Notes | Observations worth keeping' },
  {
    name: 'description',
    content: 'A collection of considered notes, observations, and small ideas.',
  },
]

export default function Home({ loaderData }: Route.ComponentProps) {
  return (
    <main className="site-shell">
      <SiteHeader />
      <section className="home-hero" aria-labelledby="home-heading">
        <Reveal>
          <p className="eyebrow">Independent writing from everywhere</p>
          <h1 id="home-heading">
            Things noticed,
            <br />
            then written down.
          </h1>
        </Reveal>
      </section>

      <section
        aria-labelledby="dispatches-heading"
        className="post-list-section"
      >
        <div className="section-heading">
          <h2 id="dispatches-heading">Latest dispatches</h2>
          <span>{loaderData.posts.length} entries</span>
        </div>
        <div className="post-list">
          {loaderData.posts.map((post, index) => (
            <Reveal delay={0.08 * index} key={post.id}>
              <article className="post-card">
                <PostDate value={post.publishedAt} />
                <Link prefetch="intent" to={`/posts/${post.slug}`}>
                  <h3>{post.title}</h3>
                  <p>{excerpt(post.markdownContent)}...</p>
                  <span className="post-card-link">
                    Read note <b>↗</b>
                  </span>
                </Link>
              </article>
            </Reveal>
          ))}
        </div>
      </section>
    </main>
  )
}
