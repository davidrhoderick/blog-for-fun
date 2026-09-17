import { defineRelations } from 'drizzle-orm'
import {
  authPasswordCredentials,
  authSessions,
  authUserRoles,
  authUsers,
  users,
} from './auth'
import { postRevisions, posts } from './posts'

export * from './auth'
export * from './posts'

export const relations = defineRelations(
  {
    authPasswordCredentials,
    authSessions,
    authUserRoles,
    authUsers,
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
      revisions: r.many.postRevisions(),
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
