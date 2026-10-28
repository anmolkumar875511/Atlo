import { describe, expect, it } from 'vitest';
import { FileAnalyzer } from '../src/services/parser/fileAnalyzer.js';
import { findSourceRoots, PythonResolver } from '../src/services/resolver/pythonResolver.js';

const analyzer = new FileAnalyzer();
const analyze = (content, path = 'pkg/mod.py') => analyzer.analyze({ path, content });

describe('Python imports', () => {
  it('reads import, aliased import and from-import with names', () => {
    const { imports } = analyze(
      'import os, sys as s\nimport a.b.c\nfrom ..pkg.mod import Foo as F, bar\nfrom . import x\nfrom m import *\n',
    );
    expect(imports).toEqual([
      { kind: 'import', line: 1, specifier: 'os', names: [] },
      { kind: 'import', line: 1, specifier: 'sys', names: [] },
      { kind: 'import', line: 2, specifier: 'a.b.c', names: [] },
      { kind: 'from', line: 3, specifier: '..pkg.mod', names: ['Foo', 'bar'] },
      { kind: 'from', line: 4, specifier: '.', names: ['x'] },
      { kind: 'from', line: 5, specifier: 'm', names: ['*'] },
    ]);
  });

  it('finds imports inside functions and try blocks, but not inside strings or comments', () => {
    const { imports } = analyze(
      '# import fake\ntext = "import nope"\ntry:\n    import ujson\nexcept ImportError:\n    pass\ndef f():\n    from x import y\n',
    );
    expect(imports.map((i) => i.specifier)).toEqual(['ujson', 'x']);
  });
});

describe('Python metrics', () => {
  const source = [
    '"""Module doc."""',
    'class Greeter:',
    '    """Says hi."""',
    '    def hello(self, n):',
    '        if n and self.ok() or other():',
    '            return helper(n)',
    '        return [z for z in n if z]',
    '',
    '# note',
    'def helper(x):',
    '    return x if x else 0',
    '',
  ].join('\n');
  const result = analyze(source);

  it('counts McCabe decision points, including and/or and comprehensions', () => {
    const hello = result.functions.find((f) => f.name === 'Greeter.hello');
    // 1 + if + and + or + comprehension for + comprehension if
    expect(hello.complexity).toBe(6);
    expect(result.functions.find((f) => f.name === 'helper').complexity).toBe(2);
    expect(result.complexity).toBe(1 + 5 + 1);
  });

  it('names methods after their class and finds classes', () => {
    expect(result.functions.map((f) => [f.name, f.kind])).toEqual([
      ['Greeter.hello', 'method'],
      ['helper', 'function'],
    ]);
    expect(result.classes).toEqual([{ name: 'Greeter', line: 2, endLine: 7 }]);
  });

  it('counts docstrings and comments as documentation lines', () => {
    expect(result.commentLines).toBe(3);
  });

  it('records call sites with their caller', () => {
    expect(result.calls).toContainEqual({
      name: 'helper',
      line: 6,
      caller: 'Greeter.hello',
      member: false,
    });
    expect(result.calls).toContainEqual({
      name: 'ok',
      line: 5,
      caller: 'Greeter.hello',
      member: true,
    });
  });

  it('survives a syntax error', () => {
    const broken = analyze('import ok\ndef (:\n');
    expect(broken.hadErrors).toBe(true);
    expect(broken.imports[0].specifier).toBe('ok');
  });
});

describe('findSourceRoots', () => {
  it('finds the folder that contains a top-level package', () => {
    const roots = findSourceRoots(
      new Set(['backend/app/__init__.py', 'backend/app/api/__init__.py', 'lib2/x/__init__.py']),
    );
    expect(roots).toContain('backend');
    expect(roots).toContain('lib2');
    expect(roots).toContain('');
    expect(roots).not.toContain('backend/app');
  });
});

describe('PythonResolver', () => {
  const files = new Set([
    'main.py',
    'app/__init__.py',
    'app/models.py',
    'app/utils/__init__.py',
    'app/utils/text.py',
    'app/api/routes.py',
    'src/shared/config.py',
    'backend/svc/__init__.py',
    'backend/svc/core.py',
  ]);
  const resolver = new PythonResolver({ filePaths: files });
  const targets = (from, imp) =>
    resolver.resolve(from, { names: [], ...imp }).map((r) => r.target ?? r.name ?? r.reason);

  it('resolves absolute modules and packages', () => {
    expect(targets('main.py', { specifier: 'app.models' })).toEqual(['app/models.py']);
    expect(targets('main.py', { specifier: 'app.utils' })).toEqual(['app/utils/__init__.py']);
  });

  it('adds a submodule when a from-import names one', () => {
    expect(targets('main.py', { specifier: 'app.utils', names: ['text', 'missing'] })).toEqual([
      'app/utils/__init__.py',
      'app/utils/text.py',
    ]);
  });

  it('depends on the package file only when something other than a submodule is imported', () => {
    // `text` is a submodule, so there is no dependency on app/utils/__init__.py.
    expect(targets('main.py', { specifier: 'app.utils', names: ['text'] })).toEqual([
      'app/utils/text.py',
    ]);
    expect(targets('main.py', { specifier: 'app.utils', names: ['*'] })).toEqual([
      'app/utils/__init__.py',
    ]);
  });

  it('resolves relative imports with one and two dots', () => {
    expect(targets('app/api/routes.py', { specifier: '..models' })).toEqual(['app/models.py']);
    expect(targets('app/models.py', { specifier: '.', names: ['utils'] })).toEqual([
      'app/utils/__init__.py',
    ]);
    expect(targets('app/models.py', { specifier: '.utils', names: ['text'] })).toEqual([
      'app/utils/text.py',
    ]);
    expect(targets('app/models.py', { specifier: '.', names: ['VERSION'] })).toEqual([
      'app/__init__.py',
    ]);
  });

  it('never makes a file depend on itself', () => {
    expect(targets('app/utils/text.py', { specifier: '.', names: ['text'] })).toEqual([
      'not-found',
    ]);
  });

  it('supports src/ layouts and detected source roots', () => {
    expect(targets('main.py', { specifier: 'shared.config' })).toEqual(['src/shared/config.py']);
    expect(targets('backend/svc/core.py', { specifier: 'svc' })).toEqual([
      'backend/svc/__init__.py',
    ]);
  });

  it('treats anything not in the repository as external', () => {
    expect(resolver.resolve('main.py', { specifier: 'numpy.linalg', names: [] })).toEqual([
      { kind: 'external', name: 'numpy' },
    ]);
  });

  it('reports unplaceable relative imports instead of guessing', () => {
    expect(targets('main.py', { specifier: '..up' })).toEqual(['outside-repo']);
    expect(targets('app/models.py', { specifier: '.nope' })).toEqual(['not-found']);
  });
});
