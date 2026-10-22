import { InvalidRepoUrlError } from '../../lib/errors.js';

const OWNER_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const REPO_RE = /^[A-Za-z0-9._-]{1,100}$/;
const REF_RE = /^[A-Za-z0-9._/-]{1,200}$/;

export function parseGithubUrl(input) {
  if (typeof input !== 'string' || !input.trim()) {
    throw new InvalidRepoUrlError('Please enter a GitHub repository URL.');
  }

  let raw = input.trim();

  const scheme = raw.match(/^([a-z][a-z0-9+.-]*):\/\//i);
  if (scheme && !/^https?$/i.test(scheme[1])) {
    throw new InvalidRepoUrlError('Only https://github.com URLs are supported.');
  }

  raw = raw.replace(/^https?:\/\//i, '').replace(/^www\./i, '');
  raw = raw.split(/[?#]/)[0];

  if (/^github\.com\//i.test(raw)) {
    raw = raw.replace(/^github\.com\//i, '');
  } else if (raw.split('/')[0].includes('.')) {
    // Looks like another host, e.g. gitlab.com/x/y
    throw new InvalidRepoUrlError('Only github.com repositories are supported.');
  }

  const segments = raw.split('/').filter(Boolean);
  if (segments.length < 2) {
    throw new InvalidRepoUrlError('Use the form https://github.com/owner/repository.');
  }

  const owner = segments[0];
  const name = segments[1].replace(/\.git$/i, '');

  if (!OWNER_RE.test(owner) || !REPO_RE.test(name) || name === '.' || name === '..') {
    throw new InvalidRepoUrlError('That does not look like a valid GitHub owner/repository.');
  }

  let ref = null;
  if (segments[2] === 'tree' && segments[3]) {
    try {
      ref = decodeURIComponent(segments[3]);
    } catch {
      throw new InvalidRepoUrlError('The branch or tag in the URL is not valid.');
    }
    if (!REF_RE.test(ref) || ref.includes('..')) {
      throw new InvalidRepoUrlError('The branch or tag in the URL is not valid.');
    }
  }

  return { owner, name, ref, url: `https://github.com/${owner}/${name}` };
}
