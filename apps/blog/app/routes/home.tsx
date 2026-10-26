import { graphql, useLazyLoadQuery } from 'react-relay'
import { fetchQuery } from 'relay-runtime'
import type { PublicPostIndexQuery } from '~/__generated__/PublicPostIndexQuery.graphql'
import { PostCard } from '~/components/post-card'
import { Reveal } from '~/components/reveal'
import { SiteHeader } from '~/components/site-header'
import { blogHeaders } from '~/lib/headers'
import { createPublicRelayEnvironment } from '~/lib/relay'
import { resolveGraphQLUrl } from '~/lib/relay.server'
import type { Route } from './+types/home'

const postIndexQuery = graphql`
  query PublicPostIndexQuery {
    publishedPosts {
      id
      ...PostContent_post
    }
  }
`

export const loader = async () => {
  const environment = createPublicRelayEnvironment({ url: resolveGraphQLUrl() })
  await fetchQuery(environment, postIndexQuery, {}).toPromise()

  return { records: environment.getStore().getSource().toJSON() }
}

export const headers = blogHeaders()

export const meta: Route.MetaFunction = () => [
  { title: 'Field Notes | Observations worth keeping' },
  {
    name: 'description',
    content: 'A collection of considered notes, observations, and small ideas.',
  },
]

export default function Home() {
  // The loader already fetched this query and serialized its store; this reads it.
  const data = useLazyLoadQuery<PublicPostIndexQuery>(
    postIndexQuery,
    {},
    { fetchPolicy: 'store-or-network' },
  )

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
          <span>{data.publishedPosts.length} entries</span>
        </div>
        <div className="post-list">
          {data.publishedPosts.map((post, index) => (
            <PostCard delay={0.08 * index} key={post.id} post={post} />
          ))}
        </div>
      </section>
    </main>
  )
}
