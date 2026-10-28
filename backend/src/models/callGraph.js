const MAX_NAMES_PER_EDGE = 5;
const MAX_LINKS_PER_FILE = 3000;

const tailOf = (name) => name.slice(name.lastIndexOf('.') + 1);

// Definitions a file offers, by short name: functions and classes, remembering whether each one
// is a method. `Router.handle` is stored as "handle" (a method); a class is stored as itself.
function buildDefinitions(analyses) {
  const defs = new Map();
  for (const [path, analysis] of analyses) {
    const table = new Map();
    const add = (name, def) => {
      if (!table.has(name)) table.set(name, def);
    };
    for (const fn of analysis.functions) {
      add(tailOf(fn.name), { name: fn.name, line: fn.line, method: fn.kind === 'method' });
    }
    for (const cls of analysis.classes) {
      add(cls.name, { name: cls.name, line: cls.line, method: false });
    }
    defs.set(path, table);
  }
  return defs;
}

// A plain call `f()` can reach a function or class; a member call `x.f()` can reach a method, or
// a function through a namespace import. Without type information that is as precise as it gets.
const accepts = (def, call, local) => (call.member ? def.method || !local : !def.method);

// Links each call site to a definition: first in the same file, then in the files it imports.
// Returns per-file links (for the code panel) and file-to-file edges (for the graph).
// Approximate by design: matching is by name, so two functions with the same name can be mixed up.
export function buildCallGraph({ analyses, importTargets }) {
  const defs = buildDefinitions(analyses);
  const linksByFile = new Map();
  const edgeMap = new Map();

  for (const [path, analysis] of analyses) {
    const links = [];
    const imported = importTargets.get(path) ?? [];

    for (const call of analysis.calls ?? []) {
      let hit = null;
      const local = defs.get(path)?.get(call.name);
      if (local && accepts(local, call, true)) {
        hit = { file: path, def: local };
      } else {
        for (const target of imported) {
          const def = defs.get(target)?.get(call.name);
          if (def && accepts(def, call, false)) {
            hit = { file: target, def };
            break;
          }
        }
      }
      if (!hit) continue;

      if (links.length < MAX_LINKS_PER_FILE) {
        links.push({
          caller: call.caller,
          name: hit.def.name,
          file: hit.file,
          defLine: hit.def.line,
          callLine: call.line,
        });
      }
      if (hit.file !== path) {
        const key = `${path}\0${hit.file}`;
        let edge = edgeMap.get(key);
        if (!edge) {
          edge = { source: path, target: hit.file, type: 'call', count: 0, names: [] };
          edgeMap.set(key, edge);
        }
        edge.count += 1;
        if (edge.names.length < MAX_NAMES_PER_EDGE && !edge.names.includes(hit.def.name)) {
          edge.names.push(hit.def.name);
        }
      }
    }
    linksByFile.set(path, links);
  }

  const edges = [...edgeMap.values()].sort(
    (a, b) => b.count - a.count || a.source.localeCompare(b.source),
  );
  return { edges, linksByFile, calledBy: buildCalledBy(linksByFile) };
}

// Reverse index: "who calls function F of file P?". Key: `${file}\0${functionName}`.
function buildCalledBy(linksByFile) {
  const index = new Map();
  for (const [callerFile, links] of linksByFile) {
    for (const link of links) {
      const key = `${link.file}\0${link.name}`;
      if (!index.has(key)) index.set(key, []);
      index.get(key).push({ file: callerFile, caller: link.caller, line: link.callLine });
    }
  }
  return index;
}
