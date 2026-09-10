/**
 * Computes verified stats straight from global_crop_rankings / crop_metrics,
 * so social-card copy never carries a hand-typed arithmetic mistake. Each
 * function returns plain numbers/strings meant to be substituted into a
 * card config's text via {{token}} placeholders (see generate-photo-card.mjs).
 */
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, "..", "..", "server", "data", "afrixplorer.db");

function fmt(v) {
  return Number(v).toLocaleString(undefined, { maximumFractionDigits: 1, minimumFractionDigits: 1 });
}

function pct(v) {
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(1)}%`;
}

/** primary country's production vs the sum of one or more other countries, same crop/year. */
export function compare(crop, primaryCountry, otherCountries) {
  const db = new Database(DB_PATH, { readonly: true });
  const get = db.prepare(
    "SELECT production, year FROM global_crop_rankings WHERE crop = ? AND country = ?"
  );
  const primary = get.get(crop, primaryCountry);
  if (!primary) throw new Error(`No ranking row for ${primaryCountry} / ${crop}`);

  const others = otherCountries.map((c) => {
    const row = get.get(crop, c);
    if (!row) throw new Error(`No ranking row for ${c} / ${crop}`);
    return { country: c, production: row.production };
  });
  const othersSum = others.reduce((s, o) => s + o.production, 0);
  db.close();

  return {
    year: primary.year,
    primaryValue: fmt(primary.production),
    primaryValueRaw: primary.production,
    othersSum: fmt(othersSum),
    othersSumRaw: othersSum,
    ratio: (primary.production / othersSum).toFixed(2),
    others: others.map((o) => ({ ...o, value: fmt(o.production) })),
  };
}

/** year-over-year change for one country/crop from crop_metrics (production element). */
export function yoy(country, crop, year1, year2) {
  const db = new Database(DB_PATH, { readonly: true });
  const get = db.prepare(
    "SELECT value FROM crop_metrics WHERE country = ? AND crop = ? AND element = 'production' AND year = ?"
  );
  const v1 = get.get(country, crop, year1);
  const v2 = get.get(country, crop, year2);
  db.close();
  if (!v1 || !v2) throw new Error(`Missing production data for ${country}/${crop} in ${year1} or ${year2}`);

  const change = ((v2.value - v1.value) / v1.value) * 100;
  return {
    year1,
    year2,
    value1: fmt(v1.value),
    value2: fmt(v2.value),
    changePct: pct(change),
    changePctAbs: Math.abs(change).toFixed(1),
    direction: change >= 0 ? "up" : "down",
  };
}

/** combined share of world (top-30) production held by a set of countries. */
export function share(crop, countries) {
  const db = new Database(DB_PATH, { readonly: true });
  const get = db.prepare(
    "SELECT production, year FROM global_crop_rankings WHERE crop = ? AND country = ?"
  );
  const { total } = db
    .prepare("SELECT SUM(production) AS total FROM global_crop_rankings WHERE crop = ?")
    .get(crop);

  const rows = countries.map((c) => {
    const row = get.get(crop, c);
    if (!row) throw new Error(`No ranking row for ${c} / ${crop}`);
    return row;
  });
  db.close();

  const combined = rows.reduce((s, r) => s + r.production, 0);
  const pctShare = (combined / total) * 100;

  return {
    year: rows[0].year,
    combined: fmt(combined),
    combinedRaw: combined,
    total: fmt(total),
    totalRaw: total,
    pctShare: pctShare.toFixed(1),
  };
}

/** a country's world rank + value for a crop, from global_crop_rankings (top 30 only). */
export function rank(crop, country) {
  const db = new Database(DB_PATH, { readonly: true });
  const row = db
    .prepare("SELECT rank, production, year FROM global_crop_rankings WHERE crop = ? AND country = ?")
    .get(crop, country);
  db.close();
  if (!row) throw new Error(`${country} not in top-30 ranking for ${crop} (may rank lower or have no data)`);
  return { rank: row.rank, value: fmt(row.production), year: row.year };
}

/** Deep-substitutes {{token}} placeholders in any string/array/object using a flat stats object. */
export function fillTemplate(node, stats) {
  if (typeof node === "string") {
    return node.replace(/\{\{(\w+)\}\}/g, (_, key) => {
      if (!(key in stats)) throw new Error(`Unknown template token {{${key}}}`);
      return stats[key];
    });
  }
  if (Array.isArray(node)) return node.map((n) => fillTemplate(n, stats));
  if (node && typeof node === "object") {
    const out = {};
    for (const [k, v] of Object.entries(node)) out[k] = fillTemplate(v, stats);
    return out;
  }
  return node;
}
