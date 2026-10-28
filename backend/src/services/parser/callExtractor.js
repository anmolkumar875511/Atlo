// Finds call sites. `member` is true for `obj.method()` and false for a plain `fn()`, because the
// linker matches them differently (a plain call cannot reach a class method).
const SCRIPT_CALLS = `
  (call_expression function: (identifier) @plain)
  (call_expression function: (member_expression property: (property_identifier) @member))
  (new_expression constructor: (identifier) @plain)
`;

const PYTHON_CALLS = `
  (call function: (identifier) @plain)
  (call function: (attribute attribute: (identifier) @member))
`;

// `require('x')` is an import, not a call worth linking.
const SKIPPED = new Set(['require']);
const MAX_CALLS_PER_FILE = 4000;

// Which named function contains a line? The smallest range wins, so a nested function is
// preferred over its parent. Returns null for module-level code.
function callerAt(functions, line) {
  let best = null;
  for (const fn of functions) {
    if (fn.line <= line && line <= fn.endLine) {
      if (!best || fn.endLine - fn.line < best.endLine - best.line) best = fn;
    }
  }
  return best ? best.name : null;
}

// Collects "who calls what" for one file in a single query pass over the syntax tree.
// This is name based and has no type information, so it is an approximation (see README).
export class CallExtractor {
  constructor({ parser }) {
    this.parser = parser;
  }

  extract(tree, grammar, functions) {
    const source = grammar === 'python' ? PYTHON_CALLS : SCRIPT_CALLS;
    const query = this.parser.query(grammar, source);
    const seen = new Set();
    const calls = [];

    for (const capture of query.captures(tree.rootNode)) {
      const name = capture.node.text;
      if (SKIPPED.has(name)) continue;
      const member = capture.name === 'member';
      const line = capture.node.startPosition.row + 1;
      const caller = callerAt(functions, line);

      // One entry per (caller, callee) is enough to draw the graph; the first line is kept.
      const key = `${caller}\0${name}\0${member}`;
      if (seen.has(key)) continue;
      seen.add(key);
      calls.push({ name, line, caller, member });
      if (calls.length >= MAX_CALLS_PER_FILE) break;
    }
    return calls;
  }
}
