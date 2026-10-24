import { ERROR_CODES } from '../constants/errorCodes.js';

// Base class for every error we expect and can explain to the client.
export class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = new.target.name;
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export class ValidationError extends AppError {
  constructor(message, details) {
    super(400, ERROR_CODES.INVALID_INPUT, message, details);
  }
}

export class InvalidRepoUrlError extends AppError {
  constructor(message) {
    super(400, ERROR_CODES.INVALID_REPO_URL, message);
  }
}

export class RepoNotFoundError extends AppError {
  constructor() {
    super(
      404,
      ERROR_CODES.REPO_NOT_FOUND,
      'Repository not found. It may be private, renamed, or the URL has a typo.',
    );
  }
}

export class RepoTooLargeError extends AppError {
  constructor(message) {
    super(413, ERROR_CODES.REPO_TOO_LARGE, message);
  }
}

export class EmptyRepoError extends AppError {
  constructor() {
    super(422, ERROR_CODES.EMPTY_REPO, 'No analyzable source files were found in this repository.');
  }
}

export class InvalidArchiveError extends AppError {
  constructor() {
    super(422, ERROR_CODES.INVALID_ARCHIVE, 'The downloaded archive is corrupted or unreadable.');
  }
}

export class UpstreamRateLimitedError extends AppError {
  constructor() {
    super(
      429,
      ERROR_CODES.UPSTREAM_RATE_LIMITED,
      'GitHub is rate limiting us right now. Please try again in a minute.',
    );
  }
}

export class UpstreamError extends AppError {
  constructor(message = 'Could not download the repository from GitHub.') {
    super(502, ERROR_CODES.UPSTREAM_ERROR, message);
  }
}

export class UpstreamTimeoutError extends AppError {
  constructor() {
    super(504, ERROR_CODES.UPSTREAM_TIMEOUT, 'Downloading the repository took too long.');
  }
}

export class RateLimitedError extends AppError {
  constructor() {
    super(429, ERROR_CODES.RATE_LIMITED, 'Too many requests. Please slow down.');
  }
}

export class NotFoundError extends AppError {
  constructor(path) {
    super(404, ERROR_CODES.NOT_FOUND, `Route not found: ${path}`);
  }
}

export class SnapshotNotFoundError extends AppError {
  constructor() {
    super(
      404,
      ERROR_CODES.SNAPSHOT_NOT_FOUND,
      'This analysis has expired or does not exist. Analyze the repository again.',
    );
  }
}

export class FileNotFoundError extends AppError {
  constructor(path) {
    super(404, ERROR_CODES.FILE_NOT_FOUND, `File not found in this repository: ${path}`);
  }
}
