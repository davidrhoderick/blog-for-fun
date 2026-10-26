import { graphql, useLazyLoadQuery } from 'react-relay'
import { data } from 'react-router'
import { fetchQuery } from 'relay-runtime'
import type { PublicPostQuery } from '~/__generated__/PublicPostQuery.graphql'
import { Article } from '~/components/article'
import { SiteHeader } from '~/components/site-header'
import { createPublicRelayEnvironment } from '~/lib/relay'
import { resolveGraphQLUrl } from '~/lib/relay.server'
import type { Route } from './+types/post'

// The loader reads title/markdownContent for `meta`; the fragment supplies the
// component's data.
const postQuery = graphql`
  query PublicPostQuery($slug: Slug!) {
    publishedPostBySlug(slug: $slug) {
      title
      markdownContent
      ...PostContent_post
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

  const environment = createPublicRelayEnvironment({ url: resolveGraphQLUrl() })
  const variables = { slug: params.slug }
  const result = await fetchQuery<PublicPostQuery>(
    environment,
    postQuery,
    variables,
  ).toPromise()
  const post = result?.publishedPostBySlug
  if (!post) throw data(null, { status: 404 })

  return {
    meta: { description: description(post.markdownContent), title: post.title },
    records: environment.getStore().getSource().toJSON(),
    variables,
  }
}

export const headers: Route.HeadersFunction = () => ({
  'cache-control': 'public, max-age=60, s-maxage=300',
})

export const meta: Route.MetaFunction = ({ loaderData }) => {
  if (!loaderData?.meta) return [{ title: 'Note not found | Field Notes' }]

  const { description: summary, title } = loaderData.meta
  return [
    { title: `${title} | Field Notes` },
    { name: 'description', content: summary },
    { property: 'og:description', content: summary },
    { property: 'og:title', content: title },
    { property: 'og:type', content: 'article' },
  ]
}

export default function Post({ loaderData }: Route.ComponentProps) {
  const result = useLazyLoadQuery<PublicPostQuery>(
    postQuery,
    loaderData.variables,
    { fetchPolicy: 'store-or-network' },
  )
  const post = result.publishedPostBySlug
  if (!post) {
    // The loader 404s a missing slug; reaching here means the store lost it.
    throw new Error('PublicPostQuery returned no post for a resolved slug')
  }

  return (
    <main className="site-shell">
      <SiteHeader />
      <Article post={post} />
    </main>
  )
}
