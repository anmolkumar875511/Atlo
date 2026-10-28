// Standard McCabe bands for a single function.
export function complexityLevel(value) {
  if (value <= 10) return 'low';
  if (value <= 20) return 'moderate';
  if (value <= 50) return 'high';
  return 'severe';
}

export const LEVEL_LABELS = {
  low: 'Simple',
  moderate: 'Moderate',
  high: 'Complex',
  severe: 'Very complex',
};
