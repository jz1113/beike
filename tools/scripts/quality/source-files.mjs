/** Shared inventory helpers. Never follow links into dependencies or local data. */
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const ignored = new Set([
  '.git', 'node_modules', 'dist', 'build', 'target', '.local', '.agents', '.cursor',
  '.azhuo_storage', 'backups', 'database-backups', 'coverage', 'playwright-report', 'test-results',
]);
export function walkSourceFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    if (entry.isSymbolicLink() || ignored.has(entry.name)) return [];
    const absolute = path.join(directory, entry.name);
    return entry.isDirectory() ? walkSourceFiles(absolute) : [absolute];
  }).sort();
}
export const isTestFile = file => /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(file);

/** Static imports, re-exports, import types, literal dynamic imports and require. */
export function moduleReferences(source) {
  const refs = [];
  function add(node) {
    if (node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))) refs.push(node.text);
  }
  function visit(node) {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) add(node.moduleSpecifier);
    if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) add(node.argument.literal);
    if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword
      || (ts.isIdentifier(node.expression) && node.expression.text === 'require'))) add(node.arguments[0]);
    ts.forEachChild(node, visit);
  }
  visit(source);
  return [...new Set(refs)];
}
