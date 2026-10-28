import { describe, expect, it } from 'vitest';
import { MetricsExtractor } from '../src/services/parser/metricsExtractor.js';
import { TreeSitterParser } from '../src/services/parser/treeSitterParser.js';

const parser = new TreeSitterParser();
const extractor = new MetricsExtractor();
const metrics = (code, grammar = 'javascript') =>
  extractor.extract(parser.parse(code, grammar), grammar);
const fn = (code, name, grammar) => metrics(code, grammar).functions.find((f) => f.name === name);

describe('cyclomatic complexity (function starts at 1, +1 per decision)', () => {
  it('a function with no branches is 1', () => {
    expect(fn('function f(a) { return a + 1; }', 'f').complexity).toBe(1);
  });

  it('counts if, else if and the ternary', () => {
    const code = `function f(a) {
      if (a) { return 1; } else if (a > 2) { return 2; }
      return a ? 3 : 4;
    }`;
    expect(fn(code, 'f').complexity).toBe(4);
  });

  it('counts for, for-of, while and do-while', () => {
    const code = `function g(xs) {
      for (let i = 0; i < 3; i++) {}
      for (const x of xs) {}
      while (xs.length) { break; }
      do {} while (false);
    }`;
    expect(fn(code, 'g').complexity).toBe(5);
  });

  it('counts each case but not default', () => {
    const code = `function h(x) { switch (x) { case 1: break; case 2: break; default: break; } }`;
    expect(fn(code, 'h').complexity).toBe(3);
  });

  it('counts catch', () => {
    expect(fn('function t() { try { risky(); } catch (e) {} }', 't').complexity).toBe(2);
  });

  it('counts && || and ??, but not the assignment forms', () => {
    expect(fn('function l(a, b, c) { return a && b || c; }', 'l').complexity).toBe(3);
    expect(fn('const m = (a) => a ?? 0;', 'm').complexity).toBe(2);
    expect(fn('function z(a) { a &&= 1; a ||= 2; a ??= 3; }', 'z').complexity).toBe(1);
  });

  it('counts a nested function on its own, not inside its parent', () => {
    const code = `function outer(a) {
      if (a) {}
      function inner(b) { if (b) {} if (b > 1) {} }
    }`;
    const result = metrics(code);
    expect(result.functions.find((f) => f.name === 'outer').complexity).toBe(2);
    expect(result.functions.find((f) => f.name === 'inner').complexity).toBe(3);
    expect(result.complexity).toBe(4); // file: 1 + 3 decision points
  });

  it('file complexity is 1 + all decision points, including code outside functions', () => {
    expect(metrics('const a = 1;').complexity).toBe(1);
    expect(metrics('if (x) {} const y = x ? 1 : 2; function f() { if (y) {} }').complexity).toBe(4);
  });
});

describe('function and class names', () => {
  it('names declarations, arrows, function expressions and object members', () => {
    const code = `
      function foo() {}
      const bar = () => {};
      const baz = function () {};
      const obj = { qux: function () {}, quux() {}, 'quoted': () => {} };
      exports.thing = function () {};
    `;
    expect(metrics(code).functions.map((f) => f.name)).toEqual([
      'foo',
      'bar',
      'baz',
      'qux',
      'quux',
      'quoted',
      'exports.thing',
    ]);
  });

  it('works for function expressions in the JavaScript grammar', () => {
    expect(fn('const q = function () { if (1) {} };', 'q', 'javascript').complexity).toBe(2);
  });

  it('qualifies methods with their class name', () => {
    const code = `class K { run() {} static go() {} get size() { return 1; } }`;
    expect(metrics(code).functions.map((f) => [f.name, f.kind])).toEqual([
      ['K.run', 'method'],
      ['K.go', 'method'],
      ['K.size', 'method'],
    ]);
  });

  it('lists anonymous functions nowhere but still counts their decisions', () => {
    const result = metrics('[1, 2].map((x) => (x > 1 ? x : 0));');
    expect(result.functions).toEqual([]);
    expect(result.complexity).toBe(2);
  });

  it('lists classes, including named class expressions', () => {
    const result = metrics('class A {}\nconst B = class {};');
    expect(result.classes.map((c) => [c.name, c.line])).toEqual([
      ['A', 1],
      ['B', 2],
    ]);
  });

  it('records start and end lines', () => {
    const f = fn('\nfunction span() {\n  return 1;\n}\n', 'span');
    expect([f.line, f.endLine]).toEqual([2, 4]);
  });
});

describe('tokens', () => {
  it('counts syntax tokens and ignores comments', () => {
    // const, a, =, 1, ;
    expect(metrics('const a = 1; // trailing\n/* block */').tokens).toBe(5);
  });

  it('is 0 for an empty file', () => {
    expect(metrics('').tokens).toBe(0);
  });
});

describe('TypeScript and TSX', () => {
  it('handles types, generics and interfaces', () => {
    const code = `
      interface I { a: number }
      export function pick<T extends I>(x: T, ok: boolean): T | null { return ok ? x : null; }
      class Box<T> { private v: T; get(): T { return this.v; } }
    `;
    const result = metrics(code, 'typescript');
    expect(result.functions.map((f) => f.name)).toEqual(['pick', 'Box.get']);
    expect(result.functions[0].complexity).toBe(2);
    expect(result.classes.map((c) => c.name)).toEqual(['Box']);
  });

  it('handles JSX in TSX', () => {
    const result = metrics('const C = () => <div>{x ? 1 : 2}</div>;', 'tsx');
    expect(result.functions).toMatchObject([{ name: 'C', complexity: 2 }]);
  });
});

describe('robustness', () => {
  it('does not throw on a file with a syntax error', () => {
    const result = metrics('function ok() { if (a) {} }\nconst = = ;');
    expect(result.functions.find((f) => f.name === 'ok').complexity).toBe(2);
  });

  it('handles deeply nested code without overflowing the stack', () => {
    const code = `const x = ${'['.repeat(2000)}${']'.repeat(2000)};`;
    expect(metrics(code, 'typescript').tokens).toBeGreaterThan(4000);
  });

  it('rejects an unknown grammar', () => {
    expect(() => extractor.extract({}, 'cobol')).toThrow(/No metrics profile/);
  });
});
