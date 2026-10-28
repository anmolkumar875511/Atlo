import { describe, expect, it } from 'vitest';
import { ImportResolver, packageName } from '../src/services/resolver/importResolver.js';
import { loadPathAliases, parseJsonc } from '../src/services/resolver/tsconfigPaths.js';

const make = (paths, aliases = null) => new ImportResolver({ filePaths: new Set(paths), aliases });

describe('ImportResolver: relative paths', () => {
  const r = make([
    'src/app.js',
    'src/utils.js',
    'src/lib/index.js',
    'src/lib/deep.ts',
    'src/models/user.ts',
    'src/data.json',
    'index.js',
    'other/index.ts',
  ]);

  it.each([
    ['src/app.js', './utils', 'src/utils.js'], // missing extension
    ['src/app.js', './utils.js', 'src/utils.js'], // exact
    ['src/app.js', './lib', 'src/lib/index.js'], // folder index
    ['src/app.js', './lib/', 'src/lib/index.js'], // trailing slash
    ['src/app.js', './lib/deep', 'src/lib/deep.ts'], // .ts found
    ['src/lib/deep.ts', '../utils', 'src/utils.js'], // parent folder
    ['src/app.js', './models/user.js', 'src/models/user.ts'], // TS writes .js, file is .ts
    ['src/app.js', './data.json', 'src/data.json'],
    ['src/app.js', '../index', 'index.js'],
    ['index.js', '.', 'index.js'], // "." means this folder's index
    ['index.js', './other', 'other/index.ts'],
  ])('%s imports %s -> %s', (from, spec, target) => {
    expect(r.resolve(from, spec)).toEqual({ kind: 'internal', target });
  });

  it('prefers a file over a folder with the same name', () => {
    const both = make(['a.js', 'a/index.js']);
    expect(both.resolve('main.js', './a')).toEqual({ kind: 'internal', target: 'a.js' });
  });

  it('reports a missing file as unresolved, not as an error', () => {
    expect(r.resolve('src/app.js', './missing')).toEqual({
      kind: 'unresolved',
      reason: 'not-found',
    });
  });

  it('refuses to climb out of the repository', () => {
    expect(r.resolve('src/app.js', '../../etc/passwd')).toEqual({
      kind: 'unresolved',
      reason: 'outside-repo',
    });
    expect(r.resolve('index.js', '../x')).toEqual({ kind: 'unresolved', reason: 'outside-repo' });
  });

  it('does not resolve absolute paths', () => {
    expect(r.resolve('src/app.js', '/usr/lib/x')).toEqual({
      kind: 'unresolved',
      reason: 'absolute',
    });
  });
});

describe('ImportResolver: packages and aliases', () => {
  const r = make(['src/app.js']);

  it.each([
    ['react', 'react'],
    ['lodash/fp', 'lodash'],
    ['@babel/core', '@babel/core'],
    ['@babel/core/lib/x', '@babel/core'],
    ['node:fs', 'node:fs'],
    ['fs', 'fs'],
  ])('treats %s as external package %s', (spec, name) => {
    expect(r.resolve('src/app.js', spec)).toEqual({ kind: 'external', name });
  });

  it('marks unknown aliases as unresolved, not as npm packages', () => {
    for (const spec of ['@/utils', '~/utils', '#internal']) {
      expect(r.resolve('src/app.js', spec)).toEqual({ kind: 'unresolved', reason: 'alias' });
    }
  });

  it('packageName helper', () => {
    expect(packageName('@scope/pkg/x')).toBe('@scope/pkg');
    expect(packageName('pkg/x/y')).toBe('pkg');
  });
});

describe('tsconfig paths', () => {
  const tsconfig = `{
    // comments and trailing commas are allowed in tsconfig
    "compilerOptions": {
      "baseUrl": ".",
      "paths": { "@/*": ["src/*"], "@utils": ["src/utils/index.ts"], },
    },
  }`;

  it('parses JSON with comments and trailing commas', () => {
    expect(parseJsonc('{ "a": "http://x", /* c */ "b": [1,], }')).toEqual({
      a: 'http://x',
      b: [1],
    });
  });

  it('resolves wildcard and exact aliases', () => {
    const aliases = loadPathAliases(new Map([['tsconfig.json', tsconfig]]));
    const r = make(['src/app.ts', 'src/components/Button.tsx', 'src/utils/index.ts'], aliases);
    expect(r.resolve('src/app.ts', '@/components/Button')).toEqual({
      kind: 'internal',
      target: 'src/components/Button.tsx',
    });
    expect(r.resolve('src/app.ts', '@utils')).toEqual({
      kind: 'internal',
      target: 'src/utils/index.ts',
    });
  });

  it('resolves bare imports through baseUrl', () => {
    const aliases = loadPathAliases(
      new Map([['jsconfig.json', '{ "compilerOptions": { "baseUrl": "src" } }']]),
    );
    const r = make(['src/shared/util.js', 'src/app.js'], aliases);
    expect(r.resolve('src/app.js', 'shared/util')).toEqual({
      kind: 'internal',
      target: 'src/shared/util.js',
    });
  });

  it('falls back to external/unresolved when the alias target does not exist', () => {
    const aliases = loadPathAliases(new Map([['tsconfig.json', tsconfig]]));
    expect(make(['src/app.ts'], aliases).resolve('src/app.ts', '@/nope')).toEqual({
      kind: 'unresolved',
      reason: 'alias',
    });
  });

  it('ignores a broken config instead of throwing', () => {
    expect(loadPathAliases(new Map([['tsconfig.json', '{ not json']]))).toBeNull();
    expect(loadPathAliases(new Map())).toBeNull();
  });
});
