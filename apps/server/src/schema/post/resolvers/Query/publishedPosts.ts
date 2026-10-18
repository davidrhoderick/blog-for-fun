import { getPublishedPosts, toPublishedPost } from '../../../../services/posts'
import type { QueryResolvers } from './../../../types.generated'

export const publishedPosts: NonNullable<
  QueryResolvers['publishedPosts']
> = async () => (await getPublishedPosts()).map(toPublishedPost)
