import { posix } from 'node:path';
import { aliasCandidates } from './tsconfigPaths.js';

const EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts', '.json'];

// TypeScript code writes `import './a.js'` even though the file on disk is `a.ts`.
const JS_TO_TS = { js: ['.ts', '.tsx'], jsx: ['.tsx'], mjs: ['.mts'], cjs: ['.cts'] };

const internal = (target) => ({ kind: 'internal', target });
const unresolved = (reason) => ({ kind: 'unresolved', reason });

function isRelative(specifier) {
    return (
        specifier === '.' ||
        specifier === '..' ||
        specifier.startsWith('./') ||
        specifier.startsWith('../')
    );
}

// "@scope/pkg/deep/file" -> "@scope/pkg", "lodash/fp" -> "lodash"
export function packageName(specifier) {
    if (specifier.startsWith('node:')) return specifier;
    const parts = specifier.split('/');
    return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
}

// Turns an import string into a real file in the repo, the way Node and TypeScript would:
// exact file, then missing extensions, then a folder's index file.
// It never throws. Anything it cannot place is reported, not guessed.
export class ImportResolver {
    constructor({ filePaths, aliases = null }) {
        this.files = filePaths;
        this.aliases = aliases;
    }

    resolve(fromPath, specifier) {
        if (isRelative(specifier)) {
            const base = posix.normalize(posix.join(posix.dirname(fromPath), specifier));
            if (base === '..' || base.startsWith('../')) return unresolved('outside-repo');
            const target = this.#findFile(base);
            return target ? internal(target) : unresolved('not-found');
        }

        if (specifier.startsWith('/')) return unresolved('absolute');

        for (const candidate of aliasCandidates(this.aliases, specifier)) {
            const target = this.#findFile(candidate);
            if (target) return internal(target);
        }

        // "@/x", "~/x" and "#x" are aliases, not npm packages. Without a matching config
        // entry we cannot place them, so we say so instead of calling them external.
        if (/^[@~]\//.test(specifier) || specifier.startsWith('#')) return unresolved('alias');

        return { kind: 'external', name: packageName(specifier) };
    }

    #findFile(rawBase) {
        let base = rawBase.replace(/\/+$/, '');
        if (base === '.') base = '';

        if (base && this.files.has(base)) return base;
        for (const ext of EXTENSIONS) {
            if (base && this.files.has(base + ext)) return base + ext;
        }

        const jsExt = base.match(/\.(js|jsx|mjs|cjs)$/);
        if (jsExt) {
            const stem = base.slice(0, -jsExt[0].length);
            for (const ext of JS_TO_TS[jsExt[1]]) {
                if (this.files.has(stem + ext)) return stem + ext;
            }
        }

        for (const ext of EXTENSIONS) {
            const indexPath = posix.join(base, `index${ext}`);
            if (this.files.has(indexPath)) return indexPath;
        }
        return null;
    }
}
