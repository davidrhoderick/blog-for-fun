import {
  BlockTypeSelect,
  BoldItalicUnderlineToggles,
  CreateLink,
  codeBlockPlugin,
  headingsPlugin,
  InsertCodeBlock,
  InsertTable,
  InsertThematicBreak,
  imagePlugin,
  ListsToggle,
  linkPlugin,
  listsPlugin,
  MDXEditor,
  type MDXEditorMethods,
  markdownShortcutPlugin,
  quotePlugin,
  tablePlugin,
  thematicBreakPlugin,
  toolbarPlugin,
  UndoRedo,
} from '@mdxeditor/editor'
import '@mdxeditor/editor/style.css'
import { useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import {
  commitMutation,
  graphql,
  useLazyLoadQuery,
  useRelayEnvironment,
} from 'react-relay'
import type { PostEditorFinalizeMediaUploadMutation } from '../__generated__/PostEditorFinalizeMediaUploadMutation.graphql'
import type { PostEditorPrepareMediaUploadMutation } from '../__generated__/PostEditorPrepareMediaUploadMutation.graphql'
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

type MediaUploadFormValues = {
  altText: string
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
    mediaAssets {
      id
      filename
      altText
      url
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

const prepareMediaUploadMutation = graphql`
  mutation PostEditorPrepareMediaUploadMutation($input: PrepareMediaUploadInput!) {
    prepareMediaUpload(input: $input) {
      asset { id }
      uploadUrl
    }
  }
`

const finalizeMediaUploadMutation = graphql`
  mutation PostEditorFinalizeMediaUploadMutation($id: ID!) {
    finalizeMediaUpload(id: $id) {
      id
      filename
      altText
      url
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

  return (
    <PostEditorForm id={id} mediaAssets={data.mediaAssets} post={data.post} />
  )
}

const PostEditorForm = ({
  id,
  mediaAssets: initialMediaAssets,
  post,
}: {
  id: string
  mediaAssets: PostEditorQuery['response']['mediaAssets']
  post: NonNullable<PostEditorQuery['response']['post']>
}) => {
  const environment = useRelayEnvironment()
  const editorRef = useRef<MDXEditorMethods>(null)
  const form = useForm<PostFormValues>({ values: toPostFormValues(post) })
  const mediaUploadForm = useForm<MediaUploadFormValues>({
    defaultValues: { altText: '' },
  })
  const [mediaAssets, setMediaAssets] = useState(initialMediaAssets)
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [isUploading, setIsUploading] = useState(false)
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

  const insertImage = (asset: { altText: string; url: string }) => {
    const altText = asset.altText
      .replaceAll(/[\r\n]+/g, ' ')
      .replaceAll(']', '\\]')
    editorRef.current?.focus(() => {
      editorRef.current?.insertMarkdown(`![${altText}](${asset.url})`)
    })
  }

  const uploadImage = mediaUploadForm.handleSubmit(({ altText }) => {
    if (!uploadFile) {
      setUploadError('Choose an image to upload.')
      return
    }

    setIsUploading(true)
    setUploadError(null)
    commitMutation<PostEditorPrepareMediaUploadMutation>(environment, {
      mutation: prepareMediaUploadMutation,
      variables: {
        input: {
          filename: uploadFile.name,
          contentType: uploadFile.type,
          size: uploadFile.size,
          altText: altText.trim(),
          attachedPostId: id,
        },
      },
      onCompleted: async ({ prepareMediaUpload }) => {
        try {
          const response = await fetch(prepareMediaUpload.uploadUrl, {
            method: 'PUT',
            headers: { 'content-type': uploadFile.type },
            body: uploadFile,
          })
          if (!response.ok) throw new Error('Upload failed')

          commitMutation<PostEditorFinalizeMediaUploadMutation>(environment, {
            mutation: finalizeMediaUploadMutation,
            variables: { id: prepareMediaUpload.asset.id },
            onCompleted: ({ finalizeMediaUpload }) => {
              setMediaAssets((assets) => [finalizeMediaUpload, ...assets])
              insertImage(finalizeMediaUpload)
              setUploadFile(null)
              setIsUploading(false)
              mediaUploadForm.reset()
            },
            onError: () => {
              setIsUploading(false)
              setUploadError(
                'The uploaded image could not be verified. Please try again.',
              )
            },
          })
        } catch {
          setIsUploading(false)
          setUploadError('The image could not be uploaded. Please try again.')
        }
      },
      onError: () => {
        setIsUploading(false)
        setUploadError('The image could not be prepared for upload.')
      },
    })
  })

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
            onChange={(markdown) =>
              form.setValue('markdownContent', markdown, {
                shouldDirty: true,
                shouldTouch: true,
              })
            }
            plugins={[
              headingsPlugin(),
              imagePlugin(),
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
            ref={editorRef}
          />
        </section>
        <section aria-labelledby="media-label" className="post-editor-field">
          <span className="post-editor-label" id="media-label">
            Media library
          </span>
          <div className="media-library">
            <label className="media-library-file">
              <span className="post-editor-label">Image file</span>
              <input
                accept="image/avif,image/gif,image/jpeg,image/png,image/webp"
                disabled={isUploading}
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0]
                  setUploadFile(file ?? null)
                  if (file && !mediaUploadForm.getValues('altText')) {
                    mediaUploadForm.setValue(
                      'altText',
                      file.name
                        .replace(/\.[^.]+$/, '')
                        .replaceAll(/[-_]/g, ' '),
                    )
                  }
                }}
                type="file"
              />
            </label>
            <label className="media-library-field">
              <span className="post-editor-label">Alternative text</span>
              <input
                className="post-editor-input"
                disabled={isUploading}
                {...mediaUploadForm.register('altText', {
                  required: 'Describe the image for readers who cannot see it.',
                })}
              />
            </label>
            {mediaUploadForm.formState.errors.altText ? (
              <p className="media-library-error">
                {mediaUploadForm.formState.errors.altText.message}
              </p>
            ) : null}
            <button
              className="media-library-upload"
              disabled={isUploading}
              onClick={uploadImage}
              type="button"
            >
              {isUploading ? 'Uploading image...' : 'Upload and insert'}
            </button>
            {uploadError ? (
              <p className="media-library-error">{uploadError}</p>
            ) : null}
            <div className="media-library-grid">
              {mediaAssets.length === 0 ? (
                <p className="media-library-empty">No images uploaded yet.</p>
              ) : null}
              {mediaAssets.map((asset) => (
                <button
                  className="media-library-item"
                  key={asset.id}
                  onClick={() => insertImage(asset)}
                  type="button"
                >
                  <img alt="" src={asset.url} />
                  <span>{asset.altText || asset.filename}</span>
                </button>
              ))}
            </div>
          </div>
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
