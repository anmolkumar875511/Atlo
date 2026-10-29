// Finds imports AND call sites in one pass over the syntax tree.
//
// They used to be two separate queries, and every query walks the whole tree. On Vue core
// (528 files) one combined query costs about 0.6 s where the two cost about 1.2 s, so merging them
// is the cheapest speed-up available. There are no query predicates either (`#eq?` runs in
// JavaScript for every match): `require(...)` is spotted from the call's name instead.
//
// An import is `import`, `export ... from`, `require()`, `import()` and TypeScript
// `import x = require()`. A call is `f()`, `obj.f()` or `new F()`. Because it reads the syntax
// tree, text inside comments and strings is never counted.
const SCRIPT_CORE = `
  (import_statement source: (string) @src) @import
  (export_statement source: (string) @src) @export_from
  (call_expression
    function: (import)
    arguments: (arguments . (_) @src)) @dynamic_import
  (call_expression function: (identifier) @plain)
  (call_expression function: (member_expression property: (property_identifier) @member))
  (new_expression constructor: (identifier) @plain)
`;
// `import x = require('y')` exists only in the TypeScript grammars.
const TS_ONLY = `(import_require_clause (string) @src) @import_equals`;

const PYTHON = `
  (import_statement) @py_import
  (import_from_statement) @py_from
  (call function: (identifier) @plain)
  (call function: (attribute attribute: (identifier) @member))
`;

const IMPORT_KINDS = new Set(['import', 'export_from', 'import_equals', 'dynamic_import']);
const MAX_CALLS_PER_FILE = 4000;

const querySourceFor = (grammar) =>
    grammar === 'python' ? PYTHON : grammar === 'javascript' ? SCRIPT_CORE : SCRIPT_CORE + TS_ONLY;

// Reads a string literal. Returns null for anything computed (variables, concatenation), which
// the pipeline reports as an unresolvable "dynamic" import instead of guessing.
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

// Python: `import a.b as c, d` and `from ..x import y as z, w`. Relative imports keep their
// leading dots in `specifier` ("..x"). `names` lists what a from-import pulls in, because
// `from pkg import mod` can mean the submodule pkg/mod.py, which the resolver checks.
function readPythonImport(node) {
    const line = node.startPosition.row + 1;
    if (node.type === 'import_statement') {
        return node.namedChildren
            .map((child) =>
                child.type === 'aliased_import' ? child.childForFieldName('name') : child
            )
            .filter((child) => child?.type === 'dotted_name')
            .map((child) => ({ kind: 'import', line, specifier: child.text, names: [] }));
    }
    const module = node.childForFieldName('module_name');
    if (!module) return [];
    const names = node.namedChildren
        .slice(1)
        .map((child) => {
            if (child.type === 'wildcard_import') return '*';
            const target =
                child.type === 'aliased_import' ? child.childForFieldName('name') : child;
            return target?.text ?? null;
        })
        .filter(Boolean);
    return [{ kind: 'from', line, specifier: module.text, names }];
}

// Which named function contains a line? The innermost one wins (the smallest range). Returns null
// for module-level code.
//
// Looking through every function for every call is O(calls x functions): 3 seconds for one file
// with 20,000 functions. Calls arrive in file order, so one sweep is enough. Functions are sorted
// by start line and pushed on a stack as the sweep reaches them; those already finished are popped.
// Functions nest properly, so the top of the stack is always the innermost one still open.
// On a one-line tie (a function inside another on the same line) the one that closed first, i.e.
// the inner one, wins, exactly as before.
export function callerLookup(functions) {
    const sorted = functions
        .map((fn, order) => ({ fn, order }))
        .sort((a, b) => a.fn.line - b.fn.line || b.fn.endLine - a.fn.endLine || b.order - a.order)
        .map((entry) => entry.fn);
    const open = [];
    let next = 0;
    let lastLine = -Infinity;

    return (line) => {
        if (line < lastLine) {
            // Lines must not go backwards; start over rather than answer wrongly.
            open.length = 0;
            next = 0;
        }
        lastLine = line;
        while (next < sorted.length && sorted[next].line <= line) open.push(sorted[next++]);
        while (open.length > 0 && open[open.length - 1].endLine < line) open.pop();
        return open.length > 0 ? open[open.length - 1].name : null;
    };
}

function hasSyntaxError(root) {
    return typeof root.hasError === 'function' ? root.hasError() : Boolean(root.hasError);
}

export class ScanExtractor {
    constructor({ parser }) {
        this.parser = parser;
    }

    // Takes a tree that was already parsed, and the file's functions (for "who makes this call").
    scan(tree, grammar, functions = []) {
        const query = this.parser.query(grammar, querySourceFor(grammar));
        const imports = [];
        const rawCalls = [];

        for (const match of query.matches(tree.rootNode)) {
            const first = match.captures[0];
            const kind = first.name;

            if (kind === 'py_import' || kind === 'py_from') {
                imports.push(...readPythonImport(first.node));
            } else if (IMPORT_KINDS.has(kind)) {
                const src = match.captures.find((c) => c.name === 'src').node;
                imports.push({
                    kind: kind.replace('_', '-'),
                    line: first.node.startPosition.row + 1,
                    specifier: stringValue(src),
                });
            } else if (kind === 'plain' && first.node.text === 'require') {
                const call = first.node.parent;
                if (call?.type !== 'call_expression') continue; // `new require()` is not an import
                const arg = call.childForFieldName('arguments')?.namedChildren[0];
                if (arg) {
                    imports.push({
                        kind: 'require',
                        line: call.startPosition.row + 1,
                        specifier: stringValue(arg),
                    });
                }
            } else {
                rawCalls.push({
                    name: first.node.text,
                    line: first.node.startPosition.row + 1,
                    member: kind === 'member',
                    pos: first.node.startIndex,
                });
            }
        }

        // Matches come grouped by pattern; restore the order they appear in the file.
        imports.sort((a, b) => a.line - b.line);
        return {
            imports,
            calls: this.#dedupe(rawCalls, functions),
            hadErrors: hasSyntaxError(tree.rootNode),
        };
    }

    // One entry per (caller, callee) is enough to draw the graph; the first occurrence is kept.
    #dedupe(rawCalls, functions) {
        rawCalls.sort((a, b) => a.pos - b.pos);
        const callerAt = callerLookup(functions);
        const seen = new Set();
        const calls = [];
        for (const { name, line, member } of rawCalls) {
            const caller = callerAt(line);
            const key = `${caller}\0${name}\0${member}`;
            if (seen.has(key)) continue;
            seen.add(key);
            calls.push({ name, line, caller, member });
            if (calls.length >= MAX_CALLS_PER_FILE) break;
        }
        return calls;
    }
}
