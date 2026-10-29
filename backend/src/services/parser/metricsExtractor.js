// What counts as a function, a class or a decision point, per language family.
// The walk below is the same for every language; only these profiles differ.
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
    docstrings: false,
    isMethod: (node) => node.type === 'method_definition',
};

// Python: `and` / `or` are a node (boolean_operator), not a token. Comprehension clauses count
// like their loop and `if`, the way radon (the usual Python tool) counts them.
const PYTHON_PROFILE = {
    functions: new Set(['function_definition', 'lambda']),
    classes: new Set(['class_definition']),
    decisions: new Set([
        'if_statement',
        'elif_clause',
        'for_statement',
        'while_statement',
        'except_clause',
        'except_group_clause',
        'case_clause',
        'conditional_expression',
        'boolean_operator',
        'for_in_clause',
        'if_clause',
    ]),
    logicalTokens: new Set(),
    commentType: 'comment',
    // A string on its own line (a docstring) is documentation, so it counts as comment lines.
    docstrings: true,
    // A method sits directly in a class body, possibly under a decorator.
    isMethod: (node) => {
        let parent = node.parent;
        if (parent?.type === 'decorated_definition') parent = parent.parent;
        return node.type === 'function_definition' && parent?.parent?.type === 'class_definition';
    },
};

const PROFILES = {
    javascript: SCRIPT_PROFILE,
    typescript: SCRIPT_PROFILE,
    tsx: SCRIPT_PROFILE,
    python: PYTHON_PROFILE,
};

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
        case 'assignment': // Python: `handler = lambda x: x`
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

function kindOf(type, isMethod) {
    if (isMethod) return 'method';
    if (type === 'arrow_function' || type === 'lambda') return 'arrow';
    return 'function';
}

// One pass over the syntax tree gives tokens, per-function complexity and the list of named
// functions and classes. A cursor is used instead of recursion so deep trees cannot overflow
// the stack, and nodes are only materialised for the few that need a name.
//
// Complexity follows McCabe: a function starts at 1 and gains 1 for each decision point
// (if, else if, for, while, do, case, catch, ?:, &&, ||, ??; in Python also elif, except, and, or,
// comprehension clauses). A nested function is counted on its own, not inside its parent.
// A file's complexity is 1 + every decision point in it. `commentLines` counts lines that are
// comments or docstrings, which the onboarding score uses as a documentation signal.
// What the walk needs to know about a node type, worked out once per type id.
const NODE = { OTHER: 0, FUNCTION: 1, CLASS: 2, DECISION: 3, DOC_STATEMENT: 4 };
const LEAF = { TOKEN: 0, COMMENT: 1, LOGICAL: 2 };

function classify(cursor, profile) {
    const type = cursor.nodeType;
    const named = cursor.nodeIsNamed;
    let node = NODE.OTHER;
    if (named && profile.functions.has(type)) node = NODE.FUNCTION;
    else if (named && profile.classes.has(type)) node = NODE.CLASS;
    else if (profile.decisions.has(type)) node = NODE.DECISION;
    else if (profile.docstrings && type === 'expression_statement') node = NODE.DOC_STATEMENT;

    let leaf = LEAF.TOKEN;
    if (type === profile.commentType) leaf = LEAF.COMMENT;
    else if (profile.logicalTokens.has(type)) leaf = LEAF.LOGICAL;
    return { type, node, leaf };
}

export class MetricsExtractor {
    constructor() {
        // grammar -> array indexed by node type id. Asking the cursor for the numeric id is much
        // cheaper than asking for the type's name and "named" flag on every one of a million nodes.
        this.typeInfo = new Map();
    }

    extract(tree, grammar) {
        const profile = PROFILES[grammar];
        if (!profile) throw new Error(`No metrics profile for grammar: ${grammar}`);

        if (!this.typeInfo.has(grammar)) this.typeInfo.set(grammar, []);
        const infoById = this.typeInfo.get(grammar);

        const cursor = tree.walk();
        const functions = [];
        const classes = [];
        const frames = []; // functions we are currently inside, innermost last
        const classNames = [];
        const markers = []; // one per open ancestor: 'function', 'class' or null
        let tokens = 0;
        let decisions = 0;
        let commentLines = 0;

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
                    classes.push({
                        name: entry.name,
                        line: entry.line,
                        endLine: cursor.endPosition.row + 1,
                    });
                }
            }
        };

        let finished = false;
        while (!finished) {
            const id = cursor.nodeTypeId;
            const info = infoById[id] ?? (infoById[id] = classify(cursor, profile));
            const type = info.type;
            let marker = null;

            if (info.node === NODE.FUNCTION) {
                const node = cursor.currentNode;
                let name = nameOf(node);
                const isMethod = profile.isMethod(node);
                if (name && isMethod && classNames.length > 0) {
                    const owner = classNames[classNames.length - 1].name;
                    if (owner) name = `${owner}.${name}`;
                }
                frames.push({
                    name: name ? clean(name) : null,
                    kind: kindOf(type, isMethod),
                    line: cursor.startPosition.row + 1,
                    complexity: 1,
                });
                marker = 'function';
            } else if (info.node === NODE.CLASS) {
                const name = nameOf(cursor.currentNode);
                classNames.push({
                    name: name ? clean(name) : null,
                    line: cursor.startPosition.row + 1,
                });
                marker = 'class';
            } else if (info.node === NODE.DECISION) {
                addDecision();
            } else if (info.node === NODE.DOC_STATEMENT) {
                const node = cursor.currentNode;
                if (node.namedChildCount === 1 && node.namedChild(0).type === 'string') {
                    commentLines += cursor.endPosition.row - cursor.startPosition.row + 1;
                }
            }

            if (cursor.gotoFirstChild()) {
                markers.push(marker);
                continue;
            }

            // A leaf is one token. Comments are not code, so they are not counted.
            // The root of an empty file is also a leaf, but it is not a token. `markers` has one entry
            // per open ancestor, so it is empty only at the root. (cursor.currentDepth would also work
            // but walks the whole cursor stack on every call.)
            if (info.leaf === LEAF.COMMENT) {
                commentLines += cursor.endPosition.row - cursor.startPosition.row + 1;
            } else if (markers.length > 0) {
                tokens += 1;
            }
            if (info.leaf === LEAF.LOGICAL) addDecision();
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
        return { tokens, complexity: 1 + decisions, commentLines, functions, classes };
    }
}
