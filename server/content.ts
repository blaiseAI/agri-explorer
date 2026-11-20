import { getCropData, getYears, getGlobalAvgYields, getMetadata, getCountries, getCrops, type GlobalRankingRow } from "./data";
import { resolveCountry, type ResolvedCountry } from "./resolve";
import { RANKING_CROP_LIST, getExplorePair, isIndexableExplore } from "./indexing";


let cropDataCache: { version: string; data: ReturnType<typeof getCropData> } | null = null;

/**
 * getCropData() re-reads every crop_metrics row (~60 ms), and an explore page needs
 * it several times. Cache it per data refresh, keyed on metadata.lastUpdated like
 * indexing.ts does.
 */
function cropData(): ReturnType<typeof getCropData> {
  const version = getMetadata().lastUpdated;
  if (!cropDataCache || cropDataCache.version !== version) {
    cropDataCache = { version, data: getCropData() };
  }
  return cropDataCache.data;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function cropLink(crop: string): string {
  return `<a href="/crop/${encodeURIComponent(crop)}">${escapeHtml(crop)}</a>`;
}

function countryLink(country: { name: string; code: string }): string {
  return `<a href="/country/${country.code}">${escapeHtml(country.name)}</a>`;
}

interface YearRow {
  year: string;
  production: number;
  yield: number;
  area: number;
}

function buildSeries(country: string, crop: string): YearRow[] {
  const series = cropData()[country]?.[crop];
  if (!series) return [];
  return getYears()
    .map((year) => ({
      year,
      production: series.production[year] || 0,
      yield: series.yield[year] || 0,
      area: series.area[year] || 0,
    }))
    .filter((r) => r.production > 0 || r.yield > 0 || r.area > 0);
}

function lastUpdatedDate(): string {
  const meta = getMetadata();
  return meta.lastUpdated ? meta.lastUpdated.substring(0, 10) : "2024-01-01";
}

function pct(n: number, digits = 1): string {
  return `${Math.abs(n).toFixed(digits)}%`;
}

function changePct(from: number, to: number): number | null {
  return from > 0 && to > 0 ? ((to - from) / from) * 100 : null;
}

function ordinalRank(rank: number): string {
  return rank === 1 ? "largest" : `#${rank}`;
}

/** African producers of a crop by latest-year production, highest first (same basis as indexing.ts). */
function africanProducers(crop: string): { name: string; code: string; production: number; share: number }[] {
  const out: { name: string; code: string; production: number; share: number }[] = [];
  for (const name of Object.keys(cropData())) {
    const pair = getExplorePair(name, crop);
    const resolved = pair ? resolveCountry(name) : null;
    if (pair && resolved) out.push({ name, code: resolved.code, production: pair.production, share: pair.share });
  }
  return out.sort((a, b) => b.production - a.production);
}

/** A country's other crops with indexable explore pages, largest first. */
function otherMajorCrops(countryName: string, excludeCrop: string, limit: number): string[] {
  const crops = cropData()[countryName] || {};
  return Object.keys(crops)
    .filter((c) => c !== excludeCrop && isIndexableExplore(countryName, c))
    .map((c) => ({ c, production: getExplorePair(countryName, c)!.production }))
    .sort((a, b) => b.production - a.production)
    .slice(0, limit)
    .map((x) => x.c);
}

function exploreLink(code: string, crop: string, text: string): string {
  return `<a href="/explore/${code}/${encodeURIComponent(crop)}">${escapeHtml(text)}</a>`;
}

/** One or two sentences on whether production growth came from more land or better yields. */
function trendDriverSentence(first: YearRow, last: YearRow, crop: string): string {
  const prod = changePct(first.production, last.production);
  const area = changePct(first.area, last.area);
  const yld = changePct(first.yield, last.yield);
  if (prod === null || area === null || yld === null) return "";

  const span = `${first.year} and ${last.year}`;
  const areaPart = `harvested area ${area >= 0 ? "grew" : "shrank"} ${pct(area)}`;
  const yieldPart = `yield per hectare ${yld >= 0 ? "rose" : "fell"} ${pct(yld)}`;

  if (prod >= 0 && area > 0 && yld <= 0) {
    return `Between ${span}, ${areaPart} while ${yieldPart}, so the increase in ${crop} output came from planting more land rather than from farming it more productively.`;
  }
  if (prod >= 0 && yld > 0 && area <= 0) {
    return `Between ${span}, ${yieldPart} while ${areaPart}, so the increase in ${crop} output came from higher productivity rather than more land.`;
  }
  if (prod >= 0) {
    const driver = area >= yld ? "expanding harvested area" : "rising yields";
    return `Between ${span}, ${areaPart} and ${yieldPart}; ${driver} contributed more to the increase.`;
  }
  return `Between ${span}, ${areaPart} and ${yieldPart}, and total ${crop} output declined.`;
}

/** Renders the static fallback body content for an /explore/:country/:crop page. */
export function renderExploreContent(country: ResolvedCountry, crop: string): string {
  const series = buildSeries(country.name, crop);
  if (series.length === 0) return "";

  const cropName = escapeHtml(crop);
  const first = series[0];
  const last = series[series.length - 1];
  const prev = series.length > 1 ? series[series.length - 2] : null;
  const growth = changePct(first.production, last.production);
  const peak = series.reduce((best, r) => (r.production > best.production ? r : best), first);
  const years = Number(last.year) - Number(first.year);
  const cagr = growth !== null && years > 0
    ? (Math.pow(last.production / first.production, 1 / years) - 1) * 100
    : null;

  const pair = getExplorePair(country.name, crop);
  const producers = africanProducers(crop);
  const avgYield = getGlobalAvgYields()[crop] || null;
  const yieldGap = avgYield && last.yield ? ((last.yield - avgYield) / avgYield) * 100 : null;

  // Lead
  const growthClause = growth !== null
    ? `, ${growth >= 0 ? "up" : "down"} ${pct(growth)} from ${first.production.toLocaleString()} thousand tonnes in ${first.year}`
    : "";
  const lead = `${country.name} produced ${last.production.toLocaleString()} thousand tonnes of ${cropName} in ${last.year}${growthClause}.`;

  // How it compares
  const compare: string[] = [];
  if (pair) {
    compare.push(
      `${country.name} is Africa's ${ordinalRank(pair.rank)} producer of ${cropName}, accounting for ${pct(pair.share * 100)} of African ${cropName} output across ${producers.length} producing ${producers.length === 1 ? "country" : "countries"}.`
    );
    if (pair.rank > 1 && producers[0]) {
      compare.push(`The continent's largest producer is ${exploreLink(producers[0].code, crop, producers[0].name)}, with ${producers[0].production.toLocaleString()} thousand tonnes.`);
    }
  }
  if (yieldGap !== null && avgYield) {
    compare.push(
      Math.abs(yieldGap) < 2
        ? `Its yield of ${last.yield.toLocaleString()} hg/ha in ${last.year} is in line with the average across African producers (${avgYield.toLocaleString()} hg/ha).`
        : `Its yield of ${last.yield.toLocaleString()} hg/ha in ${last.year} is ${pct(yieldGap, 0)} ${yieldGap < 0 ? "below" : "above"} the average across African producers (${avgYield.toLocaleString()} hg/ha)${yieldGap <= -15 ? ", which points to room for productivity gains through improved inputs, varieties or irrigation" : ""}.`
    );
  }
  if (RANKING_CROP_LIST.includes(crop)) {
    compare.push(`See how African producers stack up globally in the <a href="/rankings/${encodeURIComponent(crop)}">world ${cropName} production ranking</a>.`);
  }

  // Trend
  const trend: string[] = [];
  if (cagr !== null) {
    trend.push(`Output changed at an average rate of ${cagr >= 0 ? "+" : "−"}${pct(cagr)} per year over ${years} years.`);
  }
  if (peak !== last) {
    trend.push(`Production peaked in ${peak.year} at ${peak.production.toLocaleString()} thousand tonnes; ${last.year} output was ${pct(((peak.production - last.production) / peak.production) * 100)} below that peak.`);
  } else if (series.length > 1) {
    trend.push(`${last.year} was the peak year for ${cropName} production in the period covered.`);
  }
  if (prev) {
    const yoy = changePct(prev.production, last.production);
    if (yoy !== null) trend.push(`Year on year, production ${yoy >= 0 ? "rose" : "fell"} ${pct(yoy)} from ${prev.year} to ${last.year}.`);
  }
  const driver = trendDriverSentence(first, last, cropName);
  if (driver) trend.push(driver);

  // Related links
  const peers = producers.filter((p) => p.code !== country.code && isIndexableExplore(p.name, crop)).slice(0, 6);
  const peerList = peers.length > 0
    ? `
    <h2>Other leading ${cropName} producers in Africa</h2>
    <ul>${peers.map((p) => `<li>${exploreLink(p.code, crop, `${crop} production in ${p.name}`)}: ${p.production.toLocaleString()} thousand tonnes (${pct(p.share * 100)} of African output)</li>`).join("")}</ul>`
    : "";
  const others = otherMajorCrops(country.name, crop, 8);
  const otherList = others.length > 0
    ? `
    <h2>Other major crops in ${escapeHtml(country.name)}</h2>
    <ul>${others.map((c) => `<li>${exploreLink(country.code, c, `${c} production in ${country.name}`)}</li>`).join("")}</ul>
    <p>See all crops on the ${countryLink(country)} agricultural overview, or compare every producer on the ${cropLink(crop)} page.</p>`
    : `<p>See all crops on the ${countryLink(country)} agricultural overview, or compare every producer on the ${cropLink(crop)} page.</p>`;

  const rows = series
    .map((r) => `<tr><td>${r.year}</td><td>${r.production.toLocaleString()}</td><td>${r.yield.toLocaleString()}</td><td>${r.area.toLocaleString()}</td></tr>`)
    .join("");

  return `
    <nav aria-label="Breadcrumb"><a href="/">Home</a> › ${countryLink(country)} › ${cropLink(crop)}</nav>
    <h1>${cropName} Production in ${escapeHtml(country.name)}</h1>
    <p>${lead}</p>
    ${compare.length > 0 ? `<h2>How ${escapeHtml(country.name)} compares</h2>\n    <p>${compare.join(" ")}</p>` : ""}
    ${trend.length > 0 ? `<h2>${cropName} production trend, ${first.year}–${last.year}</h2>\n    <p>${trend.join(" ")}</p>` : ""}
    <h2>Year-by-year ${cropName} data for ${escapeHtml(country.name)}</h2>
    <table>
      <thead><tr><th>Year</th><th>Production (K tonnes)</th><th>Yield (hg/ha)</th><th>Area (K ha)</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    ${peerList}
    ${otherList}
    <p>Source: FAOSTAT and World Bank, via Afrixplorer. Last updated ${lastUpdatedDate()}.</p>
  `;
}

/** Renders the static fallback body content for a /country/:id page. */
export function renderCountryContent(country: ResolvedCountry): string {
  const countryData = cropData()[country.name];
  if (!countryData) return "";
  const crops = Object.entries(countryData)
    .map(([name, data]) => {
      const years = Object.keys(data.production).sort();
      const latest = years[years.length - 1];
      return { name, production: data.production[latest] || 0 };
    })
    .filter((c) => c.production > 0)
    .sort((a, b) => b.production - a.production)
    .slice(0, 15);

  if (crops.length === 0) return "";

  const rows = crops
    .map((c) => `<tr><td><a href="/explore/${country.code}/${encodeURIComponent(c.name)}">${escapeHtml(c.name)}</a></td><td>${c.production.toLocaleString()}</td></tr>`)
    .join("");

  return `
    <h1>${country.name} Agricultural Data</h1>
    <p>${country.name} produces ${crops.length}+ tracked crops. Its top crop by production volume is ${crops[0].name}, at ${crops[0].production.toLocaleString()} thousand tonnes in the most recent year on record.</p>
    <table>
      <thead><tr><th>Crop</th><th>Latest Production (K tonnes)</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p>Source: FAOSTAT and World Bank, via Afrixplorer. Last updated ${lastUpdatedDate()}.</p>
  `;
}

/** Renders the static fallback body content for a /rankings/:crop page. */
export function renderRankingsContent(crop: string, rows: GlobalRankingRow[]): string {
  if (rows.length === 0) return "";

  const top = rows[0];
  const africanRows = rows.filter((r) => r.code !== null);

  const worldRows = rows
    .map((r) => {
      const countryCell = r.code
        ? `<a href="/country/${r.code}">${r.country}</a>`
        : r.country;
      const yoy = r.yoyPct !== null ? `${r.yoyPct > 0 ? "+" : ""}${r.yoyPct}%` : "—";
      return `<tr><td>${r.rank}</td><td>${countryCell}</td><td>${r.production.toLocaleString()}</td><td>${r.yield.toLocaleString()}</td><td>${r.area.toLocaleString()}</td><td>${yoy}</td></tr>`;
    })
    .join("");

  const africaSection = africanRows.length > 0
    ? `
    <h2>${crop} in Africa</h2>
    <p>${africanRows.length} African ${africanRows.length === 1 ? "country ranks" : "countries rank"} in the global top ${rows.length}: ${africanRows.map((r) => `${r.country} (#${r.rank})`).join(", ")}.</p>
    <table>
      <thead><tr><th>Rank</th><th>Country</th><th>Production (K tonnes)</th></tr></thead>
      <tbody>${africanRows.map((r) => `<tr><td>${r.rank}</td><td><a href="/explore/${r.code}/${encodeURIComponent(crop)}">${r.country}</a></td><td>${r.production.toLocaleString()}</td></tr>`).join("")}</tbody>
    </table>
    `
    : `<p>No African country appears in the global top ${rows.length} for ${crop} in this dataset.</p>`;

  return `
    <h1>${crop} Production by Country — World Ranking</h1>
    <p>${top.country} is the world's largest ${crop} producer, at ${top.production.toLocaleString()} thousand tonnes in ${top.year}${rows.length > 1 ? `, followed by ${rows[1].country}${rows.length > 2 ? ` and ${rows[2].country}` : ""}` : ""}.</p>
    <table>
      <thead><tr><th>Rank</th><th>Country</th><th>Production (K tonnes)</th><th>Yield (hg/ha)</th><th>Area (K ha)</th><th>YoY</th></tr></thead>
      <tbody>${worldRows}</tbody>
    </table>
    ${africaSection}
  `;
}

/** Renders the static fallback body content for a /crop/:name page. */
export function renderCropContent(crop: string): string {
  const CROP_DATA = cropData();
  const countries = Object.entries(CROP_DATA)
    .map(([countryName, crops]) => {
      const data = crops[crop];
      if (!data) return null;
      const years = Object.keys(data.production).sort();
      const latest = years[years.length - 1];
      return { country: countryName, production: data.production[latest] || 0 };
    })
    .filter((c): c is { country: string; production: number } => !!c && c.production > 0)
    .sort((a, b) => b.production - a.production)
    .slice(0, 15);

  if (countries.length === 0) return "";

  const rows = countries
    .map((c) => {
      const resolved = resolveCountry(c.country);
      const cell = resolved
        ? `<a href="/explore/${resolved.code}/${encodeURIComponent(crop)}">${escapeHtml(c.country)}</a>`
        : escapeHtml(c.country);
      return `<tr><td>${cell}</td><td>${c.production.toLocaleString()}</td></tr>`;
    })
    .join("");

  return `
    <h1>${crop} Production Data Across Africa</h1>
    <p>${countries[0].country} is the largest producer of ${crop} in this dataset, at ${countries[0].production.toLocaleString()} thousand tonnes in the most recent year on record, across ${countries.length} producing countries tracked.</p>
    <table>
      <thead><tr><th>Country</th><th>Latest Production (K tonnes)</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p>Source: FAOSTAT and World Bank, via Afrixplorer. Last updated ${lastUpdatedDate()}.</p>
  `;
}

/** Renders the static fallback body content for the homepage: an intro plus links into every hub. */
export function renderHomeContent(): string {
  const countries = getCountries() as ResolvedCountry[];
  const crops = getCrops();
  const years = getYears();
  const span = years.length > 0 ? `${years[0]}–${years[years.length - 1]}` : "2010–2024";

  return `
    <h1>Crop Production Data for ${countries.length} African Countries</h1>
    <p>Historical production, yield, and trade data for ${crops.length} crops across ${countries.length} African countries, ${span}, sourced from FAOSTAT and the World Bank. Last updated ${lastUpdatedDate()}.</p>
    <h2>World production rankings</h2>
    <ul>${RANKING_CROP_LIST.map((c) => `<li><a href="/rankings/${encodeURIComponent(c)}">${escapeHtml(c)} production by country</a></li>`).join("")}</ul>
    <h2>Browse by country</h2>
    <ul>${countries.map((c) => `<li>${countryLink(c)}</li>`).join("")}</ul>
    <p><a href="/countries">All countries</a> · <a href="/crops">All crops</a> · <a href="/about">Methodology &amp; sources</a></p>
  `;
}

/** Renders the static fallback body content for /countries, grouped by region. */
export function renderCountriesIndexContent(): string {
  const countries = getCountries() as ResolvedCountry[];
  const byRegion = new Map<string, ResolvedCountry[]>();
  for (const c of countries) {
    const region = c.region || "Other";
    if (!byRegion.has(region)) byRegion.set(region, []);
    byRegion.get(region)!.push(c);
  }
  const sections = Array.from(byRegion.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([region, list]) => `
    <h2>${escapeHtml(region)}</h2>
    <ul>${list.sort((a, b) => a.name.localeCompare(b.name)).map((c) => `<li>${countryLink(c)}</li>`).join("")}</ul>`)
    .join("");

  return `
    <h1>Agricultural Data for ${countries.length} African Countries</h1>
    <p>Crop production, yields, area harvested, and trade data for every African country, sourced from FAOSTAT and the World Bank.</p>
    ${sections}
  `;
}

/** Renders the static fallback body content for /crops: every crop, linked. */
export function renderCropsIndexContent(): string {
  const crops = [...getCrops()].sort((a, b) => a.localeCompare(b));
  return `
    <h1>${crops.length} Crops Grown Across Africa</h1>
    <p>Production volumes, yield trends, and trade data for every crop tracked by FAOSTAT across African countries.</p>
    <h2>World production rankings</h2>
    <ul>${RANKING_CROP_LIST.map((c) => `<li><a href="/rankings/${encodeURIComponent(c)}">${escapeHtml(c)}</a></li>`).join("")}</ul>
    <h2>All crops</h2>
    <ul>${crops.map((c) => `<li>${cropLink(c)}</li>`).join("")}</ul>
  `;
}
