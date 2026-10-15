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
import type { RefObject } from 'react'
import type { UseFormReturn } from 'react-hook-form'
import type { PostEditorQuery } from '../__generated__/PostEditorQuery.graphql'

export type PostFormValues = {
  title: string
  slug: string
  markdownContent: string
}

export type MediaUploadFormValues = {
  altText: string
}

type MediaAsset = PostEditorQuery['response']['mediaAssets'][number]
type MediaAssets = PostEditorQuery['response']['mediaAssets']

export const PostMetaPanel = ({
  published,
  variant,
  onChangePublication,
}: {
  published: boolean
  variant: 'narrow' | 'wide'
  onChangePublication: () => void
}) => (
  <aside className={`post-editor-panel post-editor-panel-${variant}`}>
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
        onClick={onChangePublication}
        type="button"
      >
        {published ? 'Unpublish' : 'Publish'}
      </button>
    </div>
  </aside>
)

export const MarkdownField = ({
  editorRef,
  form,
}: {
  editorRef: RefObject<MDXEditorMethods | null>
  form: UseFormReturn<PostFormValues>
}) => (
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
)

export const MediaLibrary = ({
  mediaAssets,
  mediaUploadForm,
  isUploading,
  uploadError,
  onChooseFile,
  onUpload,
  onInsert,
}: {
  mediaAssets: MediaAssets
  mediaUploadForm: UseFormReturn<MediaUploadFormValues>
  isUploading: boolean
  uploadError: string | null
  onChooseFile: (file: File | null) => void
  onUpload: () => void
  onInsert: (asset: MediaAsset) => void
}) => (
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
          onChange={(event) =>
            onChooseFile(event.currentTarget.files?.[0] ?? null)
          }
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
        onClick={onUpload}
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
            onClick={() => onInsert(asset)}
            type="button"
          >
            <img alt="" src={asset.url} />
            <span>{asset.altText || asset.filename}</span>
          </button>
        ))}
      </div>
    </div>
  </section>
)
