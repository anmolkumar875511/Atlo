import { posix } from 'node:path';

const internal = (target) => ({ kind: 'internal', target });
const unresolved = (reason) => ({ kind: 'unresolved', reason });

// Folders Python code is usually imported from, besides the repository root.
const COMMON_ROOTS = ['src', 'lib'];

// A "source root" is the folder that CONTAINS a top-level package, i.e. what Python would have on
// sys.path. For backend/app/__init__.py with app/ having no parent package, the root is "backend".
export function findSourceRoots(filePaths) {
  const roots = new Set(['']);
  for (const root of COMMON_ROOTS) roots.add(root);

  const packageDirs = new Set();
  for (const path of filePaths) {
    if (posix.basename(path) === '__init__.py') packageDirs.add(posix.dirname(path));
  }
  for (const dir of packageDirs) {
    let top = dir;
    while (top !== '.' && packageDirs.has(posix.dirname(top))) top = posix.dirname(top);
    const parent = posix.dirname(top);
    roots.add(parent === '.' ? '' : parent);
  }
  return [...roots].sort((a, b) => a.length - b.length || a.localeCompare(b));
}

// Resolves Python imports to files in the repository.
//   import a.b.c          -> a/b/c.py or a/b/c/__init__.py
//   from a.b import c     -> a/b (module or package) plus a/b/c.py if c is a submodule
//   from . import x       -> x.py next to the current file
//   from ..pkg import y   -> one folder up
// Anything not found inside the repository is an external package (standard library or pip).
// Like the JavaScript resolver, it never throws and never guesses.
export class PythonResolver {
  constructor({ filePaths }) {
    this.files = filePaths;
    this.roots = findSourceRoots(filePaths);
  }

  // Returns a list, because `from pkg import a, b` can touch several files at once.
  //
  // `from pkg import name` means the submodule pkg/name.py when it exists. Only when `name` is
  // something else (a function or constant defined in pkg/__init__.py) does the file depend on the
  // package file itself. Counting every `from . import x` as a dependency on __init__.py would
  // draw a false cycle for every package that imports its own submodules.
  resolve(fromPath, { specifier, names = [] }) {
    if (specifier.startsWith('.')) return this.#relative(fromPath, specifier, names);

    const modulePath = specifier.split('.').join('/');
    const found = this.#findModule(modulePath, this.#rootsFor(fromPath));
    if (!found) return [{ kind: 'external', name: specifier.split('.')[0] }];
    return this.#targets(found.file, found.root, modulePath, names);
  }

  // The module file itself (only if something besides submodules is imported) plus each submodule.
  #targets(moduleFile, root, modulePath, names) {
    const submodules = [];
    let needsModule = names.length === 0;
    for (const name of names) {
      const subPath = modulePath ? `${modulePath}/${name}` : name;
      const sub = name === '*' ? null : this.#findModuleIn(root, subPath);
      if (sub) submodules.push(sub);
      else needsModule = true;
    }
    const files = needsModule && moduleFile ? [moduleFile, ...submodules] : submodules;
    return files.map(internal);
  }

  // Imports are tried from the file's own source root first, which is the likeliest match.
  #rootsFor(fromPath) {
    const own = this.roots.filter((r) => r === '' || fromPath.startsWith(`${r}/`));
    return [...own.reverse(), ...this.roots.filter((r) => !own.includes(r))];
  }

  #findModule(modulePath, roots) {
    for (const root of roots) {
      const file = this.#findModuleIn(root, modulePath);
      if (file) return { root, file };
    }
    return null;
  }

  #findModuleIn(root, modulePath) {
    const base = root ? `${root}/${modulePath}` : modulePath;
    if (this.files.has(`${base}.py`)) return `${base}.py`;
    if (this.files.has(`${base}/__init__.py`)) return `${base}/__init__.py`;
    return null;
  }

  #relative(fromPath, specifier, names) {
    const dots = specifier.match(/^\.+/)[0].length;
    const rest = specifier.slice(dots).split('.').filter(Boolean).join('/');

    // One dot is the current package (the file's folder); each extra dot goes one folder up.
    let dir = posix.dirname(fromPath);
    for (let i = 1; i < dots; i += 1) {
      if (dir === '.') return [unresolved('outside-repo')];
      dir = posix.dirname(dir);
    }
    const base = dir === '.' ? '' : dir;

    let moduleFile;
    if (rest) {
      moduleFile = this.#findModuleIn(base, rest);
      if (!moduleFile) return [unresolved('not-found')];
    } else {
      // `from . import x`: the package itself is the module.
      const init = base ? `${base}/__init__.py` : '__init__.py';
      moduleFile = this.files.has(init) ? init : null;
    }

    const results = this.#targets(moduleFile, base, rest, names).filter(
      (r) => r.target !== fromPath,
    );
    return results.length > 0 ? results : [unresolved('not-found')];
  }
}
