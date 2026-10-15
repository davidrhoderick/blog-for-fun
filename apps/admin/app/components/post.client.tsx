import type { MDXEditorMethods } from '@mdxeditor/editor'
import { type RefObject, useEffect, useRef, useState } from 'react'
import { type UseFormReturn, useForm } from 'react-hook-form'
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
import {
  MarkdownField,
  MediaLibrary,
  type MediaUploadFormValues,
  type PostFormValues,
  PostMetaPanel,
} from './post-editor-fields.client'
import { RelayClientProvider } from './relay.client'

type FinalizedMediaAsset =
  PostEditorFinalizeMediaUploadMutation['response']['finalizeMediaUpload']

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

const performUpload = async ({
  environment,
  file,
  altText,
  id,
  onFinalized,
  onError,
}: {
  environment: ReturnType<typeof useRelayEnvironment>
  file: File
  altText: string
  id: string
  onFinalized: (asset: FinalizedMediaAsset) => void
  onError: (message: string) => void
}) => {
  commitMutation<PostEditorPrepareMediaUploadMutation>(environment, {
    mutation: prepareMediaUploadMutation,
    variables: {
      input: {
        filename: file.name,
        contentType: file.type,
        size: file.size,
        altText: altText.trim(),
        attachedPostId: id,
      },
    },
    onCompleted: async ({ prepareMediaUpload }) => {
      try {
        const response = await fetch(prepareMediaUpload.uploadUrl, {
          method: 'PUT',
          headers: { 'content-type': file.type },
          body: file,
        })
        if (!response.ok) throw new Error('Upload failed')

        commitMutation<PostEditorFinalizeMediaUploadMutation>(environment, {
          mutation: finalizeMediaUploadMutation,
          variables: { id: prepareMediaUpload.asset.id },
          onCompleted: ({ finalizeMediaUpload }) =>
            onFinalized(finalizeMediaUpload),
          onError: () =>
            onError(
              'The uploaded image could not be verified. Please try again.',
            ),
        })
      } catch {
        onError('The image could not be uploaded. Please try again.')
      }
    },
    onError: () => onError('The image could not be prepared for upload.'),
  })
}

const changePublication = (
  environment: ReturnType<typeof useRelayEnvironment>,
  id: string,
  publish: boolean,
) => {
  commitMutation<PostEditorPublishMutation | PostEditorUnpublishMutation>(
    environment,
    {
      mutation: publish ? publishPostMutation : unpublishPostMutation,
      variables: { id },
    },
  )
}

const useMediaUpload = ({
  id,
  initialMediaAssets,
  editorRef,
  mediaUploadForm,
}: {
  id: string
  initialMediaAssets: PostEditorQuery['response']['mediaAssets']
  editorRef: RefObject<MDXEditorMethods | null>
  mediaUploadForm: UseFormReturn<MediaUploadFormValues>
}) => {
  const environment = useRelayEnvironment()
  const [mediaAssets, setMediaAssets] = useState(initialMediaAssets)
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [isUploading, setIsUploading] = useState(false)

  const insertImage = (asset: { altText: string; url: string }) => {
    const altText = asset.altText
      .replaceAll(/[\r\n]+/g, ' ')
      .replaceAll(']', '\\]')
    editorRef.current?.focus(() => {
      editorRef.current?.insertMarkdown(`![${altText}](${asset.url})`)
    })
  }

  const chooseFile = (file: File | null) => {
    setUploadFile(file)
    if (file && !mediaUploadForm.getValues('altText')) {
      mediaUploadForm.setValue(
        'altText',
        file.name.replace(/\.[^.]+$/, '').replaceAll(/[-_]/g, ' '),
      )
    }
  }

  const uploadImage = mediaUploadForm.handleSubmit(({ altText }) => {
    if (!uploadFile) {
      setUploadError('Choose an image to upload.')
      return
    }
    setIsUploading(true)
    setUploadError(null)
    performUpload({
      environment,
      file: uploadFile,
      altText,
      id,
      onFinalized: (asset) => {
        setMediaAssets((assets) => [asset, ...assets])
        insertImage(asset)
        setUploadFile(null)
        setIsUploading(false)
        mediaUploadForm.reset()
      },
      onError: (message) => {
        setIsUploading(false)
        setUploadError(message)
      },
    })
  })

  return {
    mediaAssets,
    uploadError,
    isUploading,
    insertImage,
    chooseFile,
    uploadImage,
  }
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
  const media = useMediaUpload({
    id,
    initialMediaAssets,
    editorRef,
    mediaUploadForm,
  })
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
        <PostMetaPanel
          onChangePublication={() =>
            changePublication(environment, id, !published)
          }
          published={published}
          variant="narrow"
        />
        <label className="post-editor-field">
          <span className="post-editor-label">Slug</span>
          <input className="post-editor-input" {...form.register('slug')} />
        </label>
        <MarkdownField editorRef={editorRef} form={form} />
        <MediaLibrary
          isUploading={media.isUploading}
          mediaAssets={media.mediaAssets}
          mediaUploadForm={mediaUploadForm}
          onChooseFile={media.chooseFile}
          onInsert={media.insertImage}
          onUpload={media.uploadImage}
          uploadError={media.uploadError}
        />
      </div>
      <PostMetaPanel
        onChangePublication={() =>
          changePublication(environment, id, !published)
        }
        published={published}
        variant="wide"
      />
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
