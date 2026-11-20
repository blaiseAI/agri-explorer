import { getCropData, getYears, getGlobalAvgYields, getMetadata, getCountries, getCrops, getWorldBankData, type GlobalRankingRow } from "./data";
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

/** Thousand-tonne figures: whole numbers when large, one decimal when small so "3.4" doesn't round to "3". */
function kt(n: number): string {
  return n >= 100 ? Math.round(n).toLocaleString() : n.toLocaleString(undefined, { maximumFractionDigits: 1 });
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

/** Latest non-null value of a World Bank series, with its year. */
function latestIndicator(series: Record<string, number | null> | undefined): { year: string; value: number } | null {
  if (!series) return null;
  const years = Object.keys(series).filter((y) => series[y] !== null && series[y] !== undefined).sort();
  if (years.length === 0) return null;
  const year = years[years.length - 1];
  return { year, value: series[year] as number };
}

function earliestIndicator(series: Record<string, number | null> | undefined): { year: string; value: number } | null {
  if (!series) return null;
  const years = Object.keys(series).filter((y) => series[y] !== null && series[y] !== undefined).sort();
  return years.length > 0 ? { year: years[0], value: series[years[0]] as number } : null;
}

/** Links to an explore page when it's indexable, otherwise to the crop hub. */
function cropCellLink(country: ResolvedCountry, crop: string): string {
  return isIndexableExplore(country.name, crop)
    ? exploreLink(country.code, crop, crop)
    : cropLink(crop);
}

function listSentence(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** Renders the static fallback body content for a /country/:id page. */
export function renderCountryContent(country: ResolvedCountry): string {
  const countryData = cropData()[country.name];
  if (!countryData) return "";

  const name = escapeHtml(country.name);
  const crops = Object.keys(countryData)
    .map((crop) => ({ crop, pair: getExplorePair(country.name, crop) }))
    .filter((c): c is { crop: string; pair: NonNullable<typeof c.pair> } => c.pair !== null)
    .sort((a, b) => b.pair.production - a.pair.production);
  if (crops.length === 0) return "";

  const top = crops[0];
  const years = getYears();
  const span = years.length > 0 ? `${years[0]}–${years[years.length - 1]}` : "";

  // Agriculture in the economy (World Bank)
  const wb = getWorldBankData()[country.name] || {};
  const gdp = latestIndicator(wb.agGdpPct);
  const gdpStart = earliestIndicator(wb.agGdpPct);
  const employ = latestIndicator(wb.agEmployPct);
  const employStart = earliestIndicator(wb.agEmployPct);
  const rural = latestIndicator(wb.ruralPct);
  const economy: string[] = [];
  if (gdp) {
    const shift = gdpStart && gdpStart.year !== gdp.year
      ? `, compared with ${gdpStart.value.toFixed(1)}% in ${gdpStart.year}`
      : "";
    economy.push(`Agriculture, forestry and fishing made up ${gdp.value.toFixed(1)}% of GDP in ${name} in ${gdp.year}${shift}.`);
  }
  if (employ) {
    const shift = employStart && employStart.year !== employ.year
      ? ` (${employStart.value.toFixed(1)}% in ${employStart.year})`
      : "";
    economy.push(`The sector employs ${employ.value.toFixed(1)}% of the workforce${shift}.`);
  }
  if (rural) economy.push(`${rural.value.toFixed(1)}% of the population lived in rural areas in ${rural.year}.`);

  // Where it leads Africa
  const leaders = crops.filter((c) => c.pair.rank === 1);
  const podium = crops.filter((c) => c.pair.rank === 2 || c.pair.rank === 3);
  const leadership: string[] = [];
  if (leaders.length > 0) {
    leadership.push(`${name} is Africa's largest producer of ${listSentence(leaders.slice(0, 8).map((c) => `${cropCellLink(country, c.crop)} (${pct(c.pair.share * 100)})`))}${leaders.length > 8 ? `, plus ${leaders.length - 8} more crops` : ""}; figures in brackets are its share of African output.`);
  }
  if (podium.length > 0) {
    leadership.push(`It ranks second or third in Africa for ${listSentence(podium.slice(0, 8).map((c) => cropCellLink(country, c.crop)))}.`);
  }
  if (leadership.length === 0) {
    const best = [...crops].sort((a, b) => a.pair.rank - b.pair.rank)[0];
    leadership.push(best.pair.share < 0.02
      ? `${name} is a small producer by continental standards and does not lead Africa in any tracked crop. Its highest ranking is #${best.pair.rank} of ${africanProducers(best.crop).length} African producers of ${cropCellLink(country, best.crop)}, with ${pct(best.pair.share * 100)} of output.`
      : `Its strongest position in Africa is in ${cropCellLink(country, best.crop)}, where it ranks #${best.pair.rank} among African producers with ${pct(best.pair.share * 100)} of output.`);
  }

  // Fastest growth among the main crops
  const growers = crops.slice(0, 20)
    .map((c) => {
      const series = buildSeries(country.name, c.crop).filter((r) => r.production > 0);
      const g = series.length > 1 ? changePct(series[0].production, series[series.length - 1].production) : null;
      return { crop: c.crop, growth: g, from: series[0]?.year, to: series[series.length - 1]?.year };
    })
    .filter((g): g is { crop: string; growth: number; from: string; to: string } => g.growth !== null)
    .sort((a, b) => b.growth - a.growth);
  const rising = growers.filter((g) => g.growth > 0).slice(0, 4);
  const falling = growers.filter((g) => g.growth < 0).slice(-3).reverse();
  const trend: string[] = [];
  if (rising.length > 0) {
    trend.push(`Among its 20 largest crops, the fastest growth since ${rising[0].from} has been in ${listSentence(rising.map((g) => `${cropCellLink(country, g.crop)} (up ${pct(g.growth, 0)})`))}.`);
  }
  if (falling.length > 0) {
    trend.push(`Output has declined for ${listSentence(falling.map((g) => `${cropCellLink(country, g.crop)} (down ${pct(g.growth, 0)})`))}.`);
  }

  // Region
  const allCountries = getCountries() as (ResolvedCountry & { region?: string })[];
  const region = allCountries.find((c) => c.code === country.code)?.region;
  const neighbours = region ? allCountries.filter((c) => c.region === region && c.code !== country.code) : [];

  const rows = crops.slice(0, 15)
    .map((c) => `<tr><td>${cropCellLink(country, c.crop)}</td><td>${c.pair.production.toLocaleString()}</td><td>#${c.pair.rank}</td><td>${pct(c.pair.share * 100)}</td></tr>`)
    .join("");

  return `
    <nav aria-label="Breadcrumb"><a href="/">Home</a> › <a href="/countries">Countries</a> › ${name}</nav>
    <h1>${name} Agricultural Data</h1>
    <p>${name} has ${crops.length} crops tracked in FAOSTAT data for ${span}. Its largest crop by production volume is ${cropCellLink(country, top.crop)}, at ${top.pair.production.toLocaleString()} thousand tonnes in the most recent year on record.</p>
    ${economy.length > 0 ? `<h2>Agriculture in ${name}'s economy</h2>\n    <p>${economy.join(" ")}</p>` : ""}
    <h2>Where ${name} leads African production</h2>
    <p>${leadership.join(" ")}</p>
    <h2>Top crops in ${name} by production</h2>
    <table>
      <thead><tr><th>Crop</th><th>Latest Production (K tonnes)</th><th>Rank in Africa</th><th>Share of African output</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    ${trend.length > 0 ? `<h2>Production trends in ${name}</h2>\n    <p>${trend.join(" ")}</p>` : ""}
    ${neighbours.length > 0 ? `<h2>Other countries in ${escapeHtml(region!)}</h2>\n    <ul>${neighbours.map((c) => `<li>${countryLink(c)}</li>`).join("")}</ul>` : ""}
    <p>Browse <a href="/countries">all 54 African countries</a> or <a href="/crops">all crops</a>. Source: FAOSTAT and World Bank, via Afrixplorer. Last updated ${lastUpdatedDate()}.</p>
  `;
}

/** Area-weighted yield in hg/ha (production in K tonnes, area in K ha). */
function weightedYield(rows: GlobalRankingRow[]): number | null {
  const prod = rows.reduce((sum, r) => sum + r.production, 0);
  const area = rows.reduce((sum, r) => sum + r.area, 0);
  return area > 0 ? Math.round((prod / area) * 10000) : null;
}

/** Renders the static fallback body content for a /rankings/:crop page. */
export function renderRankingsContent(crop: string, rows: GlobalRankingRow[]): string {
  if (rows.length === 0) return "";

  const cropName = escapeHtml(crop);
  const top = rows[0];
  const africanRows = rows.filter((r) => r.code !== null);
  const otherRows = rows.filter((r) => r.code === null);
  const n = rows.length;

  // African rows link to their explore page when indexable, else the country page.
  const africanLink = (r: GlobalRankingRow): string => {
    const resolved = resolveCountry(r.code!);
    if (resolved && isIndexableExplore(resolved.name, crop)) return exploreLink(resolved.code, crop, r.country);
    return `<a href="/country/${r.code}">${escapeHtml(r.country)}</a>`;
  };

  const worldRows = rows
    .map((r) => {
      const countryCell = r.code ? `<a href="/country/${r.code}">${escapeHtml(r.country)}</a>` : escapeHtml(r.country);
      const yoy = r.yoyPct !== null ? `${r.yoyPct > 0 ? "+" : ""}${r.yoyPct}%` : "—";
      return `<tr><td>${r.rank}</td><td>${countryCell}</td><td>${r.production.toLocaleString()}</td><td>${r.yield.toLocaleString()}</td><td>${r.area.toLocaleString()}</td><td>${yoy}</td></tr>`;
    })
    .join("");

  // Africa's place in the top N
  const totalTop = rows.reduce((sum, r) => sum + r.production, 0);
  const africaTop = africanRows.reduce((sum, r) => sum + r.production, 0);
  const africaShare: string[] = [];
  if (africanRows.length > 0 && totalTop > 0) {
    const best = africanRows[0];
    africaShare.push(`African countries produce ${pct((africaTop / totalTop) * 100)} of the ${cropName} grown by the world's top ${n} producers.`);
    africaShare.push(`The highest-ranked African producer is ${africanLink(best)} at #${best.rank}, with ${kt(best.production)} thousand tonnes in ${best.year}.`);
  }

  // Yields: African vs non-African producers in the top N
  const yields: string[] = [];
  const yieldLeader = [...rows].sort((a, b) => b.yield - a.yield)[0];
  if (yieldLeader && yieldLeader.yield > 0) {
    yields.push(`${yieldLeader.code ? africanLink(yieldLeader) : escapeHtml(yieldLeader.country)} has the highest ${cropName} yield in the top ${n}, at ${yieldLeader.yield.toLocaleString()} hg/ha.`);
  }
  const afY = weightedYield(africanRows);
  const otherY = weightedYield(otherRows);
  if (afY && otherY) {
    const gap = ((afY - otherY) / otherY) * 100;
    yields.push(`Weighted by harvested area, African producers in the ranking average ${afY.toLocaleString()} hg/ha, ${Math.abs(gap) < 2 ? "in line with" : `${pct(gap, 0)} ${gap < 0 ? "below" : "above"}`} the ${otherY.toLocaleString()} hg/ha average of non-African producers.`);
    const bestAfricanYield = [...africanRows].sort((a, b) => b.yield - a.yield)[0];
    if (bestAfricanYield && bestAfricanYield !== yieldLeader) {
      yields.push(`The best African yield belongs to ${africanLink(bestAfricanYield)}, at ${bestAfricanYield.yield.toLocaleString()} hg/ha.`);
    }
  }

  // Year-on-year movers
  const withYoy = rows.filter((r) => r.yoyPct !== null);
  const movers: string[] = [];
  if (withYoy.length >= 2) {
    const up = [...withYoy].sort((a, b) => b.yoyPct! - a.yoyPct!)[0];
    const down = [...withYoy].sort((a, b) => a.yoyPct! - b.yoyPct!)[0];
    const label = (r: GlobalRankingRow) => (r.code ? africanLink(r) : escapeHtml(r.country));
    if (up.yoyPct! > 0) movers.push(`The biggest increase among the top ${n} in ${top.year} was in ${label(up)}, up ${pct(up.yoyPct!)} on the previous year.`);
    if (down.yoyPct! < 0) movers.push(`The sharpest fall was in ${label(down)}, down ${pct(down.yoyPct!)}.`);
    const africanUp = africanRows.filter((r) => r.yoyPct !== null && r.yoyPct > 0).length;
    if (africanRows.length > 0) {
      const count = africanRows.length === 1
        ? (africanUp === 1 ? "The one African producer" : "The one African producer")
        : africanUp === africanRows.length
          ? (africanRows.length === 2 ? "Both African producers" : `All ${africanRows.length} African producers`)
          : `${africanUp} of the ${africanRows.length} African producers`;
      movers.push(africanRows.length === 1 && africanUp === 0
        ? `${count} in the ranking did not increase output year on year.`
        : `${count} in the ranking increased output year on year.`);
    }
  }

  const africaSection = africanRows.length > 0
    ? `
    <h2>${cropName} in Africa</h2>
    <p>${africanRows.length} African ${africanRows.length === 1 ? "country ranks" : "countries rank"} in the global top ${n}: ${africanRows.map((r) => `${escapeHtml(r.country)} (#${r.rank})`).join(", ")}. ${africaShare.join(" ")} For every African producer, including those outside the global top ${n}, see ${cropLink(crop)} production across Africa.</p>
    <table>
      <thead><tr><th>Rank</th><th>Country</th><th>Production (K tonnes)</th></tr></thead>
      <tbody>${africanRows.map((r) => `<tr><td>${r.rank}</td><td>${africanLink(r)}</td><td>${r.production.toLocaleString()}</td></tr>`).join("")}</tbody>
    </table>
    `
    : `<p>No African country appears in the global top ${n} for ${cropName} in this dataset. See ${cropLink(crop)} production across Africa for every African producer.</p>`;

  const otherRankings = RANKING_CROP_LIST.filter((c) => c !== crop);

  return `
    <nav aria-label="Breadcrumb"><a href="/">Home</a> › <a href="/crops">Crops</a> › ${cropLink(crop)} › World ranking</nav>
    <h1>${cropName} Production by Country — World Ranking</h1>
    <p>${escapeHtml(top.country)} is the world's largest ${cropName} producer, at ${top.production.toLocaleString()} thousand tonnes in ${top.year}${rows.length > 1 ? `, followed by ${escapeHtml(rows[1].country)}${rows.length > 2 ? ` and ${escapeHtml(rows[2].country)}` : ""}` : ""}.${rows.length > 2 ? ` Together the top three account for ${pct(((rows[0].production + rows[1].production + rows[2].production) / totalTop) * 100)} of production among the top ${n}.` : ""}</p>
    <table>
      <thead><tr><th>Rank</th><th>Country</th><th>Production (K tonnes)</th><th>Yield (hg/ha)</th><th>Area (K ha)</th><th>YoY</th></tr></thead>
      <tbody>${worldRows}</tbody>
    </table>
    ${africaSection}
    ${yields.length > 0 ? `<h2>${cropName} yields: Africa and the world</h2>\n    <p>${yields.join(" ")}</p>` : ""}
    ${movers.length > 0 ? `<h2>Year-on-year changes</h2>\n    <p>${movers.join(" ")}</p>` : ""}
    <h2>Other world production rankings</h2>
    <ul>${otherRankings.map((c) => `<li><a href="/rankings/${encodeURIComponent(c)}">${escapeHtml(c)} production by country</a></li>`).join("")}</ul>
    <p>Source: FAOSTAT, via Afrixplorer. Last updated ${lastUpdatedDate()}.</p>
  `;
}

/** Renders the static fallback body content for a /crop/:name page. */
export function renderCropContent(crop: string): string {
  const producers = africanProducers(crop);
  if (producers.length === 0) return "";

  const cropName = escapeHtml(crop);
  const total = producers.reduce((sum, p) => sum + p.production, 0);
  const top = producers[0];
  const top3Share = producers.slice(0, 3).reduce((sum, p) => sum + p.share, 0);
  const link = (p: { name: string; code: string }) =>
    isIndexableExplore(p.name, crop) ? exploreLink(p.code, crop, p.name) : countryLink(p);

  // Continental trend: sum each year across producers
  const years = getYears();
  const totals = years.map((y) => ({
    year: y,
    production: producers.reduce((sum, p) => sum + (cropData()[p.name]?.[crop]?.production[y] || 0), 0),
  })).filter((t) => t.production > 0);
  const firstTotal = totals[0];
  const lastTotal = totals[totals.length - 1];
  const continentGrowth = firstTotal && lastTotal && firstTotal !== lastTotal
    ? changePct(firstTotal.production, lastTotal.production)
    : null;

  // Yields among meaningful producers (indexable pairs), so a tiny plot doesn't top the list
  const avgYield = getGlobalAvgYields()[crop] || null;
  const withYield = producers
    .filter((p) => isIndexableExplore(p.name, crop))
    .map((p) => {
      const series = buildSeries(p.name, crop).filter((r) => r.yield > 0);
      return { ...p, yield: series[series.length - 1]?.yield || 0 };
    })
    .filter((p) => p.yield > 0)
    .sort((a, b) => b.yield - a.yield);

  const yields: string[] = [];
  if (withYield.length >= 2) {
    const hi = withYield[0];
    const lo = withYield[withYield.length - 1];
    yields.push(`Among the main producers, ${link(hi)} has the highest yield at ${hi.yield.toLocaleString()} hg/ha, while ${link(lo)} has the lowest at ${lo.yield.toLocaleString()} hg/ha.`);
  }
  if (avgYield) yields.push(`The average yield across all African producers is ${avgYield.toLocaleString()} hg/ha.`);

  // Fastest growers among the top 10
  const growers = producers.slice(0, 10)
    .map((p) => {
      const s = buildSeries(p.name, crop).filter((r) => r.production > 0);
      return { ...p, growth: s.length > 1 ? changePct(s[0].production, s[s.length - 1].production) : null };
    })
    .filter((g): g is typeof g & { growth: number } => g.growth !== null && g.growth > 0)
    .sort((a, b) => b.growth - a.growth)
    .slice(0, 3);

  const trend: string[] = [];
  if (continentGrowth !== null) {
    trend.push(`Total African ${cropName} output ${continentGrowth >= 0 ? "rose" : "fell"} ${pct(continentGrowth)} from ${firstTotal.year} to ${lastTotal.year}, from ${kt(firstTotal.production)} to ${kt(lastTotal.production)} thousand tonnes.`);
  }
  if (growers.length > 0) {
    trend.push(`Among ${producers.length > 10 ? "the ten largest producers" : "its producers"}, output grew fastest in ${listSentence(growers.map((g) => `${link(g)} (up ${pct(g.growth, 0)})`))}.`);
  }

  // Output by region
  const regionOf = new Map((getCountries() as (ResolvedCountry & { region?: string })[]).map((c) => [c.code, c.region]));
  const byRegion = new Map<string, number>();
  for (const p of producers) {
    const r = regionOf.get(p.code);
    if (r) byRegion.set(r, (byRegion.get(r) || 0) + p.production);
  }
  const regions = Array.from(byRegion.entries()).sort((x, y) => y[1] - x[1]);
  const regionSentence = regions.length > 1
    ? `${escapeHtml(regions[0][0])} grows ${pct((regions[0][1] / total) * 100)} of African ${cropName}, followed by ${listSentence(regions.slice(1).map(([r, v]) => `${escapeHtml(r)} (${pct((v / total) * 100)})`))}.`
    : regions.length === 1
      ? `All tracked African ${cropName} production is in ${escapeHtml(regions[0][0])}.`
      : "";

  const rows = producers.slice(0, 15)
    .map((p, i) => `<tr><td>${i + 1}</td><td>${link(p)}</td><td>${p.production.toLocaleString()}</td><td>${pct(p.share * 100)}</td></tr>`)
    .join("");

  const ranking = RANKING_CROP_LIST.includes(crop)
    ? ` See where these producers stand worldwide in the <a href="/rankings/${encodeURIComponent(crop)}">global ${cropName} production ranking</a>.`
    : "";

  return `
    <nav aria-label="Breadcrumb"><a href="/">Home</a> › <a href="/crops">Crops</a> › ${cropName}</nav>
    <h1>${cropName} Production Data Across Africa</h1>
    <p>Africa produced ${kt(total)} thousand tonnes of ${cropName} in the most recent year on record, across ${producers.length} producing countries. ${link(top)} is the largest producer, with ${pct(top.share * 100)} of the continent's output.</p>
    <h2>Africa's largest ${cropName} producers</h2>
    <p>${producers.length > 3 ? `The top three producers, ${listSentence(producers.slice(0, 3).map(link))}, account for ${pct(top3Share * 100)} of African ${cropName} output.` : ""}${ranking}</p>
    <table>
      <thead><tr><th>Rank</th><th>Country</th><th>Latest Production (K tonnes)</th><th>Share of African output</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    ${yields.length > 0 ? `<h2>${cropName} yields across Africa</h2>\n    <p>${yields.join(" ")}</p>` : ""}
    ${regionSentence ? `<h2>Where in Africa ${cropName} is grown</h2>\n    <p>${regionSentence}</p>` : ""}
    ${trend.length > 0 ? `<h2>${cropName} production trend</h2>\n    <p>${trend.join(" ")}</p>` : ""}
    <h2>Explore more</h2>
    <p>Browse <a href="/crops">all ${getCrops().length} crops</a> or <a href="/countries">all 54 African countries</a>. Source: FAOSTAT and World Bank, via Afrixplorer. Last updated ${lastUpdatedDate()}.</p>
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
