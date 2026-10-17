import { expect, test } from 'vitest'
import { checkRouteExports } from './routes'

const routeFile = 'apps/admin/app/routes/x.tsx'

const check = (source: string) =>
  checkRouteExports({ filePath: routeFile, source })

test('accepts route values defined in the file', { tags: ['unit'] }, () => {
  const source = [
    "import { redirect } from 'react-router'",
    "export const meta = () => [{ title: 'x' }]",
    "export const handle = { pageTitle: 'x' }",
    'export async function loader() { return redirect("/") }',
    'export default function Page() { return null }',
    '',
  ].join('\n')

  expect(check(source)).toEqual([])
})

test('flags re-exporting loader from another module', {
  tags: ['unit'],
}, () => {
  const violations = check("export { loader } from './post.server'\n")

  expect(violations).toHaveLength(1)
  expect(violations[0]?.rule).toBe('route-reexport')
})

test('flags exporting an alias of an import', { tags: ['unit'] }, () => {
  const source = [
    "import { loadPosts } from './post.server'",
    'export const loader = loadPosts',
    '',
  ].join('\n')

  const violations = check(source)

  expect(violations).toHaveLength(1)
  expect(violations[0]?.rule).toBe('route-reexport')
})

test('flags a default export aliasing an import', { tags: ['unit'] }, () => {
  const source = ["import Page from './page'", 'export default Page', ''].join(
    '\n',
  )

  expect(check(source)[0]?.rule).toBe('route-reexport')
})

test('accepts route values defined inline', { tags: ['unit'] }, () => {
  const source = [
    "const title = 'Posts'",
    'const heading = () => title',
    'export const meta = () => [{ title }]',
    'export const loader = () => heading()',
    '',
  ].join('\n')

  expect(check(source)).toEqual([])
})

test('flags an alias even when its target is local', { tags: ['unit'] }, () => {
  const source = [
    "const title = 'Posts'",
    'const heading = () => title',
    'export const loader = heading',
    '',
  ].join('\n')

  expect(check(source)[0]?.rule).toBe('route-reexport')
})
