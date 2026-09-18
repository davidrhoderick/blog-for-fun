import { eq, max } from 'drizzle-orm'
import { GraphQLError } from 'graphql'
import { db } from '../../db'
import { postRevisions, posts } from '../../db/schema'
import type { PutPostInput } from '../../schema/types.generated'
import { getPost, getPostBySlug } from './getPosts'
import { toPost } from './toPost'

type CreatePostInput = {
  slug: string
  title: string
  markdownContent: string
  publishedAt: Date | null
}

const duplicateSlugError = () =>
  new GraphQLError('A post already uses this slug')

const ensureSlugIsAvailable = async (slug: string, id?: string) => {
  const post = await getPostBySlug(slug)
  if (post && post.id !== id) {
    throw duplicateSlugError()
  }
}

const isDuplicateSlugError = (error: unknown) =>
  error instanceof Error &&
  error.message.includes('UNIQUE constraint failed: posts.slug')

const createPostInput = (input: PutPostInput): CreatePostInput => {
  if (
    input.slug === undefined ||
    input.slug === null ||
    input.title === undefined ||
    input.title === null ||
    input.markdownContent === undefined ||
    input.markdownContent === null
  ) {
    throw new GraphQLError(
      'slug, title, and markdownContent are required when creating a post',
    )
  }

  return {
    slug: input.slug,
    title: input.title,
    markdownContent: input.markdownContent,
    publishedAt: input.publishedAt ? new Date(input.publishedAt) : null,
  }
}

const createPost = async (input: CreatePostInput) => {
  await ensureSlugIsAvailable(input.slug)

  try {
    const [post] = await db
      .insert(posts)
      .values({ ...input, title: input.title.trim() })
      .returning()
    return toPost(post)
  } catch (error) {
    if (isDuplicateSlugError(error)) {
      throw duplicateSlugError()
    }

    throw error
  }
}

const updatePost = async (id: string, input: PutPostInput) => {
  const post = await getPost(id)
  if (!post) {
    throw new GraphQLError('Post not found')
  }

  if (
    input.slug === null ||
    input.title === null ||
    input.markdownContent === null
  ) {
    throw new GraphQLError('Post fields cannot be null')
  }

  const publishedAt =
    input.publishedAt === undefined
      ? undefined
      : input.publishedAt === null
        ? null
        : new Date(input.publishedAt)

  const values = {
    ...(input.slug === undefined ? {} : { slug: input.slug }),
    ...(input.title === undefined ? {} : { title: input.title.trim() }),
    ...(input.markdownContent === undefined
      ? {}
      : { markdownContent: input.markdownContent }),
    ...(publishedAt === undefined ? {} : { publishedAt }),
  }

  const slugChanged = values.slug !== undefined && values.slug !== post.slug
  const contentChanged =
    (values.title !== undefined && values.title !== post.title) ||
    (values.markdownContent !== undefined &&
      values.markdownContent !== post.markdownContent)
  const publicationChanged =
    publishedAt !== undefined &&
    publishedAt?.getTime() !==
      (post.publishedAt instanceof Date
        ? post.publishedAt.getTime()
        : post.publishedAt
          ? new Date(post.publishedAt).getTime()
          : undefined)

  if (!slugChanged && !contentChanged && !publicationChanged) {
    return post
  }

  if (slugChanged && values.slug) {
    await ensureSlugIsAvailable(values.slug, id)
  }

  try {
    const updatedPost = await db.transaction(async (tx) => {
      if (contentChanged) {
        const [latestRevision] = await tx
          .select({ revisionNumber: max(postRevisions.revisionNumber) })
          .from(postRevisions)
          .where(eq(postRevisions.postId, id))

        await tx.insert(postRevisions).values({
          postId: id,
          revisionNumber: (latestRevision.revisionNumber ?? 0) + 1,
          title: post.title,
          markdownContent: post.markdownContent,
        })
      }

      const [updatedPost] = await tx
        .update(posts)
        .set({ ...values, updatedAt: new Date() })
        .where(eq(posts.id, id))
        .returning()
      return updatedPost
    })
    return toPost(updatedPost)
  } catch (error) {
    if (isDuplicateSlugError(error)) {
      throw duplicateSlugError()
    }

    throw error
  }
}

export const putPost = async (input: PutPostInput) => {
  if (input.id !== undefined && input.id !== null) {
    return updatePost(input.id, input)
  }

  return createPost(createPostInput(input))
}
