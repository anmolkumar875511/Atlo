// Heatmap colours, kept inside the Atlo palette: muted green (healthy), aged gold (watch),
// oxblood (hotspot). No neon, and still readable on the obsidian background.
const STOPS = [
  { at: 0, rgb: [95, 138, 106] },
  { at: 0.5, rgb: [216, 184, 100] },
  { at: 1, rgb: [176, 48, 74] },
];

const hex = (n) => Math.round(n).toString(16).padStart(2, '0');

// 0..1 -> "#rrggbb". Anything that is not a number counts as 0 (healthy).
export function heatColor(score) {
  const t = Math.max(0, Math.min(1, Number.isFinite(score) ? score : 0));
  const upper = STOPS.findIndex((s) => t <= s.at);
  const hi = STOPS[upper === -1 ? STOPS.length - 1 : upper];
  const lo = STOPS[Math.max(0, upper - 1)];
  const span = hi.at - lo.at || 1;
  const k = (t - lo.at) / span;
  const [r, g, b] = lo.rgb.map((c, i) => c + (hi.rgb[i] - c) * k);
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

export const HEAT_GRADIENT = `linear-gradient(90deg, ${heatColor(0)}, ${heatColor(0.5)}, ${heatColor(1)})`;

// "churn" -> "Churn from git history", "structural" -> "Structure only (no git history)"
export function basisLabel(health) {
  return health.basis === 'churn'
    ? 'Churn × complexity × coupling'
    : 'Complexity × coupling (no git history)';
}

const REASONS = {
  'git-missing': 'git is not installed on the server',
  timeout: 'reading git history took too long',
  'git-failed': 'the history could not be read (private repository, or GitHub refused the clone)',
  disabled: 'git history is turned off on the server',
};

export const churnReason = (reason) => REASONS[reason] ?? 'git history is unavailable';
