import { GraphQLError } from 'graphql'

const DEFAULT_PAGE_SIZE = 20
export const MAX_PAGE_SIZE = 100

export type PostRevisionPagination = {
  first?: number | null
  after?: string | null
}

type RevisionCursor = {
  version: 1
  postId: string
  revisionNumber: number
}

const invalidCursor = () => new GraphQLError('Invalid revision cursor')

export const encodeRevisionCursor = (postId: string, revisionNumber: number) =>
  Buffer.from(
    JSON.stringify({
      version: 1,
      postId,
      revisionNumber,
    } satisfies RevisionCursor),
  ).toString('base64url')

export const decodeRevisionCursor = (cursor: string, postId: string) => {
  try {
    const decoded = Buffer.from(cursor, 'base64url')
    if (decoded.toString('base64url') !== cursor) throw invalidCursor()

    const value: unknown = JSON.parse(decoded.toString('utf8'))
    if (
      typeof value !== 'object' ||
      value === null ||
      !('version' in value) ||
      value.version !== 1 ||
      !('postId' in value) ||
      value.postId !== postId ||
      !('revisionNumber' in value) ||
      !Number.isInteger(value.revisionNumber) ||
      Number(value.revisionNumber) < 1
    ) {
      throw invalidCursor()
    }

    return Number(value.revisionNumber)
  } catch {
    throw invalidCursor()
  }
}

export const getRevisionPageSize = (first: number | null | undefined) => {
  const pageSize = first ?? DEFAULT_PAGE_SIZE
  if (!Number.isInteger(pageSize) || pageSize < 0) {
    throw new GraphQLError('first must be a non-negative integer')
  }
  if (pageSize > MAX_PAGE_SIZE) {
    throw new GraphQLError(`first cannot exceed ${MAX_PAGE_SIZE}`)
  }
  return pageSize
}
