import path from 'node:path'
import ts from 'typescript'
import { DEFAULT_IGNORE } from '../config'

export const MAX_FILE_LINES = 400
export const MAX_FUNCTION_LINES = 80
export const MAX_NESTING = 4

/** Globs whose files are not code; `checkSource` short-circuits on them. */
export const IGNORE_GLOBS = DEFAULT_IGNORE

export type Violation = {
  rule:
    | 'file-length'
    | 'function-length'
    | 'nesting'
    | 'untagged-test'
    | 'unexplained-ignore'
    | 'route-reexport'
    | 'missing-suspense'
  file: string
  line: number
  message: string
}

const FUNCTION_KINDS = new Set<ts.SyntaxKind>([
  ts.SyntaxKind.FunctionDeclaration,
  ts.SyntaxKind.FunctionExpression,
  ts.SyntaxKind.ArrowFunction,
  ts.SyntaxKind.MethodDeclaration,
  ts.SyntaxKind.Constructor,
  ts.SyntaxKind.GetAccessor,
  ts.SyntaxKind.SetAccessor,
])

const CONTROL_FLOW = new Set<ts.SyntaxKind>([
  ts.SyntaxKind.IfStatement,
  ts.SyntaxKind.ForStatement,
  ts.SyntaxKind.ForInStatement,
  ts.SyntaxKind.ForOfStatement,
  ts.SyntaxKind.WhileStatement,
  ts.SyntaxKind.DoStatement,
  ts.SyntaxKind.SwitchStatement,
  ts.SyntaxKind.TryStatement,
  ts.SyntaxKind.ConditionalExpression,
])

/**
 * True when a repo-relative path matches any glob. A glob without a slash
 * (e.g. `*.generated.ts`) also matches the basename so it applies at any depth.
 */
export function isIgnored(
  relPath: string,
  globs: string[] = IGNORE_GLOBS,
): boolean {
  const base = path.basename(relPath)
  return globs.some(
    (glob) => path.matchesGlob(relPath, glob) || path.matchesGlob(base, glob),
  )
}

/** Deepest control-flow nesting in a node, not descending into nested functions. */
function maxNesting(node: ts.Node, depth = 0): number {
  let max = depth
  node.forEachChild((child) => {
    if (FUNCTION_KINDS.has(child.kind)) return
    const next = CONTROL_FLOW.has(child.kind) ? depth + 1 : depth
    max = Math.max(max, next, maxNesting(child, next))
  })
  return max
}

const lineOf = (sourceFile: ts.SourceFile, pos: number): number =>
  sourceFile.getLineAndCharacterOfPosition(pos).line + 1

function collectFunctions(
  node: ts.Node,
  sourceFile: ts.SourceFile,
  filePath: string,
  out: Violation[],
): void {
  if (FUNCTION_KINDS.has(node.kind)) {
    const line = lineOf(sourceFile, node.getStart(sourceFile))
    const length = lineOf(sourceFile, node.getEnd()) - line + 1
    if (length > MAX_FUNCTION_LINES) {
      out.push({
        rule: 'function-length',
        file: filePath,
        line,
        message: `function is ${length} lines (max ${MAX_FUNCTION_LINES})`,
      })
    }
    const depth = maxNesting(node)
    if (depth > MAX_NESTING) {
      out.push({
        rule: 'nesting',
        file: filePath,
        line,
        message: `nesting depth ${depth} (max ${MAX_NESTING})`,
      })
    }
  }
  node.forEachChild((child) =>
    collectFunctions(child, sourceFile, filePath, out),
  )
}

/** Size and nesting violations for one source file. Pure; no I/O. */
export function checkSource(input: {
  filePath: string
  source: string
  /** Overrides MAX_FILE_LINES for files that legitimately hold more. */
  maxFileLines?: number
}): Violation[] {
  const { filePath, source } = input
  if (isIgnored(filePath)) return []

  const maxFileLines = input.maxFileLines ?? MAX_FILE_LINES
  const violations: Violation[] = []
  const lines = source.replace(/\n$/, '').split('\n').length
  if (lines > maxFileLines) {
    violations.push({
      rule: 'file-length',
      file: filePath,
      line: 1,
      message: `file is ${lines} lines (max ${maxFileLines})`,
    })
  }

  const scriptKind = /\.(tsx|jsx)$/.test(filePath)
    ? ts.ScriptKind.TSX
    : ts.ScriptKind.TS
  const sourceFile = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    false,
    scriptKind,
  )
  collectFunctions(sourceFile, sourceFile, filePath, violations)
  return violations
}

/** A named declaration the review layer treats as one symbol. */
export type RawSymbol = {
  name: string
  kind: string
  start: number
  end: number
  text: string
}

/** A symbol's name usually tells us what it is. */
function kindOf(name: string): string {
  if (/^use[A-Z]/.test(name)) return 'hook'
  return /^[A-Z]/.test(name) ? 'component' : 'function'
}

function record(
  out: RawSymbol[],
  sourceFile: ts.SourceFile,
  owner: ts.Node,
  name: string,
  kind: string,
): void {
  out.push({
    name,
    kind,
    start: lineOf(sourceFile, owner.getStart(sourceFile)),
    end: lineOf(sourceFile, owner.getEnd()),
    text: owner.getText(sourceFile),
  })
}

