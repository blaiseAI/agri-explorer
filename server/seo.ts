import { getCountries, getCrops, getYears, getMetadata, getGlobalRankings } from "./data";
import {
  renderExploreContent, renderCountryContent, renderCropContent, renderRankingsContent,
  africanProducers, kt, latestProduction, countryCropsByProduction,
  renderHomeContent, renderCountriesIndexContent, renderCropsIndexContent,
} from "./content";
import { resolveCountry, resolveCrop } from "./resolve";
import { getExplorePair, RANKING_CROP_LIST } from "./indexing";

const SITE_URL = "https://afrixplorer.com";

// ──────────────────── Helpers ────────────────────

function buildBreadcrumbs(crumbs: Array<{ name: string; url: string }>) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": crumbs.map((c, i) => ({
      "@type": "ListItem",
      "position": i + 1,
      "name": c.name,
      "item": `${SITE_URL}${c.url}`,
    })),
  };
}

function escapeHtmlAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function getTemporalCoverage(): string {
  const years = getYears();
  if (years.length === 0) return "2010/2024";
  return `${years[0]}/${years[years.length - 1]}`;
}

function getDatePublished(): string {
  const meta = getMetadata();
  if (meta.lastUpdated) {
    return meta.lastUpdated.substring(0, 10);
  }
  return "2024-01-01";
}

const BRAND = " | Afrixplorer";
const MAX_TITLE = 60;
const MAX_DESC = 160;

/**
 * Picks the first candidate that fits Google's ~60-character display with the
 * brand appended, then the first that fits without it, else the shortest.
 */
export function fitTitle(...candidates: string[]): string {
  for (const c of candidates) if (c.length + BRAND.length <= MAX_TITLE) return c + BRAND;
  for (const c of candidates) if (c.length <= MAX_TITLE) return c;
  return candidates.reduce((a, b) => (b.length < a.length ? b : a));
}

/**
 * FAOSTAT's official item names can run past 70 characters, which blows up titles
 * and snippets. These are used only in <title> and meta descriptions; headings and
 * body copy keep the official name.
 */
const SHORT_CROP_NAMES: Record<string, string> = {
  "Edible roots and tubers with high starch or inulin content, n.e.c., fresh": "Other Starchy Roots & Tubers",
  "Anise, badian, coriander, cumin, caraway, fennel and juniper berries, raw": "Anise, Cumin & Seed Spices",
  "Other berries and fruits of the genus vaccinium n.e.c.": "Vaccinium Berries",
  "Kenaf, and other textile bast fibres, raw or retted": "Kenaf & Bast Fibres",
  "Other stimulant, spice and aromatic crops, n.e.c.": "Other Spice Crops",
  "Cinnamon and cinnamon-tree flowers, raw": "Cinnamon",
  "Leeks and other alliaceous vegetables": "Leeks & Alliums",
  "Tangerines, mandarins, clementines": "Tangerines & Mandarins",
  "Broad beans and horse beans, green": "Green Broad Beans",
  "Broad beans and horse beans, dry": "Dry Broad Beans",
  "Cantaloupes and other melons": "Melons",
  "Nutmeg, mace, cardamoms, raw": "Nutmeg & Cardamom",
  "Onions and shallots, green": "Green Onions",
  "Cloves (whole stems), raw": "Cloves",
  "Abaca, manila hemp, raw": "Abaca (Manila Hemp)",
  "Cauliflowers and broccoli": "Cauliflower & Broccoli",
  "Pomelos and grapefruits": "Grapefruit & Pomelos",
};

/** Short display name for titles and snippets; strips FAOSTAT's ", n.e.c." and ", raw" suffixes otherwise. */
export function shortCropName(crop: string): string {
  return SHORT_CROP_NAMES[crop] ?? crop.replace(/,? n\.e\.c\.$/, "").replace(/, raw$/, "");
}

/** Trims a description to 160 characters at a word boundary. */
export function clampDescription(text: string): string {
  if (text.length <= MAX_DESC) return text;
  const cut = text.slice(0, MAX_DESC - 1);
  return cut.slice(0, cut.lastIndexOf(" ")).replace(/[,;:.\s]+$/, "") + "…";
}

function yearSpan(): string {
  const years = getYears();
  return years.length > 0 ? `${years[0]}–${years[years.length - 1]}` : "2010–2024";
}

