import { getCountries, getCrops, getYears, getMetadata } from "./data";

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

const STATIC_ROUTES = new Set(["/", "", "/welcome", "/pricing", "/sign-in", "/sign-up", "/countries", "/crops"]);

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
    const id = decodeURIComponent(parts[1]).toLowerCase();
    return COUNTRIES.some((c) => c.code.toLowerCase() === id || c.name.toLowerCase() === id);
  }

  return false;
}

// ──────────────────── SEO Injection ────────────────────

export function injectSEO(url: string, template: string): string {
  const COUNTRIES = getCountries();
  let title = "African Agricultural Data & Investment Intelligence | Afrixplorer";
  let description = "Explore crop production, yield trends, trade data, and investment opportunities across 54 African countries and 136 crops. Powered by FAO and World Bank data.";
  let schemas: any[] = [];

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
    }
    // /country/:countryId
    else if (parts[0] === "country" && parts[1]) {
      const countryId = decodeURIComponent(parts[1]).toLowerCase();
      const country = COUNTRIES.find((c) => c.code.toLowerCase() === countryId || c.name.toLowerCase() === countryId);
      if (country) {
        title = `${country.name} Agricultural Data — Crop Production, Yields & Trade | Afrixplorer`;
        description = `Explore historical crop production, yield trends, and agricultural investment opportunities in ${country.name}. Data for all major crops from 2010-2024.`;
        schemas.push({
          "@context": "https://schema.org/",
          "@type": "Dataset",
          "name": `Agricultural Production Data for ${country.name}`,
          "description": description,
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
      }
    }
    // /crop/:cropName
    else if (parts[0] === "crop" && parts[1]) {
      const cropName = decodeURIComponent(parts[1]);
      title = `${cropName} Production Data Across Africa — Yields, Trade & Trends | Afrixplorer`;
      description = `Analyze ${cropName} production volumes, yield trends, and trade data across 54 African countries. Historical data from 2010-2024.`;
      schemas.push({
        "@context": "https://schema.org/",
        "@type": "Dataset",
        "name": `${cropName} Production Data Across Africa`,
        "description": description,
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
    }
    // /explore/:countryId/:cropName
    else if (parts[0] === "explore" && parts.length >= 3) {
      const countryId = decodeURIComponent(parts[1]).toLowerCase();
      const cropName = decodeURIComponent(parts[2]);
      const country = COUNTRIES.find((c) => c.code.toLowerCase() === countryId || c.name.toLowerCase() === countryId);
      if (country) {
        title = `${cropName} Production in ${country.name} — Yield, Area & Trade Data | Afrixplorer`;
        description = `Deep-dive into ${cropName} production volume, yield metrics, area harvested, and trade data in ${country.name}. Historical trends from 2010-2024.`;
        schemas.push({
          "@context": "https://schema.org/",
          "@type": "Dataset",
          "name": `${cropName} Production in ${country.name}`,
          "description": description,
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
      }
    }
    // /countries
    else if (parts[0] === "countries" && parts.length === 1) {
      title = "African Countries Agricultural Overview — 54 Nations | Afrixplorer";
      description = "Browse agricultural data for 54 African countries. Compare crop production, yields, trade volumes, and investment potential.";
      schemas.push(buildBreadcrumbs([
        { name: "Home", url: "/" },
        { name: "Countries", url: "/countries" },
      ]));
    }
    // /crops
    else if (parts[0] === "crops" && parts.length === 1) {
      title = "136 African Crops — Production & Yield Data | Afrixplorer";
      description = "Explore production volumes, yield trends, and trade data for 136 crops grown across Africa. Historical data from 2010-2024.";
      schemas.push(buildBreadcrumbs([
        { name: "Home", url: "/" },
        { name: "Crops", url: "/crops" },
      ]));
    }
    // /pricing
    else if (parts[0] === "pricing") {
      title = "Pricing — Afrixplorer Agricultural Data Plans";
      description = "Compare Afrixplorer plans for accessing African agricultural production data, yield analytics, and investment insights across 54 countries.";
      schemas.push(buildBreadcrumbs([
        { name: "Home", url: "/" },
        { name: "Pricing", url: "/pricing" },
      ]));
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
  html = html.replace(
    /<meta property="og:url" content="[^"]*">/,
    `<meta property="og:url" content="${canonicalUrl}">`
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
    `  <link rel="canonical" href="${canonicalUrl}" />\n  </head>`
  );

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

  return html;
}
