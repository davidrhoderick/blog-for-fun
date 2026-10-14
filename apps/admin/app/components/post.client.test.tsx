import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, expect, test, vi } from 'vitest'
import { relayEnvironment } from '../lib/relay-environment.client'
import PostClient from './post.client'

const draft = {
  id: 'post-1',
  title: 'First note',
  slug: 'first-note',
  markdownContent: 'Body text.',
  publishedAt: null,
}

const asset = {
  id: 'asset-1',
  filename: 'photo.png',
  altText: 'A photo',
  url: 'https://media.example.com/photo.png',
}

const jsonResponse = (data: unknown) =>
  new Response(JSON.stringify({ data }), { status: 200 })

const operationName = (init: RequestInit | undefined) =>
  JSON.parse(String(init?.body)).operationName as string

const stubEditorFetch = () => {
  const fetchMock = vi.fn(async (_url: unknown, init?: RequestInit) => {
    if (init?.method === 'PUT') return new Response(null, { status: 200 })

    switch (operationName(init)) {
      case 'PostEditorQuery':
        return jsonResponse({ post: draft, mediaAssets: [asset] })
      case 'PostEditorSaveMutation':
        return jsonResponse({
          putPost: { ...draft, title: 'Renamed note' },
        })
      case 'PostEditorPublishMutation':
        return jsonResponse({
          publishPost: {
            id: 'post-1',
            publishedAt: '2026-02-01T00:00:00.000Z',
          },
        })
      case 'PostEditorUnpublishMutation':
        return jsonResponse({
          unpublishPost: { id: 'post-1', publishedAt: null },
        })
      case 'PostEditorPrepareMediaUploadMutation':
        return jsonResponse({
          prepareMediaUpload: {
            asset: { id: 'asset-2' },
            uploadUrl: 'https://media.example.com/upload',
          },
        })
      case 'PostEditorFinalizeMediaUploadMutation':
        return jsonResponse({
          finalizeMediaUpload: {
            id: 'asset-2',
            filename: 'my-photo.png',
            altText: 'my photo',
            url: 'https://media.example.com/my-photo.png',
          },
        })
      default:
        return jsonResponse({})
    }
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const renderEditor = () =>
  render(
    <MemoryRouter>
      <PostClient id="post-1" />
    </MemoryRouter>,
  )

const sentOperations = (fetchMock: ReturnType<typeof stubEditorFetch>) =>
  fetchMock.mock.calls
    .filter(([, init]) => init?.method !== 'PUT')
    .map(([, init]) => operationName(init))

const findEditor = () =>
  screen.findByDisplayValue('First note', {}, { timeout: 10_000 })

const clearRelayStore = () =>
  (
    relayEnvironment.getStore().getSource() as unknown as {
      clear(): void
    }
  ).clear()

afterEach(() => {
  vi.unstubAllGlobals()
  clearRelayStore()
})

test('edits a post, publishes it, and lists its media', {
  tags: ['integration'],
}, async () => {
  const fetchMock = stubEditorFetch()
  renderEditor()

  expect(await findEditor()).toBeTruthy()
  expect(screen.getByDisplayValue('first-note')).toBeTruthy()
  expect(screen.getAllByText('Draft')).toHaveLength(2)
  expect(screen.getByText('A photo')).toBeTruthy()

  fireEvent.click(screen.getAllByRole('button', { name: 'Update' })[0])
  fireEvent.click(screen.getAllByRole('button', { name: 'Publish' })[0])

  await waitFor(() => {
    const operations = sentOperations(fetchMock)
    expect(operations).toContain('PostEditorSaveMutation')
    expect(operations).toContain('PostEditorPublishMutation')
  })
})

test('inserts an uploaded image into the editor', {
  tags: ['integration'],
}, async () => {
  const fetchMock = stubEditorFetch()
  renderEditor()
  await findEditor()

  fireEvent.change(screen.getByLabelText('Image file'), {
    target: {
      files: [new File(['image bytes'], 'my-photo.png', { type: 'image/png' })],
    },
  })
  expect(screen.getByDisplayValue('my photo')).toBeTruthy()

  fireEvent.click(screen.getByRole('button', { name: 'Upload and insert' }))

  expect(await screen.findByText('my photo')).toBeTruthy()
  await waitFor(() => {
    expect(sentOperations(fetchMock)).toContain(
      'PostEditorFinalizeMediaUploadMutation',
    )
  })
})

test('asks for a file before uploading', { tags: ['unit'] }, async () => {
  stubEditorFetch()
  renderEditor()
  await findEditor()

  fireEvent.change(screen.getByLabelText('Alternative text'), {
    target: { value: 'A described image' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Upload and insert' }))

  expect(await screen.findByText('Choose an image to upload.')).toBeTruthy()
})

test('offers to unpublish a published post', { tags: ['unit'] }, async () => {
  const fetchMock = stubEditorFetch()
  fetchMock.mockImplementation(async (_url: unknown, init?: RequestInit) => {
    if (operationName(init) === 'PostEditorQuery') {
      return jsonResponse({
        post: { ...draft, publishedAt: '2026-01-01T00:00:00.000Z' },
        mediaAssets: [],
      })
    }
    return jsonResponse({ unpublishPost: { id: 'post-1', publishedAt: null } })
  })

  renderEditor()

  expect(
    await screen.findByText('No images uploaded yet.', {}, { timeout: 10_000 }),
  ).toBeTruthy()
  expect(screen.getAllByText('Published')).toHaveLength(2)
  fireEvent.click(screen.getAllByRole('button', { name: 'Unpublish' })[0])

  await waitFor(() => {
    expect(sentOperations(fetchMock)).toContain('PostEditorUnpublishMutation')
  })
})

test('reports a missing post', { tags: ['unit'] }, async () => {
  const fetchMock = stubEditorFetch()
  fetchMock.mockImplementation(async () =>
    jsonResponse({ post: null, mediaAssets: [] }),
  )

  renderEditor()

  expect(
    await screen.findByText('Post not found.', {}, { timeout: 10_000 }),
  ).toBeTruthy()
})
