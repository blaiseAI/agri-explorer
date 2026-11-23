// Display formatting for FAOSTAT units. The data keeps FAOSTAT's units
// (production in thousands of tonnes, area in thousands of hectares, yield in
// hectograms per hectare); people read tonnes, hectares and t/ha.

function compact(thousands: number, unit: string): string {
  const v = thousands * 1000;
  if (v >= 1e6) return `${(v / 1e6).toFixed(v >= 1e7 ? 0 : 1)}M ${unit}`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(v >= 1e4 ? 0 : 1)}K ${unit}`;
  return `${Math.round(v)} ${unit}`;
}

/** Production arrives in thousands of tonnes: 62624.9 -> "63M t". */
export function formatTonnes(kt: number): string {
  return compact(kt, "t");
}

/** Area arrives in thousands of hectares: 1086.9 -> "1.1M ha". */
export function formatArea(kha: number): string {
  return compact(kha, "ha");
}

/** Yield arrives in hectograms per hectare: 58405 -> "5.8 t/ha". */
export function formatYield(hgHa: number): string {
  const t = hgHa / 10000;
  return `${t >= 10 ? t.toFixed(0) : t.toFixed(1)} t/ha`;
}

/** Axis ticks for a yield axis in hg/ha, shown as plain t/ha numbers. */
export function yieldTick(hgHa: number): string {
  const t = hgHa / 10000;
  return t >= 10 || t === 0 ? t.toFixed(0) : t.toFixed(1);
}
