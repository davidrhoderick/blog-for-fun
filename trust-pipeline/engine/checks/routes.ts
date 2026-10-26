import ts from 'typescript'
import type { Violation } from './ast'

const ROUTE_EXPORTS = new Set(['loader', 'action', 'meta', 'handle', 'default'])

/**
 * A route module must define the values React Router reads rather than re-export
 * or alias them from somewhere else, so opening the route file shows what the
 * page does. Pure; no I/O.
 */
export function checkRouteExports(input: {
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
  const violations: Violation[] = []
  const walk = (node: ts.Node): void => {
    const alias = aliasedRouteExport(node)
    if (alias !== undefined) {
      violations.push({
        rule: 'route-reexport',
        file: input.filePath,
        line:
          sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile))
            .line + 1,
        message: `route ${alias} must be defined here, not aliased`,
      })
    }
    node.forEachChild(walk)
  }
  walk(sourceFile)
  return violations
}

/**
 * The route value this node takes from a bare name instead of defining, if any.
 * `export { loader } from './x'`, `export default imported`, and
 * `export const loader = somethingElse` all hide the page behind another file.
 */
function aliasedRouteExport(node: ts.Node): string | undefined {
  if (ts.isExportDeclaration(node) && node.exportClause) {
    const clause = node.exportClause
    if (!ts.isNamedExports(clause)) return undefined
    const name = clause.elements.find((element) =>
      ROUTE_EXPORTS.has(element.name.text),
    )
    return name?.name.text
  }
  if (ts.isExportAssignment(node) && ts.isIdentifier(node.expression))
    return 'default'
  if (!ts.isVariableStatement(node)) return undefined
  const exported = ts
    .getModifiers(node)
    ?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)
  if (!exported) return undefined
  const alias = node.declarationList.declarations.find(
    (declaration) =>
      ROUTE_EXPORTS.has(declaration.name.getText()) &&
      declaration.initializer !== undefined &&
      ts.isIdentifier(declaration.initializer),
  )
  return alias?.name.getText()
}
