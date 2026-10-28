import { posix } from 'node:path';

// Folders that hold dependencies, build output or tool caches — never user code.
const IGNORED_DIRS = new Set([
    'node_modules',
    'bower_components',
    'vendor',
    '.git',
    '.hg',
    '.svn',
    'dist',
    'build',
    'out',
    'coverage',
    '.next',
    '.nuxt',
    '.svelte-kit',
    '.turbo',
    '.cache',
    '__pycache__',
    '.venv',
    'venv',
    '.tox',
    '.mypy_cache',
    '.pytest_cache',
    '.idea',
    '.vscode',
]);

const IGNORED_FILES = new Set([
    'package-lock.json',
    'yarn.lock',
    'pnpm-lock.yaml',
    'bun.lockb',
    'poetry.lock',
    'Pipfile.lock',
    '.DS_Store',
    'Thumbs.db',
]);

const IGNORED_SUFFIXES = ['.min.js', '.min.css', '.map'];

const BINARY_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.ico', '.svgz', '.tiff', '.psd',
  '.woff', '.woff2', '.ttf', '.otf', '.eot',
  '.zip', '.gz', '.tgz', '.bz2', '.xz', '.7z', '.rar', '.tar', '.jar',
  '.mp3', '.mp4', '.mov', '.avi', '.wav', '.ogg', '.webm', '.flac',
  '.pdf', '.wasm', '.exe', '.dll', '.so', '.dylib', '.bin', '.class', '.pyc', '.o',
  '.sqlite', '.db',
]); // prettier-ignore

const LANGUAGE_BY_EXTENSION = {
    '.js': 'js',
    '.jsx': 'js',
    '.mjs': 'js',
    '.cjs': 'js',
    '.ts': 'ts',
    '.tsx': 'ts',
    '.mts': 'ts',
    '.cts': 'ts',
    '.py': 'py',
};

export function detectLanguage(path) {
    return LANGUAGE_BY_EXTENSION[posix.extname(path).toLowerCase()] ?? 'other';
}

// Decides whether a file should be indexed. Pure function: easy to test and reuse.
export function classifyPath(path, size, limits) {
    const segments = path.split('/');
    const fileName = segments[segments.length - 1];

    if (segments.slice(0, -1).some((s) => IGNORED_DIRS.has(s))) {
        return { include: false, reason: 'ignored' };
    }
    if (IGNORED_FILES.has(fileName) || IGNORED_SUFFIXES.some((s) => fileName.endsWith(s))) {
        return { include: false, reason: 'ignored' };
    }
    if (BINARY_EXTENSIONS.has(posix.extname(fileName).toLowerCase())) {
        return { include: false, reason: 'binary' };
    }
    if (size > limits.maxFileBytes) {
        return { include: false, reason: 'tooLarge' };
    }
    return { include: true };
}
