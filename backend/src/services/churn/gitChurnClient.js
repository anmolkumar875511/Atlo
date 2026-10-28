import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);
const FALLBACK_DEPTH = 300;

// Turns the output of `git log --name-only --pretty=format:@%H %P` into commits-per-file counts.
// Lines starting with "@" begin a commit (hash, then its parents); every other non-empty line is
// a file changed by that commit. A commit with no parent is skipped: in a shallow clone it is the
// cut-off point and would list every file as "changed", which would inflate every count by one.
export function parseGitLog(output) {
  const counts = new Map();
  let commits = 0;
  let skip = false;

  for (const line of output.split('\n')) {
    if (!line) continue;
    if (line.startsWith('@')) {
      const parents = line.slice(1).trim().split(/\s+/).slice(1);
      skip = parents.length === 0;
      if (!skip) commits += 1;
    } else if (!skip) {
      counts.set(line, (counts.get(line) ?? 0) + 1);
    }
  }
  return { counts, commits };
}

// Reads "how often was each file changed" from git history without downloading file contents.
//   git clone --filter=blob:none --no-checkout   -> commits and trees only, no blobs
//   --shallow-since                              -> only the recent window (default one year)
//   git log --name-only                          -> files touched by each commit
// Needs the `git` program on the server. If it is missing, slow or the repo is private, the call
// resolves to { available: false, reason } and the rest of Atlo keeps working.
export class GitChurnClient {
  constructor({ timeoutMs = 60_000, windowDays = 365, maxCommits = 5000, gitBinary = 'git' } = {}) {
    this.timeoutMs = timeoutMs;
    this.windowDays = windowDays;
    this.maxCommits = maxCommits;
    this.git = gitBinary;
  }

  async fetch(repo) {
    const started = performance.now();
    const finish = (extra) => ({
      windowDays: this.windowDays,
      ms: Math.round(performance.now() - started),
      ...extra,
    });

    let dir;
    try {
      dir = await mkdtemp(join(tmpdir(), 'atlo-churn-'));
      const env = { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_ASKPASS: 'echo' };
      const options = { env, timeout: this.timeoutMs, maxBuffer: 256 * 1024 * 1024 };

      const cloneArgs = (history) => {
        const args = ['clone', '--quiet', '--filter=blob:none', '--no-checkout', '--single-branch'];
        args.push(history);
        if (repo.ref) args.push(`--branch=${repo.ref}`);
        args.push('--', `${repo.url}.git`, dir);
        return args;
      };

      let windowDays = this.windowDays;
      try {
        await run(this.git, cloneArgs(`--shallow-since=${this.windowDays}.days.ago`), options);
      } catch (err) {
        // A repository with no commits in the window cannot be cloned that way. Fall back to the
        // latest commits instead of giving up.
        if (!/no commits selected/i.test(err.stderr ?? '')) throw err;
        await rm(dir, { recursive: true, force: true });
        await run(this.git, cloneArgs(`--depth=${FALLBACK_DEPTH}`), options);
        windowDays = null;
      }

      const { stdout } = await run(
        this.git,
        [
          '-C',
          dir,
          'log',
          '--name-only',
          '--no-renames',
          '--no-merges',
          `--max-count=${this.maxCommits}`,
          '--pretty=format:@%H %P',
        ],
        options,
      );
      const { counts, commits } = parseGitLog(stdout);
      return finish({ available: true, counts, commits, windowDays });
    } catch (err) {
      return finish({ available: false, counts: new Map(), commits: 0, reason: reasonFor(err) });
    } finally {
      if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  }
}

function reasonFor(err) {
  if (err.code === 'ENOENT') return 'git-missing';
  if (err.killed || err.signal === 'SIGTERM') return 'timeout';
  return 'git-failed';
}
