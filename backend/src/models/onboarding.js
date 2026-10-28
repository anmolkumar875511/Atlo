const STARTER_COUNT = 10;
const WARM_UP = 4;
const CONNECT = 3;
const CORE = 3;

const TEST_PATH_RES = [
  /(^|\/)(tests?|__tests__|specs?)\//i,
  /\.(test|spec)\.[cm]?[jt]sx?$/i,
  /(^|\/)test_[^/]+\.py$/i,
  /_test\.py$/i,
  /(^|\/)conftest\.py$/i,
];

export const isTestPath = (path) => TEST_PATH_RES.some((re) => re.test(path));

// "src/utils/math.test.js" -> "math", "tests/test_math.py" -> "math". Used to pair a file with
// the test that is named after it.
export function stemOf(path) {
  const base = path.slice(path.lastIndexOf('/') + 1).replace(/\.[^.]+$/, '');
  return base
    .replace(/\.(test|spec)$/i, '')
    .replace(/^test_/i, '')
    .replace(/_test$/i, '')
    .toLowerCase();
}

const clamp01 = (x) => Math.max(0, Math.min(1, x));

// Smart onboarding: which files are safe and useful for a newcomer to touch first?
// Score (0..1), higher = better first contribution:
//   40%  small blast radius    few files can break if you get it wrong
//   30%  low complexity        easy to read and change
//   20%  has a test            you can check your change (a test named after it, or one importing it)
//   10%  documented            comments and docstrings explain it
// Tiny files (under 8 lines) are down-weighted because there is nothing to learn from them.
//
// Then an ordered learning path: warm up on easy leaf files, follow what they import, and finish
// at the core hubs that most of the code depends on.
export function buildOnboarding({ nodes, edges, analyses }) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const tests = nodes.filter((n) => isTestPath(n.id));
  const testsByStem = new Map();
  for (const t of tests) {
    const stem = stemOf(t.id);
    if (!testsByStem.has(stem)) testsByStem.set(stem, t.id);
  }

  const testImporters = new Map(); // file -> a test file that imports it
  const dependencies = new Map(); // file -> files it imports
  for (const edge of edges) {
    if (!dependencies.has(edge.source)) dependencies.set(edge.source, []);
    dependencies.get(edge.source).push(edge.target);
    if (isTestPath(edge.source) && !testImporters.has(edge.target)) {
      testImporters.set(edge.target, edge.source);
    }
  }

  const maxLog = Math.log1p(nodes.reduce((m, n) => Math.max(m, n.blastRadius ?? 0), 0)) || 1;

  const candidates = nodes
    .filter((n) => !isTestPath(n.id) && n.lines > 0)
    .map((n) => {
      const blast = n.blastRadius ?? 0;
      const testFile = testsByStem.get(stemOf(n.id)) ?? testImporters.get(n.id) ?? null;
      const commentLines = analyses.get(n.id)?.commentLines ?? 0;
      const docRatio = n.lines > 0 ? commentLines / n.lines : 0;

      let score =
        0.4 * (1 - Math.log1p(blast) / maxLog) +
        0.3 * (1 - clamp01(n.complexity / 60)) +
        0.2 * (testFile ? 1 : 0) +
        0.1 * clamp01(docRatio / 0.15);
      if (n.lines < 8) score *= 0.6;

      return { node: n, score, blast, testFile, docRatio };
    })
    .sort((a, b) => b.score - a.score || a.node.id.localeCompare(b.node.id));

  const starters = candidates
    .slice(0, STARTER_COUNT)
    .map(({ node, score, blast, testFile, docRatio }) => ({
      id: node.id,
      score: Math.round(score * 100) / 100,
      blastRadius: blast,
      complexity: node.complexity,
      lines: node.lines,
      testFile,
      reasons: reasonsFor({ node, blast, testFile, docRatio }),
    }));

  return { starters, path: buildPath({ starters, nodes, byId, dependencies }) };
}

function reasonsFor({ node, blast, testFile, docRatio }) {
  const reasons = [];
  reasons.push(
    blast === 0
      ? 'Nothing else imports it, so a change cannot break other files'
      : `Only ${blast} ${blast === 1 ? 'file depends' : 'files depend'} on it`,
  );
  reasons.push(`Low complexity (${node.complexity})`);
  if (testFile) reasons.push(`Has a test: ${testFile}`);
  if (docRatio >= 0.1) reasons.push(`Well documented (${Math.round(docRatio * 100)}% comments)`);
  return reasons;
}

function buildPath({ starters, nodes, byId, dependencies }) {
  const path = [];
  const used = new Set();
  const push = (id, stage, why) => {
    if (used.has(id)) return;
    used.add(id);
    path.push({ id, stage, why });
  };

  // 1. Warm-up: the best starter files.
  for (const s of starters.slice(0, WARM_UP)) {
    push(s.id, 'warm-up', 'Easy and safe: read it, then try a small change.');
  }

  // The core hubs are chosen first, so the middle stage cannot use them up: the path always
  // ends at the files most of the code depends on.
  const core = nodes
    .filter((n) => !isTestPath(n.id) && !used.has(n.id) && (n.blastRadius ?? 0) > 0)
    .sort((a, b) => (b.blastRadius ?? 0) - (a.blastRadius ?? 0) || a.id.localeCompare(b.id))
    .slice(0, CORE);
  const coreIds = new Set(core.map((n) => n.id));

  // 2. Connect: what the warm-up files import, least used first, so the path moves inward.
  const wanted = new Set();
  for (const s of starters.slice(0, WARM_UP)) {
    for (const dep of dependencies.get(s.id) ?? []) if (!isTestPath(dep)) wanted.add(dep);
  }
  [...wanted]
    .filter((id) => !used.has(id) && !coreIds.has(id))
    .sort((a, b) => byId.get(a).fanIn - byId.get(b).fanIn || a.localeCompare(b))
    .slice(0, CONNECT)
    .forEach((id) =>
      push(id, 'connect', 'Imported by your warm-up files, so you will meet it soon.'),
    );

  // 3. Core: read these last and change them carefully.
  for (const n of core) {
    push(
      n.id,
      'core',
      `A hub: ${n.blastRadius ?? 0} files depend on it. Read it, change it carefully.`,
    );
  }

  return path;
}
