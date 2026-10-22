import { getCropData, getMetadata } from "./data";

/**
 * Crops with a /rankings page. Mirrors RANKING_CROPS in scripts/refresh-data.py —
 * Python can't share this constant, so keep the two lists in sync manually.
 */
export const RANKING_CROP_LIST = [
  "Coffee", "Cocoa", "Rice", "Wheat", "Sugar Cane", "Bananas", "Tea",
  "Seed Cotton", "Maize", "Potatoes", "Olives", "Grapes", "Cassava", "Oil Palm",
];

/**
 * Decides which /explore/:country/:crop pages are worth asking Google to index.
 *
 * Every country × crop pair with data gets a page (~2,200 of them), but most are
 * minor producers ("Oats in Zimbabwe") whose page is a templated restatement of
 * FAOSTAT. Submitting all of them reads as scaled thin content and drags down the
 * site's overall quality signal. Only the pairs where the country is a meaningful
 * African producer go in the sitemap and stay indexable; the rest are served as
 * normal pages with `noindex, follow` so users and link equity still flow.
 */
export const TOP_N_PRODUCERS = 5;
export const MIN_AFRICA_SHARE = 0.05;

export interface ExplorePair {
  /** Latest-year production, in the units stored in crop_metrics. */
  production: number;
  /** Share of total African production of this crop, using each country's latest year. */
  share: number;
  /** 1-based rank among African producers of this crop. */
  rank: number;
  indexable: boolean;
}

interface ExploreIndex {
  version: string;
  pairs: Map<string, ExplorePair>;
}

let cache: ExploreIndex | null = null;

function key(country: string, crop: string): string {
  return `${country}|${crop}`;
}

/** Builds the pair index from raw crop data. Exported for tests. */
export function buildExploreIndex(
  cropData: Record<string, Record<string, { production: Record<string, number> }>>
): Map<string, ExplorePair> {
  const byCrop = new Map<string, { country: string; production: number }[]>();

  for (const [country, crops] of Object.entries(cropData)) {
    for (const [crop, data] of Object.entries(crops)) {
      const years = Object.keys(data.production || {})
        .filter((y) => (data.production[y] || 0) > 0)
        .sort();
      if (years.length === 0) continue;
      const production = data.production[years[years.length - 1]];
      if (!byCrop.has(crop)) byCrop.set(crop, []);
      byCrop.get(crop)!.push({ country, production });
    }
  }

  const pairs = new Map<string, ExplorePair>();
  byCrop.forEach((producers, crop) => {
    const total = producers.reduce((sum, p) => sum + p.production, 0);
    producers
      .sort((a, b) => b.production - a.production)
      .forEach((p, i) => {
        const share = total > 0 ? p.production / total : 0;
        const rank = i + 1;
        pairs.set(key(p.country, crop), {
          production: p.production,
          share,
          rank,
          indexable: rank <= TOP_N_PRODUCERS || share >= MIN_AFRICA_SHARE,
        });
      });
  });
  return pairs;
}

function getIndex(): Map<string, ExplorePair> {
  const version = getMetadata().lastUpdated;
  if (!cache || cache.version !== version) {
    cache = { version, pairs: buildExploreIndex(getCropData()) };
  }
  return cache.pairs;
}

/** The pair's stats, or null when the country has no production data for the crop. */
export function getExplorePair(countryName: string, crop: string): ExplorePair | null {
  return getIndex().get(key(countryName, crop)) || null;
}

export function isIndexableExplore(countryName: string, crop: string): boolean {
  return getExplorePair(countryName, crop)?.indexable ?? false;
}
