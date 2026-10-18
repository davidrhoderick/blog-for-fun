import {
  getPublishedPostBySlug,
  toPublishedPost,
} from '../../../../services/posts'
import type { QueryResolvers } from './../../../types.generated'

export const publishedPostBySlug: NonNullable<
  QueryResolvers['publishedPostBySlug']
> = async (_parent, { slug }) => {
  const post = await getPublishedPostBySlug(slug)
  return post ? toPublishedPost(post) : null
}
