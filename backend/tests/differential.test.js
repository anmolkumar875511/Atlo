import { describe, expect, it } from 'vitest';
import { MetricsExtractor } from '../src/services/parser/metricsExtractor.js';
import { ScanExtractor } from '../src/services/parser/scanExtractor.js';
import { grammarFor, TreeSitterParser } from '../src/services/parser/treeSitterParser.js';
import { CallExtractor } from './reference/callExtractor.js';
import { ImportExtractor } from './reference/importExtractor.js';

// The fast single-query extractor must give exactly what the original two-query extractors gave.
// The originals live in tests/reference/ as the "oracle". Any optimization that changes an
// answer fails here.
const parser = new TreeSitterParser();
const metrics = new MetricsExtractor();
const scan = new ScanExtractor({ parser });
const oldImports = new ImportExtractor({ parser });
const oldCalls = new CallExtractor({ parser });

function both(path, code) {
    const grammar = grammarFor(path);
    const tree = parser.parse(code, grammar);
    const { functions } = metrics.extract(tree, grammar);
    const fast = scan.scan(tree, grammar, functions);
    const ref = oldImports.extract(tree, grammar);
    return {
        fast,
        ref: { ...ref, calls: oldCalls.extract(tree, grammar, functions) },
    };
}

const SAMPLES = {
    'a.js': `
    import a, { b as c } from './a';
    import * as ns from "ns";
    export { x } from './x';
    export * from './all';
    const fs = require('fs');
    const dyn = require(name);
    const lazy = () => import('./lazy');
    const tmpl = require(\`./t\`);
    require();
    new require('nope');
    // import fake from './comment';
    const s = "require('in-string')";
    class K { m() { helper(1); this.other(2); new Thing(); } }
    function helper(x) { return a.b().c().d(x) || helper(x); }
    const arrow = () => helper(1) + util.go();
    helper(); helper(); util.go(); util.go();
  `,
    'b.ts': `
    import type { T } from './types';
    import x = require('legacy');
    import fs = require('fs');
    export type { U } from './u';
    function f<T>(a: T): T { return g(a); }
    const g = <T,>(a: T) => a;
    class C<T> { constructor() { f(1); } method() { return new C().method(); } }
  `,
    'c.tsx': `import R from 'react';\nexport const V = () => <div>{fmt(1)}{x.y()}</div>;\nfunction fmt(n: number) { return n; }\n`,
    'd.py': `
import os, sys as s
import a.b.c
from . import x, y
from ..pkg.mod import Foo as F, bar
from m import *
class G(Base):
    def hello(self, n):
        if n and self.ok() or other():
            return helper(n)
        return [z for z in n if z]
def helper(x):
    return G().hello(x) if x else print(x)
`,
    'broken.js': "import ok from './ok';\nconst = = ;\nfoo(\n",
    'empty.js': '',
    'e.py': 'x = 1\n',
};

describe('ScanExtractor == reference extractors', () => {
    for (const [path, code] of Object.entries(SAMPLES)) {
        it(`gives identical imports and calls for ${path}`, () => {
            const { fast, ref } = both(path, code);
            expect(fast.imports).toEqual(ref.imports);
            expect(fast.calls).toEqual(ref.calls);
            expect(fast.hadErrors).toBe(ref.hadErrors);
        });
    }

    it('actually finds things (guards against comparing two empty results)', () => {
        const { fast } = both('a.js', SAMPLES['a.js']);
        expect(fast.imports.length).toBeGreaterThan(6);
        expect(fast.calls.length).toBeGreaterThan(5);
    });

    it('gives identical results on this repository`s own source files', async () => {
        const { readdirSync, readFileSync, statSync } = await import('node:fs');
        const { join } = await import('node:path');
        const files = [];
        const walk = (dir) => {
            for (const name of readdirSync(dir)) {
                if (name === 'node_modules') continue;
                const full = join(dir, name);
                if (statSync(full).isDirectory()) walk(full);
                else if (/\.(js|jsx)$/.test(name)) files.push(full);
            }
        };
        walk(new URL('../src', import.meta.url).pathname);
        walk(new URL('../../frontend/src', import.meta.url).pathname);
        expect(files.length).toBeGreaterThan(50);
        for (const file of files) {
            const { fast, ref } = both(file, readFileSync(file, 'utf8'));
            expect(fast.imports, file).toEqual(ref.imports);
            expect(fast.calls, file).toEqual(ref.calls);
        }
    });
});