/** Walk named declarations; nested callbacks stay inside the symbol that owns them. */
function visit(
  node: ts.Node,
  sourceFile: ts.SourceFile,
  out: RawSymbol[],
): void {
  if (ts.isFunctionDeclaration(node) && node.name) {
    record(out, sourceFile, node, node.name.text, kindOf(node.name.text))
    return
  }
  if (ts.isMethodDeclaration(node) && ts.isIdentifier(node.name)) {
    record(out, sourceFile, node, node.name.text, 'method')
    return
  }
  if (
    ts.isVariableDeclaration(node) &&
    ts.isIdentifier(node.name) &&
    node.initializer &&
    (ts.isArrowFunction(node.initializer) ||
      ts.isFunctionExpression(node.initializer))
  ) {
    record(
      out,
      sourceFile,
      node.parent.parent,
      node.name.text,
      kindOf(node.name.text),
    )
    return
  }
  node.forEachChild((child) => visit(child, sourceFile, out))
}

/**
 * Named function-like declarations in one source file. The same walk as
 * `checkSource`, narrowed to symbols rather than size violations.
 */
export function symbolsIn(source: string, filePath: string): RawSymbol[] {
  const scriptKind = /\.(tsx|jsx)$/.test(filePath)
    ? ts.ScriptKind.TSX
    : ts.ScriptKind.TS
  const sourceFile = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    scriptKind,
  )
  const out: RawSymbol[] = []
  visit(sourceFile, sourceFile, out)
  return out
}

const TEST_CALLEES = new Set(['test', 'it'])
// `test.each` and `test.todo` take a table or a name, not a test body, so they
// are not checked; the modifier forms that do take a body are.
const NON_BODY_MODIFIERS = new Set(['each', 'todo'])
// Coverage ignore comments, which must carry a reason after `--`.
const IGNORE_COMMENT = /\*\s*(?:v8|c8|istanbul)\s+ignore\b[\s\S]*?\*\//g

/**
 * Test calls carrying no `unit`/`integration` tag, so the tag that sets the
 * integration timeout can never be forgotten. Pure; no I/O.
 */
export function checkTestTags(input: {
  filePath: string
  source: string
}): Violation[] {
  const { filePath, source } = input
  const sourceFile = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    /\.(tsx|jsx)$/.test(filePath) ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )
  const violations: Violation[] = []
  const walk = (node: ts.Node): void => {
    // shortcut: `test.each(...)` returns a callable, so its inner call is not
    // matched; add it when a suite adopts that form.
    if (ts.isCallExpression(node) && isTestCall(node)) {
      const tagged = node.arguments.some(
        (argument) =>
          ts.isObjectLiteralExpression(argument) &&
          argument.properties.some(
            (property) => property.name?.getText() === 'tags',
          ),
      )
      if (!tagged) {
        violations.push({
          rule: 'untagged-test',
          file: filePath,
          line: lineOf(sourceFile, node.getStart(sourceFile)),
          message: 'test carries no unit/integration tag',
        })
      }
    }
    node.forEachChild(walk)
  }
  walk(sourceFile)
  return violations
}

/** Coverage ignore comments with no reason after `--`. Pure; no I/O. */
export function checkIgnoreReasons(input: {
  filePath: string
  source: string
}): Violation[] {
  const violations: Violation[] = []
  for (const [comment] of input.source.matchAll(IGNORE_COMMENT)) {
    if (comment.includes('--')) continue
    violations.push({
      rule: 'unexplained-ignore',
      file: input.filePath,
      line: input.source.slice(0, input.source.indexOf(comment)).split('\n')
        .length,
      message:
        'coverage ignore needs a reason, as `/* v8 ignore next -- why */`',
    })
  }
  return violations
}

function isTestCall(node: ts.CallExpression): boolean {
  const callee = node.expression
  if (ts.isIdentifier(callee)) return TEST_CALLEES.has(callee.text)
  // A modifier form such as `test.skip(...)`, but never a same-named method on
  // another object (`regex.test(...)`).
  return (
    ts.isPropertyAccessExpression(callee) &&
    ts.isIdentifier(callee.expression) &&
    TEST_CALLEES.has(callee.expression.text) &&
    !NON_BODY_MODIFIERS.has(callee.name.text)
  )
}

/**
 * A file that lazily imports a `*.client` module must render it behind a
 * Suspense boundary. Pure; no I/O.
 */
export function checkClientSuspense(input: {
  filePath: string
  source: string
}): Violation[] {
  const sourceFile = ts.createSourceFile(
    input.filePath,
    input.source,
    ts.ScriptTarget.Latest,
    true,
    /\.(tsx|jsx)$/.test(input.filePath) ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )
  let lazyClient = false
  let boundary = false
  const walk = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword
    ) {
      const [specifier] = node.arguments
      if (
        specifier !== undefined &&
        ts.isStringLiteral(specifier) &&
        specifier.text.includes('.client')
      ) {
        lazyClient = true
      }
    }
    if (
      ts.isJsxOpeningElement(node) &&
      node.tagName.getText(sourceFile).endsWith('Suspense')
    ) {
      boundary = true
    }
    node.forEachChild(walk)
  }
  walk(sourceFile)
  if (!lazyClient || boundary) return []
  return [
    {
      rule: 'missing-suspense',
      file: input.filePath,
      line: 1,
      message:
        'a lazily imported *.client module needs a Suspense boundary here',
    },
  ]
}
