// What counts as a function, a class or a decision point, per language family.
// Python gets its own profile in a later phase; the walk below does not change.
const SCRIPT_PROFILE = {
  functions: new Set([
    'function_declaration',
    'function_expression',
    'generator_function',
    'generator_function_declaration',
    'arrow_function',
    'method_definition',
  ]),
  classes: new Set(['class_declaration', 'class', 'abstract_class_declaration']),
  // `else if` is an if_statement nested in an else clause, so it is counted by this too.
  decisions: new Set([
    'if_statement',
    'for_statement',
    'for_in_statement',
    'while_statement',
    'do_statement',
    'switch_case',
    'catch_clause',
    'ternary_expression',
  ]),
  // These are anonymous tokens. `&&=` and friends are different tokens, so they are not counted.
  logicalTokens: new Set(['&&', '||', '??']),
  commentType: 'comment',
};

const PROFILES = { javascript: SCRIPT_PROFILE, typescript: SCRIPT_PROFILE, tsx: SCRIPT_PROFILE };

const MAX_NAME_LENGTH = 80;

const clean = (text) =>
  text.length > MAX_NAME_LENGTH ? `${text.slice(0, MAX_NAME_LENGTH)}…` : text;

// `const f = () => {}` and `{ f: function () {} }` have no name of their own, so borrow it.
function nameFromParent(node) {
  const parent = node.parent;
  if (!parent) return null;
  switch (parent.type) {
    case 'variable_declarator': {
      const name = parent.childForFieldName('name');
      return name?.type === 'identifier' ? name.text : null;
    }
    case 'assignment_expression':
      return parent.childForFieldName('left')?.text ?? null;
    case 'pair':
      return parent.childForFieldName('key')?.text.replace(/^['"`]|['"`]$/g, '') ?? null;
    case 'public_field_definition':
    case 'field_definition':
      return parent.childForFieldName('name')?.text ?? null;
    default:
      return null;
  }
}

function nameOf(node) {
  const own = node.childForFieldName('name');
  return own ? own.text : nameFromParent(node);
}

function kindOf(type) {
  if (type === 'method_definition') return 'method';
  if (type === 'arrow_function') return 'arrow';
  return 'function';
}

// One pass over the syntax tree gives tokens, per-function complexity and the list of named
// functions and classes. A cursor is used instead of recursion so deep trees cannot overflow
// the stack, and nodes are only materialised for the few that need a name.
//
// Complexity follows McCabe: a function starts at 1 and gains 1 for each decision point
// (if, else if, for, while, do, case, catch, ?:, &&, ||, ??). A nested function is counted
// on its own, not inside its parent. A file's complexity is 1 + every decision point in it.
export class MetricsExtractor {
  extract(tree, grammar) {
    const profile = PROFILES[grammar];
    if (!profile) throw new Error(`No metrics profile for grammar: ${grammar}`);

    const cursor = tree.walk();
    const functions = [];
    const classes = [];
    const frames = []; // functions we are currently inside, innermost last
    const classNames = [];
    const markers = []; // one per open ancestor: 'function', 'class' or null
    let tokens = 0;
    let decisions = 0;

    const addDecision = () => {
      decisions += 1;
      if (frames.length > 0) frames[frames.length - 1].complexity += 1;
    };

    const closeMarker = (marker) => {
      if (marker === 'function') {
        const frame = frames.pop();
        if (frame.name) {
          functions.push({
            name: frame.name,
            kind: frame.kind,
            line: frame.line,
            endLine: cursor.endPosition.row + 1,
            complexity: frame.complexity,
          });
        }
      } else if (marker === 'class') {
        const entry = classNames.pop();
        if (entry.name) {
          classes.push({ name: entry.name, line: entry.line, endLine: cursor.endPosition.row + 1 });
        }
      }
    };

    let finished = false;
    while (!finished) {
      const type = cursor.nodeType;
      let marker = null;

      if (cursor.nodeIsNamed && profile.functions.has(type)) {
        const node = cursor.currentNode;
        let name = nameOf(node);
        if (name && type === 'method_definition' && classNames.length > 0) {
          const owner = classNames[classNames.length - 1].name;
          if (owner) name = `${owner}.${name}`;
        }
        frames.push({
          name: name ? clean(name) : null,
          kind: kindOf(type),
          line: cursor.startPosition.row + 1,
          complexity: 1,
        });
        marker = 'function';
      } else if (cursor.nodeIsNamed && profile.classes.has(type)) {
        const name = nameOf(cursor.currentNode);
        classNames.push({ name: name ? clean(name) : null, line: cursor.startPosition.row + 1 });
        marker = 'class';
      } else if (profile.decisions.has(type)) {
        addDecision();
      }

      if (cursor.gotoFirstChild()) {
        markers.push(marker);
        continue;
      }

      // A leaf is one token. Comments are not code, so they are not counted.
      // The root of an empty file is also a leaf, but it is not a token.
      if (type !== profile.commentType && markers.length > 0) tokens += 1;
      if (profile.logicalTokens.has(type)) addDecision();
      closeMarker(marker);

      while (!cursor.gotoNextSibling()) {
        if (!cursor.gotoParent()) {
          finished = true;
          break;
        }
        closeMarker(markers.pop());
      }
    }

    functions.sort((a, b) => a.line - b.line);
    classes.sort((a, b) => a.line - b.line);
    return { tokens, complexity: 1 + decisions, functions, classes };
  }
}
