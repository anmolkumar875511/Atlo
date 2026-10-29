import { describe, expect, it } from 'vitest';
import { ScanExtractor } from '../src/services/parser/scanExtractor.js';
import { TreeSitterParser, grammarFor } from '../src/services/parser/treeSitterParser.js';

const parser = new TreeSitterParser();
const extractor = new ScanExtractor({ parser });
const run = (code, grammar) => extractor.scan(parser.parse(code, grammar), grammar);

const specifiers = (code, grammar = 'javascript') =>
    run(code, grammar).imports.map((i) => `${i.kind}:${i.specifier}`);

describe('grammarFor', () => {
    it('picks the grammar from the extension', () => {
        expect(grammarFor('a.js')).toBe('javascript');
        expect(grammarFor('a.jsx')).toBe('javascript');
        expect(grammarFor('a.mjs')).toBe('javascript');
        expect(grammarFor('a.ts')).toBe('typescript');
        expect(grammarFor('a.mts')).toBe('typescript');
        expect(grammarFor('a.tsx')).toBe('tsx');
    });
});

describe('ScanExtractor imports (JavaScript)', () => {
    it('reads every static import form', () => {
        const code = `
      import a from './a';
      import { b } from "./b";
      import * as c from './c';
      import './side-effect';
    `;
        expect(specifiers(code)).toEqual([
            'import:./a',
            'import:./b',
            'import:./c',
            'import:./side-effect',
        ]);
    });

    it('reads export-from but ignores plain exports', () => {
        const code = `export * from './x'; export { y } from './y'; export const z = 1; export default 'str';`;
        expect(specifiers(code)).toEqual(['export-from:./x', 'export-from:./y']);
    });

    it('reads require and dynamic import with a string argument', () => {
        const code = `const a = require('a'); const b = await import('./b'); require.resolve('nope');`;
        expect(specifiers(code)).toEqual(['require:a', 'dynamic-import:./b']);
    });

    it('reports computed imports as dynamic (null specifier) instead of guessing', () => {
        const imports = run(`require(name); import(path + '.js');`, 'javascript').imports;
        expect(imports.map((i) => i.specifier)).toEqual([null, null]);
    });

    it('accepts template literals only when they have no substitutions', () => {
        expect(specifiers('require(`plain`); require(`a${b}`);')).toEqual([
            'require:plain',
            'require:null',
        ]);
    });

    it('is not fooled by imports inside comments or strings', () => {
        const code = `
      // import fake from './comment';
      /* const x = require('./block-comment'); */
      const s = "import y from './string'";
      const t = \`require('./template')\`;
      import real from './real';
    `;
        expect(specifiers(code)).toEqual(['import:./real']);
    });

    it('records the line number', () => {
        const imports = run('\n\nimport a from "./a";', 'javascript').imports;
        expect(imports[0].line).toBe(3);
    });

    it('parses JSX', () => {
        const code = `import App from './App'; export default () => <App />;`;
        expect(specifiers(code)).toEqual(['import:./App']);
    });
});

describe('ImportExtractor (TypeScript)', () => {
    it('reads type imports, import-equals and re-exported types', () => {
        const code = `
      import type { T } from './types';
      import fs = require('fs');
      export type { U } from './u';
    `;
        expect(specifiers(code, 'typescript')).toEqual([
            'import:./types',
            'import-equals:fs',
            'export-from:./u',
        ]);
    });

    it('parses TSX', () => {
        const code = `import { Button } from './Button'; const x = <Button<string> />;`;
        expect(specifiers(code, 'tsx')).toEqual(['import:./Button']);
    });
});

describe('error tolerance', () => {
    it('still returns imports from a file with a syntax error, and flags it', () => {
        const { imports, hadErrors } = run(`import a from './a';\nconst = = ;`, 'javascript');
        expect(imports.map((i) => i.specifier)).toEqual(['./a']);
        expect(hadErrors).toBe(true);
    });

    it('reports no error for valid code and handles empty input', () => {
        expect(run('const a = 1;', 'javascript').hadErrors).toBe(false);
        expect(run('', 'javascript').imports).toEqual([]);
    });
});
