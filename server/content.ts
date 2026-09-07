import { getCropData, getYears, getGlobalAvgYields, getMetadata, type GlobalRankingRow } from "./data";
import { resolveCountry, type ResolvedCountry } from "./resolve";

interface YearRow {
  year: string;
  production: number;
  yield: number;
  area: number;
}

function buildSeries(country: string, crop: string): YearRow[] {
  const cropData = getCropData()[country]?.[crop];
  if (!cropData) return [];
  return getYears()
    .map((year) => ({
      year,
      production: cropData.production[year] || 0,
      yield: cropData.yield[year] || 0,
      area: cropData.area[year] || 0,
    }))
    .filter((r) => r.production > 0 || r.yield > 0 || r.area > 0);
}

function lastUpdatedDate(): string {
  const meta = getMetadata();
  return meta.lastUpdated ? meta.lastUpdated.substring(0, 10) : "2024-01-01";
}

/** Renders the static fallback body content for an /explore/:country/:crop page. */
export function renderExploreContent(country: ResolvedCountry, crop: string): string {
  const series = buildSeries(country.name, crop);
  if (series.length === 0) return "";

  const first = series[0];
  const last = series[series.length - 1];
  const growth = first.production > 0
    ? (((last.production - first.production) / first.production) * 100).toFixed(1)
    : "0";
  const globalAvgYield = getGlobalAvgYields()[crop] || null;
  const yieldGap = globalAvgYield && last.yield
    ? Math.round(((globalAvgYield - last.yield) / globalAvgYield) * 100)
    : null;

  const rows = series
    .map((r) => `<tr><td>${r.year}</td><td>${r.production.toLocaleString()}</td><td>${r.yield.toLocaleString()}</td><td>${r.area.toLocaleString()}</td></tr>`)
    .join("");

  const yieldSentence = yieldGap !== null && yieldGap > 0
    ? `Yield in ${last.year} was ${last.yield.toLocaleString()} hg/ha, ${yieldGap}% below the Africa average of ${globalAvgYield!.toLocaleString()} hg/ha.`
    : yieldGap !== null
      ? `Yield in ${last.year} was ${last.yield.toLocaleString()} hg/ha, above the Africa average of ${globalAvgYield!.toLocaleString()} hg/ha.`
      : "";

  return `
    <h1>${crop} Production in ${country.name}</h1>
    <p>${country.name} produced ${last.production.toLocaleString()} thousand tonnes of ${crop} in ${last.year}, a ${growth}% change from ${first.year}. ${yieldSentence}</p>
    <table>
      <thead><tr><th>Year</th><th>Production (K tonnes)</th><th>Yield (hg/ha)</th><th>Area (K ha)</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p>Source: FAOSTAT and World Bank, via Afrixplorer. Last updated ${lastUpdatedDate()}.</p>
  `;
}

/** Renders the static fallback body content for a /country/:id page. */
export function renderCountryContent(country: ResolvedCountry): string {
  const countryData = getCropData()[country.name];
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
    .map((c) => `<tr><td>${c.name}</td><td>${c.production.toLocaleString()}</td></tr>`)
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
  const CROP_DATA = getCropData();
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
    .map((c) => `<tr><td>${c.country}</td><td>${c.production.toLocaleString()}</td></tr>`)
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
