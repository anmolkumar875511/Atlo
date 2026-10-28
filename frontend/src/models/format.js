const UNITS = ['B', 'KB', 'MB', 'GB'];

// 1536 -> "1.5 KB"
export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const digits = unit === 0 || value >= 10 ? 0 : 1;
  return `${value.toFixed(digits)} ${UNITS[unit]}`;
}

// 420 -> "420 ms", 2300 -> "2.3 s"
export function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '—';
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`;
}

// (1, "file") -> "1 file", (3, "file") -> "3 files"
export function plural(count, word) {
  return `${count.toLocaleString('en-US')} ${word}${count === 1 ? '' : 's'}`;
}