function baseDatasetFields() {
  return {
    "temporalCoverage": getTemporalCoverage(),
    "datePublished": getDatePublished(),
    "dateModified": getDatePublished(),
    "variableMeasured": [
      "Crop Production (tonnes)",
      "Crop Yield (hg/ha)",
      "Area Harvested (ha)",
    ],
    "includedInDataCatalog": {
      "@type": "DataCatalog",
      "name": "Afrixplorer",
    },
    "license": "https://creativecommons.org/licenses/by/4.0/",
    "creator": {
      "@type": "Organization",
      "name": "Afrixplorer",
      "url": SITE_URL,
    },
  };
}

// ──────────────────── Route Validation ────────────────────

const STATIC_ROUTES = new Set(["/", "", "/welcome", "/pricing", "/sign-in", "/sign-up", "/countries", "/crops", "/about", "/terms", "/privacy"]);

export const RANKING_CROPS = new Set(RANKING_CROP_LIST);

export function isKnownRoute(url: string): boolean {
  const cleanUrl = url.split("?")[0].split("#")[0];
  if (STATIC_ROUTES.has(cleanUrl)) return true;

  const parts = cleanUrl.split("/").filter(Boolean);
  if (parts.length === 0) return true;

  const COUNTRIES = getCountries();

  if (parts[0] === "country" && parts.length === 2) {
    const id = decodeURIComponent(parts[1]).toLowerCase();
    return COUNTRIES.some((c) => c.code.toLowerCase() === id || c.name.toLowerCase() === id);
  }
  if (parts[0] === "crop" && parts.length === 2) {
    const crops = getCrops();
    const name = decodeURIComponent(parts[1]);
    return crops.some((c) => c.toLowerCase() === name.toLowerCase());
  }
  if (parts[0] === "explore" && parts.length === 3) {
    // Both segments must resolve AND the country must actually produce the crop;
    // otherwise /explore/NGA/Anything would be a 200 soft-404.
    const country = resolveCountry(parts[1]);
    const crop = resolveCrop(parts[2]);
    return !!country && !!crop && getExplorePair(country.name, crop) !== null;
  }
  if (parts[0] === "rankings" && parts.length === 2) {
    const crop = resolveCrop(parts[1]);
    return crop !== null && RANKING_CROPS.has(crop);
  }

  return false;
}

// ──────────────────── SEO Injection ────────────────────

