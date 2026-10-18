import { graphql } from 'react-relay'

/**
 * Fields both the list card and the article need. Kept in one fragment so the
 * two presentations cannot drift apart.
 */
export const postContentFragment = graphql`
  fragment PostContent_post on Post {
    id
    slug
    title
    markdownContent
    publishedAt
  }
`

/**
 * The schema keeps `publishedAt` nullable and only the public resolvers filter
 * to published posts, so null here means that invariant broke. Fail loudly
 * rather than silently omitting the date.
 */
export const requirePublishedAt = (post: {
  id: string
  publishedAt: string | null
}) => {
  if (!post.publishedAt) {
    throw new Error(`Published post ${post.id} is missing publishedAt`)
  }

  return post.publishedAt
}
