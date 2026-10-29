import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FileAnalyzer } from '../src/services/parser/fileAnalyzer.js';
import { ImportResolver } from '../src/services/resolver/importResolver.js';
import { PythonResolver } from '../src/services/resolver/pythonResolver.js';

// Fuzzing: feed the analyzer text that is broken, odd or huge. Whatever the input, it must never
// throw and must return a well-formed result, because one bad file must never fail a repository.
// A seeded generator keeps failures reproducible.
const analyzer = new FileAnalyzer();

function rng(seed) {
    let s = seed >>> 0;
    return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32;
}

function assertWellFormed(result, label) {
    expect(result.ok, `${label}: ${result.error}`).toBe(true);
    const a = result.analysis;
    expect(Number.isInteger(a.tokens) && a.tokens >= 0, label).toBe(true);
    expect(a.complexity, label).toBeGreaterThanOrEqual(1);
    expect(a.commentLines, label).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(a.imports) && Array.isArray(a.calls), label).toBe(true);
    for (const fn of a.functions) {
        expect(fn.line, label).toBeGreaterThanOrEqual(1);
        expect(fn.endLine, label).toBeGreaterThanOrEqual(fn.line);
        expect(fn.complexity, label).toBeGreaterThanOrEqual(1);
    }
    for (const imp of a.imports) expect(Number.isInteger(imp.line), label).toBe(true);
}

const analyze = (path, content) => analyzer.safeAnalyze({ path, content });

const SOURCES = {
    'a.js': readFileSync(
        new URL('../src/services/sourceAnalysisService.js', import.meta.url),
        'utf8'
    ),
    'b.ts': "import type { T } from './t';\nexport class A<T> { m(x: T): T { return x ? f(x) : x; } }\nfunction f<T>(x: T) { return x; }\n".repeat(
        20
    ),
    'c.py': readFileSync(new URL('./python.test.js', import.meta.url), 'utf8').includes('import')
        ? 'import os\nfrom . import x\nclass A:\n    def f(self, n):\n        return [i for i in n if i and self.g()]\n'.repeat(
              30
          )
        : '',
};

describe('analyzer robustness', () => {
    it('survives a source file cut off at every kind of position', () => {
        const r = rng(1);
        for (const [path, text] of Object.entries(SOURCES)) {
            for (let i = 0; i < 60; i += 1) {
                const cut = Math.floor(r() * text.length);
                assertWellFormed(analyze(path, text.slice(0, cut)), `${path} cut at ${cut}`);
            }
        }
    });

    it('survives random character damage', () => {
        const r = rng(2);
        const noise = '{}()[];,.=<>!&|"\'`\\/*#:@\n\t ';
        for (const [path, text] of Object.entries(SOURCES)) {
            for (let i = 0; i < 40; i += 1) {
                const chars = [...text];
                for (let k = 0; k < 20; k += 1) {
                    chars[Math.floor(r() * chars.length)] = noise[Math.floor(r() * noise.length)];
                }
                assertWellFormed(analyze(path, chars.join('')), `${path} damaged #${i}`);
            }
        }
    });

    it('survives pure garbage, control characters and binary-looking text', () => {
        const r = rng(3);
        for (const path of ['x.js', 'x.ts', 'x.tsx', 'x.py']) {
            for (let i = 0; i < 20; i += 1) {
                const text = Array.from({ length: 200 }, () =>
                    String.fromCharCode(Math.floor(r() * 256))
                ).join('');
                assertWellFormed(analyze(path, text), `${path} garbage #${i}`);
            }
            assertWellFormed(analyze(path, '\u0000\u0001\uFFFD\uD83D\uDE00'), `${path} odd chars`);
            assertWellFormed(analyze(path, ''), `${path} empty`);
            assertWellFormed(analyze(path, '\n'.repeat(5000)), `${path} blank lines`);
        }
    });

    it('survives very deep nesting without a stack overflow', () => {
        const depth = 3000;
        assertWellFormed(
            analyze('deep.js', `${'('.repeat(depth)}1${')'.repeat(depth)};`),
            'js parens'
        );
        assertWellFormed(
            analyze('deep.js', `${'['.repeat(depth)}${']'.repeat(depth)};`),
            'js arrays'
        );
        assertWellFormed(
            analyze('deep.js', 'x = ' + 'a.b.'.repeat(depth) + 'c;'),
            'js member chain'
        );
        assertWellFormed(
            analyze('deep.py', `x = ${'['.repeat(100)}${']'.repeat(100)}\n`),
            'py lists'
        );
        assertWellFormed(
            analyze(
                'deep.ts',
                'type T = ' + 'Array<'.repeat(200) + 'number' + '>'.repeat(200) + ';'
            ),
            'ts generics'
        );
    });

    it('handles a very long single line and a very large file', () => {
        assertWellFormed(analyze('long.js', `const x = [${'1,'.repeat(200_000)}];`), 'long line');
        const many = Array.from(
            { length: 10_000 },
            (_, i) => `export function f${i}(a) { return a ? g${i}(a) : 0; }`
        );
        const result = analyze('big.js', many.join('\n'));
        assertWellFormed(result, 'big file');
        expect(result.analysis.functions).toHaveLength(10_000);
        expect(result.analysis.calls.length).toBeLessThanOrEqual(4000); // the per-file cap
    });

    it('keeps unicode, CRLF line endings and tabs consistent', () => {
        const lf = analyze(
            'u.js',
            "import a from './a';\n// café ☕\nexport const x = () => a();\n"
        );
        const crlf = analyze(
            'u.js',
            "import a from './a';\r\n// café ☕\r\nexport const x = () => a();\r\n"
        );
        assertWellFormed(lf, 'lf');
        expect(crlf.analysis.imports).toEqual(lf.analysis.imports);
        expect(crlf.analysis.functions.map((f) => f.line)).toEqual(
            lf.analysis.functions.map((f) => f.line)
        );
    });
});

describe('resolver robustness', () => {
    const files = new Set(['src/a.js', 'src/b/index.ts', 'app/__init__.py', 'app/m.py']);
    const js = new ImportResolver({ filePaths: files, aliases: { baseDir: '.', rules: [] } });
    const py = new PythonResolver({ filePaths: files });

    it('never throws on strange import specifiers', () => {
        const odd = [
            '',
            '.',
            '..',
            '../../../..',
            './',
            '/',
            '//',
            'a b',
            './\u0000',
            '../'.repeat(100),
            'x'.repeat(5000),
            '@',
            '@/',
            '~',
            '#',
            'node:fs',
            'http://x',
            'data:text/js,1',
            './a.js?x=1',
            './a.js#h',
            '\\\\win\\path',
            './%2e%2e/a',
        ];
        for (const spec of odd) {
            const out = js.resolve('src/a.js', spec);
            expect(['internal', 'external', 'unresolved', 'asset'], spec).toContain(out.kind);
        }
    });

    it('never throws on strange Python imports, and never points outside the repository', () => {
        const odd = [
            '',
            '.',
            '..',
            '...',
            '....................',
            'a..b',
            '.a.',
            'app.',
            '.app.m',
            'x'.repeat(5000),
        ];
        for (const specifier of odd) {
            for (const names of [[], ['*'], ['m', ''], ['__init__']]) {
                for (const from of ['app/m.py', 'app/__init__.py', 'top.py']) {
                    const out = py.resolve(from, { specifier, names });
                    expect(Array.isArray(out) && out.length > 0, `${from} ${specifier}`).toBe(true);
                    for (const r of out)
                        if (r.kind === 'internal') expect(files.has(r.target)).toBe(true);
                }
            }
        }
    });
});
