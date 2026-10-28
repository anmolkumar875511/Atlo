import Parser from 'tree-sitter';
import JavaScript from 'tree-sitter-javascript';
import Python from 'tree-sitter-python';
import TypeScript from 'tree-sitter-typescript';

// JSX is part of the javascript grammar; TSX needs its own grammar.
const LANGUAGES = {
    javascript: JavaScript,
    typescript: TypeScript.typescript,
    tsx: TypeScript.tsx,
    python: Python,
};

export function grammarFor(path) {
    if (/\.py$/i.test(path)) return 'python';
    if (/\.tsx$/i.test(path)) return 'tsx';
    if (/\.(ts|mts|cts)$/i.test(path)) return 'typescript';
    return 'javascript';
}

// Uses the native tree-sitter bindings: about 3x faster than the WASM build on a cold
// start, which matters because a request parses hundreds of files.
export class TreeSitterParser {
    constructor() {
        this.parsers = new Map();
        this.queries = new Map();
        for (const [name, language] of Object.entries(LANGUAGES)) {
            const parser = new Parser();
            parser.setLanguage(language);
            this.parsers.set(name, parser);
        }
    }

    parse(content, grammar) {
        const parser = this.parsers.get(grammar);
        if (!parser) throw new Error(`Unknown grammar: ${grammar}`);
        // The binding reads input through a fixed-size buffer; the default is too small for big files.
        return parser.parse(content, undefined, {
            bufferSize: Math.max(32 * 1024, content.length * 2),
        });
    }

    // Compiled once per grammar and reused. A query hands back only the nodes we ask for,
    // which is far cheaper than walking every node of a large file from JavaScript.
    query(grammar, source) {
        const key = `${grammar}:${source}`;
        if (!this.queries.has(key)) {
            this.queries.set(key, new Parser.Query(LANGUAGES[grammar], source));
        }
        return this.queries.get(key);
    }
}
