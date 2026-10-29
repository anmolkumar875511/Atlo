import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { GitChurnClient, parseGitLog } from '../src/services/churn/gitChurnClient.js';

describe('parseGitLog', () => {
    it('counts the commits that touched each file', () => {
        const output = [
            '@c3 p2',
            'src/a.js',
            'src/b.js',
            '',
            '@c2 p1',
            'src/a.js',
            '',
            '@c1 p0',
            'src/a.js',
        ].join('\n');
        const { counts, commits } = parseGitLog(output);
        expect(commits).toBe(3);
        expect(counts.get('src/a.js')).toBe(3);
        expect(counts.get('src/b.js')).toBe(1);
    });

    it('skips the parentless commit that a shallow clone ends on', () => {
        const { counts, commits } = parseGitLog('@c2 c1\nsrc/a.js\n\n@c1 \nsrc/a.js\nsrc/old.js\n');
        expect(commits).toBe(1);
        expect(counts.get('src/a.js')).toBe(1);
        expect(counts.has('src/old.js')).toBe(false);
    });

    it('handles empty output', () => {
        expect(parseGitLog('')).toEqual({ counts: new Map(), commits: 0 });
    });
});

describe('GitChurnClient', () => {
    it('reports git-missing instead of throwing when git is not installed', async () => {
        const client = new GitChurnClient({ gitBinary: 'atlo-no-such-git-binary' });
        const result = await client.fetch({
            owner: 'a',
            name: 'b',
            ref: null,
            url: 'https://github.com/a/b',
        });
        expect(result).toMatchObject({ available: false, reason: 'git-missing', commits: 0 });
    });

    it('reports git-failed for an unreachable repository', async () => {
        const client = new GitChurnClient({ timeoutMs: 15_000 });
        const result = await client.fetch({
            owner: 'atlo-test',
            name: 'does-not-exist',
            ref: null,
            url: 'file:///nonexistent/atlo-repo',
        });
        expect(result.available).toBe(false);
        expect(['git-failed', 'timeout']).toContain(result.reason);
    });
});

const hasGit = (() => {
    try {
        execFileSync('git', ['--version']);
        return true;
    } catch {
        return false;
    }
})();

describe.skipIf(!hasGit)('GitChurnClient with a real local repository', () => {
    const root = mkdtempSync(join(tmpdir(), 'atlo-churn-test-'));
    // The client clones `${url}.git`, so the folder is named demo.git.
    const repoDir = join(root, 'demo.git');
    afterAll(() => rmSync(root, { recursive: true, force: true }));

    const git = (...args) =>
        execFileSync('git', ['-C', repoDir, '-c', 'user.name=t', '-c', 'user.email=t@t', ...args], {
            stdio: 'pipe',
        });
    const commit = (files, message) => {
        for (const [path, text] of Object.entries(files)) {
            mkdirSync(dirname(join(repoDir, path)), { recursive: true });
            writeFileSync(join(repoDir, path), text);
        }
        git('add', '-A');
        git('commit', '-q', '-m', message);
    };

    it('counts commits per file from the recent history', async () => {
        mkdirSync(repoDir, { recursive: true });
        execFileSync('git', ['init', '-q', '-b', 'main', repoDir]);
        git('config', 'uploadpack.allowFilter', 'true');
        commit({ 'src/a.js': 'a1', 'src/b.js': 'b1' }, 'one');
        commit({ 'src/a.js': 'a2' }, 'two');
        commit({ 'src/a.js': 'a3', 'src/c.js': 'c1' }, 'three');

        const client = new GitChurnClient({ timeoutMs: 30_000 });
        const result = await client.fetch({
            owner: 'x',
            name: 'demo',
            ref: null,
            url: `file://${join(root, 'demo')}`,
        });

        expect(result.available).toBe(true);
        // The very first commit has no parent, so it is skipped (see parseGitLog).
        expect(result.commits).toBe(2);
        expect(result.counts.get('src/a.js')).toBe(2);
        expect(result.counts.get('src/c.js')).toBe(1);
        expect(result.counts.has('src/b.js')).toBe(false);
    });
});