export function injectSEO(url: string, template: string): string {
  const COUNTRIES = getCountries();
  let title = "African Agricultural Data & Investment Intelligence | Afrixplorer";
  let description = "Explore crop production, yield trends, trade data, and investment opportunities across 54 African countries and 136 crops. Powered by FAO and World Bank data.";
  let schemas: any[] = [];
  let bodyContent = "";
  let noindex = false;

  try {
    const parts = url.split("?")[0].split("/").filter(Boolean);

    // Homepage
    if (parts.length === 0) {
      schemas.push({
        "@context": "https://schema.org",
        "@type": "Organization",
        "name": "Afrixplorer",
        "url": SITE_URL,
        "logo": `${SITE_URL}/apple-touch-icon.png`,
        "description": "African agricultural data and investment intelligence platform",
      });
      schemas.push({
        "@context": "https://schema.org",
        "@type": "WebSite",
        "name": "Afrixplorer",
        "url": SITE_URL,
        "description": description,
        "potentialAction": {
          "@type": "SearchAction",
          "target": `${SITE_URL}/countries?q={search_term_string}`,
          "query-input": "required name=search_term_string",
        },
      });
      bodyContent = renderHomeContent();
    }
    // /country/:countryId
    else if (parts[0] === "country" && parts[1]) {
      const countryId = decodeURIComponent(parts[1]).toLowerCase();
      const country = COUNTRIES.find((c) => c.code.toLowerCase() === countryId || c.name.toLowerCase() === countryId);
      if (country) {
        title = fitTitle(`${country.name} Crop Production & Agricultural Data`);
        const countryCrops = countryCropsByProduction(country.name);
        description = clampDescription(countryCrops.length > 0
          ? `${country.name} agricultural data, ${yearSpan()}: production, yields and trends for ${countryCrops.length} crops, led by ${countryCrops.slice(0, 3).join(", ")}. From FAOSTAT and the World Bank.`
          : `Crop production, yields and agricultural trends in ${country.name}, ${yearSpan()}, from FAOSTAT and the World Bank.`);
        schemas.push({
          "@context": "https://schema.org/",
          "@type": "Dataset",
          "name": `Agricultural Production Data for ${country.name}`,
          "description": description,
          "url": `${SITE_URL}/country/${country.code}`,
          "keywords": [country.name, "Agriculture", "Crop Production", "Africa", "Investment", "Yield Data"],
          "spatialCoverage": {
            "@type": "Place",
            "name": country.name,
          },
          ...baseDatasetFields(),
        });
        schemas.push(buildBreadcrumbs([
          { name: "Home", url: "/" },
          { name: "Countries", url: "/countries" },
          { name: country.name, url: `/country/${country.code}` },
        ]));
        bodyContent = renderCountryContent(country);
      }
    }
    // /crop/:cropName
    else if (parts[0] === "crop" && parts[1]) {
      const cropName = resolveCrop(parts[1]);
      if (cropName) {
        const cropShort = shortCropName(cropName);
        title = fitTitle(`${cropShort} Production in Africa by Country`, `${cropShort} Production in Africa`);
        const producers = africanProducers(cropName);
        description = clampDescription(producers.length > 0
          ? `${cropShort} production in Africa: ${producers.length} producing ${producers.length === 1 ? "country" : "countries"}, led by ${producers[0].name} with ${(producers[0].share * 100).toFixed(1)}% of output. Yields, top producers and trends, ${yearSpan()}.`
          : `${cropShort} production, yields and trends across Africa, ${yearSpan()}.`);
        schemas.push({
          "@context": "https://schema.org/",
          "@type": "Dataset",
          "name": `${cropName} Production Data Across Africa`,
          "description": description,
          "url": `${SITE_URL}/crop/${encodeURIComponent(cropName)}`,
          "spatialCoverage": { "@type": "Place", "name": "Africa" },
          "keywords": [cropName, "Agriculture", "Yield", "Production", "Africa", "Trade"],
          ...baseDatasetFields(),
          "variableMeasured": [
            "Crop Production (tonnes)",
            "Crop Yield (hg/ha)",
            "Area Harvested (ha)",
            "Export Trade Value (USD)",
          ],
        });
        schemas.push(buildBreadcrumbs([
          { name: "Home", url: "/" },
          { name: "Crops", url: "/crops" },
          { name: cropName, url: `/crop/${encodeURIComponent(cropName)}` },
        ]));
        bodyContent = renderCropContent(cropName);
      }
    }
    // /explore/:countryId/:cropName
    else if (parts[0] === "explore" && parts.length >= 3) {
      const countryId = decodeURIComponent(parts[1]).toLowerCase();
      const cropName = resolveCrop(parts[2]);
      const country = COUNTRIES.find((c) => c.code.toLowerCase() === countryId || c.name.toLowerCase() === countryId);
      if (country && cropName) {
        const cropShort = shortCropName(cropName);
        title = fitTitle(
          `${cropShort} Production in ${country.name}, ${yearSpan()}`,
          `${cropShort} Production in ${country.name}`,
          `${cropShort} in ${country.name}`,
        );
        const pair = getExplorePair(country.name, cropName);
        const latest = latestProduction(country.name, cropName);
        description = clampDescription(pair && latest
          ? `${country.name} produced ${kt(latest.production)} thousand tonnes of ${cropShort} in ${latest.year}, ${pair.rank === 1 ? "#1 in Africa" : `#${pair.rank} in Africa`} with ${(pair.share * 100).toFixed(1)}% of output. Yield, area and trends, ${yearSpan()}.`
          : `${cropShort} production, yield and harvested area in ${country.name}, ${yearSpan()}.`);
        schemas.push({
          "@context": "https://schema.org/",
          "@type": "Dataset",
          "name": `${cropName} Production in ${country.name}`,
          "description": description,
          "url": `${SITE_URL}/explore/${country.code}/${encodeURIComponent(cropName)}`,
          "keywords": [cropName, country.name, "Agriculture", "Yield", "Production", "Trade"],
          "spatialCoverage": {
            "@type": "Place",
            "name": country.name,
          },
          ...baseDatasetFields(),
        });
        schemas.push(buildBreadcrumbs([
          { name: "Home", url: "/" },
          { name: "Countries", url: "/countries" },
          { name: country.name, url: `/country/${country.code}` },
          { name: cropName, url: `/explore/${country.code}/${encodeURIComponent(cropName)}` },
        ]));
        bodyContent = renderExploreContent(country, cropName);
        // Minor producers get a page for users but are kept out of the index.
        noindex = !getExplorePair(country.name, cropName)?.indexable;
      }
    }
    // /rankings/:cropName
    else if (parts[0] === "rankings" && parts[1]) {
      const cropName = resolveCrop(parts[1]);
      if (cropName && RANKING_CROPS.has(cropName)) {
        const rankings = getGlobalRankings(cropName);
        title = fitTitle(`${cropName} Production by Country: World Ranking`);
        const africanCount = rankings.filter((r) => r.code !== null).length;
        description = clampDescription(rankings.length > 0
          ? `The world's top ${rankings.length} ${cropName} producers, led by ${rankings[0].country}. See where ${africanCount} African ${africanCount === 1 ? "country ranks" : "countries rank"}, with yields and year-on-year changes.`
          : `World ${cropName} production ranking by country, with African producers in context. From FAOSTAT data.`);
        if (rankings.length > 0) {
          schemas.push({
            "@context": "https://schema.org/",
            "@type": "Dataset",
            "name": `${cropName} Production by Country — World Ranking`,
            "description": description,
            "url": `${SITE_URL}/rankings/${encodeURIComponent(cropName)}`,
            "spatialCoverage": { "@type": "Place", "name": "World" },
            "keywords": [cropName, "Ranking", "World Production", "Agriculture"],
            ...baseDatasetFields(),
          });
          schemas.push({
            "@context": "https://schema.org",
            "@type": "ItemList",
            "itemListElement": rankings.slice(0, 10).map((r) => ({
              "@type": "ListItem",
              "position": r.rank,
              "name": r.country,
            })),
          });
          schemas.push(buildBreadcrumbs([
            { name: "Home", url: "/" },
            { name: "Crops", url: "/crops" },
            { name: cropName, url: `/crop/${encodeURIComponent(cropName)}` },
            { name: "World ranking", url: `/rankings/${encodeURIComponent(cropName)}` },
          ]));
        }
        bodyContent = renderRankingsContent(cropName, rankings);
      }
    }
    // /countries
    else if (parts[0] === "countries" && parts.length === 1) {
      title = fitTitle("Agricultural Data for 54 African Countries");
      description = "Browse agricultural data for 54 African countries. Compare crop production, yields, trade volumes, and investment potential.";
      schemas.push(buildBreadcrumbs([
        { name: "Home", url: "/" },
        { name: "Countries", url: "/countries" },
      ]));
      bodyContent = renderCountriesIndexContent();
    }
    // /crops
    else if (parts[0] === "crops" && parts.length === 1) {
      title = "136 African Crops — Production & Yield Data | Afrixplorer";
      description = "Explore production volumes, yield trends, and trade data for 136 crops grown across Africa. Historical data from 2010-2024.";
      schemas.push(buildBreadcrumbs([
        { name: "Home", url: "/" },
        { name: "Crops", url: "/crops" },
      ]));
      bodyContent = renderCropsIndexContent();
    }
    // /pricing
    else if (parts[0] === "pricing") {
      // SaaS page: no search value until the data pages bring organic traffic.
      noindex = true;
      title = "Pricing — Afrixplorer Agricultural Data Plans";
      description = "Compare Afrixplorer plans for accessing African agricultural production data, yield analytics, and investment insights across 54 countries.";
      schemas.push(buildBreadcrumbs([
        { name: "Home", url: "/" },
        { name: "Pricing", url: "/pricing" },
      ]));
      bodyContent = `<h1>Simple, transparent pricing</h1>
    <p>Compare Afrixplorer plans for African agricultural production data, yield analytics and investment insights across 54 countries. Browse <a href="/countries">countries</a> and <a href="/crops">crops</a> for free.</p>`;
    }
    // /welcome — marketing landing page. Same search intent as the homepage and
    // nothing links to it, so keep it out of the index to avoid cannibalizing /.
    else if (parts[0] === "welcome") {
      title = "Welcome to Afrixplorer — African Agriculture Intelligence";
      description = "An introduction to Afrixplorer: crop production, trade flows, and investment signals across 54 African countries, built on FAOSTAT and World Bank data.";
      noindex = true;
    }
    // /sign-in, /sign-up — no search value
    else if (parts[0] === "sign-in" || parts[0] === "sign-up") {
      noindex = true;
    }
    // /about
    else if (parts[0] === "about") {
      title = "About Afrixplorer — Methodology & Data Sources | Afrixplorer";
      description = "How Afrixplorer sources and maintains its African agricultural data: FAOSTAT, World Bank, UN Comtrade, and WFP, refreshed biweekly.";
      schemas.push(buildBreadcrumbs([
        { name: "Home", url: "/" },
        { name: "About", url: "/about" },
      ]));
      bodyContent = `<h1>About Afrixplorer</h1>
    <p>What this platform is, where the data comes from, and how it is maintained. Afrixplorer draws on FAOSTAT, the World Bank, UN Comtrade and WFP, refreshed every two weeks.</p>`;
    }
    // /terms
    else if (parts[0] === "terms") {
      title = "Terms of Service | Afrixplorer";
      description = "Terms of Service for using the Afrixplorer agricultural data platform.";
      schemas.push(buildBreadcrumbs([
        { name: "Home", url: "/" },
        { name: "Terms of Service", url: "/terms" },
      ]));
      bodyContent = `<h1>Terms of Service</h1>
    <p>The terms for using the Afrixplorer agricultural data platform.</p>`;
    }
    // /privacy
    else if (parts[0] === "privacy") {
      title = "Privacy Policy | Afrixplorer";
      description = "Privacy Policy describing what data Afrixplorer collects and how it's used.";
      schemas.push(buildBreadcrumbs([
        { name: "Home", url: "/" },
        { name: "Privacy Policy", url: "/privacy" },
      ]));
      bodyContent = `<h1>Privacy Policy</h1>
    <p>What data Afrixplorer collects and how it is used.</p>`;
    }
  } catch (e) {
    console.error("SEO injection error:", e);
  }

  // Inject title
  let html = template.replace(
    /<title>.*?<\/title>/,
    `<title>${title}</title>`
  );

  // Inject description
  html = html.replace(
    /<meta name="description" content="[^"]*">/,
    `<meta name="description" content="${description}">`
  );

  // Inject og:title, og:description, og:url
  html = html.replace(
    /<meta property="og:title" content="[^"]*">/,
    `<meta property="og:title" content="${title}">`
  );
  html = html.replace(
    /<meta property="og:description" content="[^"]*">/,
    `<meta property="og:description" content="${description}">`
  );

  const canonicalUrl = `${SITE_URL}${url.split("?")[0]}`;
  const safeCanonicalUrl = escapeHtmlAttr(canonicalUrl);
  html = html.replace(
    /<meta property="og:url" content="[^"]*">/,
    `<meta property="og:url" content="${safeCanonicalUrl}">`
  );

  // Extract country info for OG image
  let countryName = "";
  if (url.startsWith("/country/")) {
    countryName = decodeURIComponent(url.split("/")[2]);
  } else if (url.startsWith("/explore/")) {
    const urlParts = url.split("/");
    if (urlParts.length >= 3) {
      countryName = urlParts[2];
    }
  }

  // Inject dynamic OG image
  const encodedTitle = encodeURIComponent(title.replace(" | Afrixplorer", ""));
  const shortDesc = description.length > 65 ? description.substring(0, 62) + "..." : description;
  const encodedSubtitle = encodeURIComponent(shortDesc);
  const ogImageUrl = url === "/" || url === ""
    ? `${SITE_URL}/apple-touch-icon.png`
    : `${SITE_URL}/api/og?title=${encodedTitle}&subtitle=${encodedSubtitle}${countryName ? `&country=${encodeURIComponent(countryName)}` : ''}`;

  html = html.replace(
    /<meta property="og:image" content="[^"]*">/,
    `<meta property="og:image" content="${ogImageUrl}">`
  );

  // Inject Twitter tags
  html = html.replace(
    /<meta name="twitter:title" content="[^"]*">/,
    `<meta name="twitter:title" content="${title}">`
  );
  html = html.replace(
    /<meta name="twitter:description" content="[^"]*">/,
    `<meta name="twitter:description" content="${description}">`
  );
  html = html.replace(
    /<meta name="twitter:image" content="[^"]*">/,
    `<meta name="twitter:image" content="${ogImageUrl}">`
  );

  // Inject canonical tag
  html = html.replace(
    "</head>",
    `  <link rel="canonical" href="${safeCanonicalUrl}" />\n  </head>`
  );

  if (noindex) {
    html = html.replace(
      "</head>",
      `  <meta name="robots" content="noindex, follow">\n  </head>`
    );
  }

  // Inject JSON-LD schemas
  if (schemas.length > 0) {
    const schemaBlocks = schemas
      .map((s) => `  <script type="application/ld+json">\n${JSON.stringify(s, null, 2)}\n  </script>`)
      .join("\n");
    html = html.replace(
      "</head>",
      `${schemaBlocks}\n  </head>`
    );
  }

  if (bodyContent) {
    html = html.replace('<div id="root"></div>', `<div id="root">${bodyContent}</div>`);
  }

  return html;
}
