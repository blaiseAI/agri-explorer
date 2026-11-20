/** Number of colour classes on the map (and swatches in the legend). */
export const CLASS_COUNT = 5;

/**
 * Quantile class breaks: each class holds roughly the same number of countries.
 * Production is extremely skewed (Nigeria grows ~60x the median cassava producer),
 * so equal-interval classes would paint almost every country the lightest step.
 * Returns CLASS_COUNT - 1 ascending upper bounds.
 */
export function quantileBreaks(values: number[], classes = CLASS_COUNT): number[] {
  const sorted = values.filter((v) => Number.isFinite(v) && v > 0).sort((a, b) => a - b);
  if (sorted.length === 0) return [];
  const breaks: number[] = [];
  for (let i = 1; i < classes; i++) {
    const idx = Math.min(sorted.length - 1, Math.floor((i * sorted.length) / classes));
    breaks.push(sorted[idx]);
  }
  // Collapse duplicate breaks (few producers, or many equal values).
  return breaks.filter((b, i) => i === 0 || b > breaks[i - 1]);
}

/** Class index 0..breaks.length for a value, or -1 for no data. */
export function classify(value: number | undefined, breaks: number[]): number {
  if (value === undefined || !Number.isFinite(value) || value <= 0) return -1;
  let i = 0;
  while (i < breaks.length && value >= breaks[i]) i++;
  return i;
}

/** Production arrives in thousands of tonnes. */
export function formatTonnes(kt: number): string {
  const t = kt * 1000;
  if (t >= 1e6) return `${(t / 1e6).toFixed(t >= 1e7 ? 0 : 1)}M t`;
  if (t >= 1e3) return `${(t / 1e3).toFixed(t >= 1e4 ? 0 : 1)}K t`;
  return `${Math.round(t)} t`;
}

/** Yield arrives in hectograms per hectare. */
export function formatYield(hgHa: number): string {
  const t = hgHa / 10000;
  return `${t >= 10 ? t.toFixed(0) : t.toFixed(1)} t/ha`;
}
