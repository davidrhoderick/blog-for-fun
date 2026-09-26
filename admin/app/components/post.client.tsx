import {
  BlockTypeSelect,
  BoldItalicUnderlineToggles,
  CreateLink,
  codeBlockPlugin,
  headingsPlugin,
  InsertCodeBlock,
  InsertTable,
  InsertThematicBreak,
  ListsToggle,
  linkPlugin,
  listsPlugin,
  MDXEditor,
  markdownShortcutPlugin,
  quotePlugin,
  tablePlugin,
  thematicBreakPlugin,
  toolbarPlugin,
  UndoRedo,
} from '@mdxeditor/editor'
import '@mdxeditor/editor/style.css'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import {
  commitMutation,
  graphql,
  useLazyLoadQuery,
  useRelayEnvironment,
} from 'react-relay'
import type { PostEditorPublishMutation } from '../__generated__/PostEditorPublishMutation.graphql'
import type { PostEditorQuery } from '../__generated__/PostEditorQuery.graphql'
import type { PostEditorSaveMutation } from '../__generated__/PostEditorSaveMutation.graphql'
import type { PostEditorUnpublishMutation } from '../__generated__/PostEditorUnpublishMutation.graphql'
import { RelayClientProvider } from './relay.client'

type PostFormValues = {
  title: string
  slug: string
  markdownContent: string
}

const postEditorQuery = graphql`
  query PostEditorQuery($id: ID!) {
    post(id: $id) {
      id
      title
      slug
      markdownContent
      publishedAt
    }
  }
`

const savePostMutation = graphql`
  mutation PostEditorSaveMutation($input: PutPostInput!) {
    putPost(input: $input) {
      id
      title
      slug
      markdownContent
      publishedAt
    }
  }
`

const publishPostMutation = graphql`
  mutation PostEditorPublishMutation($id: ID!) {
    publishPost(id: $id) {
      id
      publishedAt
    }
  }
`

const unpublishPostMutation = graphql`
  mutation PostEditorUnpublishMutation($id: ID!) {
    unpublishPost(id: $id) {
      id
      publishedAt
    }
  }
`

const toPostFormValues = (post: {
  title: string
  slug: string
  markdownContent: string
}): PostFormValues => ({
  title: post.title,
  slug: post.slug,
  markdownContent: post.markdownContent,
})

const PostEditor = ({ id }: { id: string }) => {
  const data = useLazyLoadQuery<PostEditorQuery>(postEditorQuery, { id })
  if (!data.post) {
    return <p className="editor-loading">Post not found.</p>
  }

  return <PostEditorForm id={id} post={data.post} />
}

const PostEditorForm = ({
  id,
  post,
}: {
  id: string
  post: NonNullable<PostEditorQuery['response']['post']>
}) => {
  const environment = useRelayEnvironment()
  const form = useForm<PostFormValues>({ values: toPostFormValues(post) })
  const published = post.publishedAt !== null

  useEffect(() => {
    form.reset(toPostFormValues(post))
  }, [form, post])

  const save = form.handleSubmit((values) => {
    commitMutation<PostEditorSaveMutation>(environment, {
      mutation: savePostMutation,
      variables: { input: { id, ...values } },
      onCompleted: ({ putPost }) => form.reset(toPostFormValues(putPost)),
    })
  })

  const changePublication = (publish: boolean) => {
    commitMutation<PostEditorPublishMutation | PostEditorUnpublishMutation>(
      environment,
      {
        mutation: publish ? publishPostMutation : unpublishPostMutation,
        variables: { id },
      },
    )
  }

  return (
    <form className="post-editor" onSubmit={save}>
      <div className="post-editor-fields">
        <label className="post-editor-field">
          <span className="post-editor-label">Title</span>
          <input
            className="post-editor-input post-editor-title"
            {...form.register('title')}
          />
        </label>
        <aside className="post-editor-panel post-editor-panel-narrow">
          <p className="text-xs font-medium tracking-[0.12em] text-slate-500 uppercase">
            {published ? 'Published' : 'Draft'}
          </p>
          <div className="post-editor-actions">
            <button
              className="post-editor-button post-editor-button-primary"
              type="submit"
            >
              Update
            </button>
            <button
              className="post-editor-button"
              onClick={() => changePublication(!published)}
              type="button"
            >
              {published ? 'Unpublish' : 'Publish'}
            </button>
          </div>
        </aside>
        <label className="post-editor-field">
          <span className="post-editor-label">Slug</span>
          <input className="post-editor-input" {...form.register('slug')} />
        </label>
        <section aria-labelledby="markdown-label" className="post-editor-field">
          <span className="post-editor-label" id="markdown-label">
            Markdown
          </span>
          <MDXEditor
            className="post-editor-markdown"
            markdown={form.watch('markdownContent')}
            onChange={(markdown) => form.setValue('markdownContent', markdown)}
            plugins={[
              headingsPlugin(),
              listsPlugin(),
              quotePlugin(),
              thematicBreakPlugin(),
              linkPlugin(),
              tablePlugin(),
              codeBlockPlugin(),
              markdownShortcutPlugin(),
              toolbarPlugin({
                toolbarContents: () => (
                  <>
                    <UndoRedo />
                    <BlockTypeSelect />
                    <BoldItalicUnderlineToggles />
                    <CreateLink />
                    <ListsToggle />
                    <InsertTable />
                    <InsertCodeBlock />
                    <InsertThematicBreak />
                  </>
                ),
              }),
            ]}
          />
        </section>
      </div>
      <aside className="post-editor-panel post-editor-panel-wide">
        <p className="text-xs font-medium tracking-[0.12em] text-slate-500 uppercase">
          {published ? 'Published' : 'Draft'}
        </p>
        <div className="post-editor-actions">
          <button
            className="post-editor-button post-editor-button-primary"
            type="submit"
          >
            Update
          </button>
          <button
            className="post-editor-button"
            onClick={() => changePublication(!published)}
            type="button"
          >
            {published ? 'Unpublish' : 'Publish'}
          </button>
        </div>
      </aside>
    </form>
  )
}

export default function PostClient({ id }: { id: string }) {
  return (
    <RelayClientProvider>
      <PostEditor id={id} />
    </RelayClientProvider>
  )
}
