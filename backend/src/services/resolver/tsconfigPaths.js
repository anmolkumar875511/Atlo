import { posix } from 'node:path';

// tsconfig.json / jsconfig.json are JSON with comments and trailing commas.
export function parseJsonc(text) {
  let out = '';
  let inString = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      out += ch;
      if (ch === '\\') out += text[++i] ?? '';
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      out += ch;
    } else if (ch === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i += 1;
      out += '\n';
    } else if (ch === '/' && text[i + 1] === '*') {
      i += 2;
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i += 1;
      i += 1;
    } else {
      out += ch;
    }
  }
  // Good enough for config files: a string value containing ",}" is not realistic here.
  return JSON.parse(out.replace(/,(\s*[}\]])/g, '$1'));
}

// Reads `baseUrl` and `paths` from the config at the repo root. Never throws: a broken
// config only means aliases stay unresolved.
export function loadPathAliases(contents) {
  for (const name of ['tsconfig.json', 'jsconfig.json']) {
    const text = contents.get(name);
    if (!text) continue;
    try {
      const options = parseJsonc(text).compilerOptions ?? {};
      const baseDir = posix.normalize(options.baseUrl ?? '.');
      const rules = Object.entries(options.paths ?? {}).map(([pattern, targets]) => {
        const star = pattern.indexOf('*');
        return {
          prefix: star === -1 ? pattern : pattern.slice(0, star),
          suffix: star === -1 ? '' : pattern.slice(star + 1),
          hasStar: star !== -1,
          targets: Array.isArray(targets) ? targets : [],
        };
      });
      // TypeScript uses the longest matching prefix first.
      rules.sort((a, b) => b.prefix.length - a.prefix.length);
      return { baseDir, hasBaseUrl: options.baseUrl !== undefined, rules };
    } catch {
      return null;
    }
  }
  return null;
}

// Returns candidate repo-relative paths (without extension probing) for a bare specifier.
export function aliasCandidates(aliases, specifier) {
  if (!aliases) return [];
  const candidates = [];
  for (const rule of aliases.rules) {
    let capture = null;
    if (!rule.hasStar) {
      if (specifier === rule.prefix) capture = '';
    } else if (
      specifier.length >= rule.prefix.length + rule.suffix.length &&
      specifier.startsWith(rule.prefix) &&
      specifier.endsWith(rule.suffix)
    ) {
      capture = specifier.slice(rule.prefix.length, specifier.length - rule.suffix.length);
    }
    if (capture === null) continue;
    for (const target of rule.targets) {
      candidates.push(posix.normalize(posix.join(aliases.baseDir, target.replace('*', capture))));
    }
  }
  if (aliases.hasBaseUrl) candidates.push(posix.normalize(posix.join(aliases.baseDir, specifier)));
  return candidates;
}
