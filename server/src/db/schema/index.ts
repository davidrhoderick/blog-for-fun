import { defineRelations } from 'drizzle-orm'
import {
  authPasswordCredentials,
  authSessions,
  authUserRoles,
  authUsers,
  users,
} from './auth'
import { mediaAssets, postRevisions, posts } from './posts'

export * from './auth'
export * from './posts'

export const relations = defineRelations(
  {
    authPasswordCredentials,
    authSessions,
    authUserRoles,
    authUsers,
    mediaAssets,
    postRevisions,
    posts,
    users,
  },
  (r) => ({
    authUsers: {
      profile: r.one.users({
        from: r.authUsers.id,
        to: r.users.id,
        optional: false,
      }),
      passwordCredential: r.one.authPasswordCredentials({
        from: r.authUsers.id,
        to: r.authPasswordCredentials.authUserId,
        optional: true,
      }),
      roles: r.many.authUserRoles(),
      sessions: r.many.authSessions(),
    },
    users: {
      authUser: r.one.authUsers({
        from: r.users.id,
        to: r.authUsers.id,
        optional: false,
      }),
    },
    authPasswordCredentials: {
      authUser: r.one.authUsers({
        from: r.authPasswordCredentials.authUserId,
        to: r.authUsers.id,
        optional: false,
      }),
    },
    authUserRoles: {
      authUser: r.one.authUsers({
        from: r.authUserRoles.authUserId,
        to: r.authUsers.id,
        optional: false,
      }),
    },
    authSessions: {
      authUser: r.one.authUsers({
        from: r.authSessions.authUserId,
        to: r.authUsers.id,
        optional: false,
      }),
    },
    posts: {
      attachedMedia: r.many.mediaAssets(),
      revisions: r.many.postRevisions(),
    },
    mediaAssets: {
      attachedPost: r.one.posts({
        from: r.mediaAssets.attachedPostId,
        to: r.posts.id,
        optional: true,
      }),
    },
    postRevisions: {
      post: r.one.posts({
        from: r.postRevisions.postId,
        to: r.posts.id,
        optional: false,
      }),
    },
  }),
)
