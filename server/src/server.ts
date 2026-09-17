import { createServer } from 'node:http'
import { fileURLToPath } from 'node:url'
import { createSchema, createYoga, type Plugin } from 'graphql-yoga'
import { type AuthContext, createAuthContext } from './auth/context'
import { resolvers } from './schema/resolvers.generated'
import { typeDefs } from './schema/typeDefs.generated'

const useResponseHeaders = (): Plugin<AuthContext> => ({
  onExecute() {
    return {
      onExecuteDone({ args, result, setResult }) {
        if (Symbol.asyncIterator in result) return

        const cookie = args.contextValue.responseHeaders.get('set-cookie')
        if (!cookie) return

        setResult({
          ...result,
          extensions: {
            ...result.extensions,
            http: {
              headers: { 'set-cookie': cookie },
            },
          },
        })
      },
    }
  },
})

export const createApp = () =>
  createYoga({
    schema: createSchema({ typeDefs, resolvers }),
    context: ({ request }) => createAuthContext(request),
    cors: false,
    plugins: [useResponseHeaders()],
  })

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const server = createServer(createApp())
  server.listen(4000, () => {
    console.info('Server is running on http://localhost:4000/graphql')
  })
}
