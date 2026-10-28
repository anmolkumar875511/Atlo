// Every pattern captures the import node under a name that says what kind it is, and the
// module string as @src.
const COMMON_QUERY = `
  (import_statement source: (string) @src) @import
  (export_statement source: (string) @src) @export_from
  (call_expression
    function: (identifier) @fn
    arguments: (arguments . (_) @src)
    (#eq? @fn "require")) @require
  (call_expression
    function: (import)
    arguments: (arguments . (_) @src)) @dynamic_import
`;

// `import x = require('y')` exists only in the TypeScript grammars.
const TS_ONLY_QUERY = `(import_require_clause (string) @src) @import_equals`;

const KINDS = new Set(['import', 'export_from', 'import_equals', 'require', 'dynamic_import']);

function querySourceFor(grammar) {
  return grammar === 'javascript' ? COMMON_QUERY : COMMON_QUERY + TS_ONLY_QUERY;
}

// Reads a string literal. Returns null for anything computed (variables, concatenation),
// which the pipeline reports as an unresolvable "dynamic" import instead of guessing.
function stringValue(node) {
  if (node.type === 'string') return node.text.slice(1, -1) || null;
  if (
    node.type === 'template_string' &&
    !node.namedChildren.some((c) => c.type === 'template_substitution')
  ) {
    return node.text.slice(1, -1) || null;
  }
  return null;
}

function readMatch(match) {
  const found = match.captures.find((c) => KINDS.has(c.name));
  const src = match.captures.find((c) => c.name === 'src').node;
  return {
    kind: found.name.replace('_', '-'),
    line: found.node.startPosition.row + 1,
    specifier: stringValue(src),
  };
}

// Python: `import a.b as c, d` and `from ..x import y as z, w`. Relative imports keep their
// leading dots in `specifier` ("..x"). `names` lists what a from-import pulls in, because
// `from pkg import mod` can mean the submodule pkg/mod.py, which the resolver checks.
function readPythonImport(node) {
  const line = node.startPosition.row + 1;
  if (node.type === 'import_statement') {
    return node.namedChildren
      .map((child) => (child.type === 'aliased_import' ? child.childForFieldName('name') : child))
      .filter((child) => child?.type === 'dotted_name')
      .map((child) => ({ kind: 'import', line, specifier: child.text, names: [] }));
  }
  const module = node.childForFieldName('module_name');
  if (!module) return [];
  const names = node.namedChildren
    .slice(1)
    .map((child) => {
      if (child.type === 'wildcard_import') return '*';
      const target = child.type === 'aliased_import' ? child.childForFieldName('name') : child;
      return target?.text ?? null;
    })
    .filter(Boolean);
  return [{ kind: 'from', line, specifier: module.text, names }];
}

const PYTHON_QUERY = `
  (import_statement) @import
  (import_from_statement) @from
`;

function hasSyntaxError(root) {
  return typeof root.hasError === 'function' ? root.hasError() : Boolean(root.hasError);
}

// Finds every import in a file by walking the syntax tree, so imports that appear inside
// comments or strings are never counted (a regex cannot promise that).
export class ImportExtractor {
  constructor({ parser }) {
    this.parser = parser;
  }

  // Takes a tree that was already parsed, so each file is parsed only once.
  extract(tree, grammar) {
    if (grammar === 'python') return this.#extractPython(tree);
    const query = this.parser.query(grammar, querySourceFor(grammar));
    const imports = query.matches(tree.rootNode).map(readMatch);
    // Matches come grouped by pattern; restore the order they appear in the file.
    imports.sort((a, b) => a.line - b.line);
    return { imports, hadErrors: hasSyntaxError(tree.rootNode) };
  }

  #extractPython(tree) {
    const query = this.parser.query('python', PYTHON_QUERY);
    const imports = query
      .matches(tree.rootNode)
      .flatMap((match) => readPythonImport(match.captures[0].node));
    imports.sort((a, b) => a.line - b.line);
    return { imports, hadErrors: hasSyntaxError(tree.rootNode) };
  }
}
