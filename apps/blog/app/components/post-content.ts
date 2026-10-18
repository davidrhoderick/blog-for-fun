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
