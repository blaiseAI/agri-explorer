import { getCountries } from "./data";

export function injectSEO(url: string, template: string): string {
  const COUNTRIES = getCountries();
  let title = "Afrixplorer";
  let description = "Discover African agricultural investment opportunities";
  let schemaData: any = null;

  try {
    const parts = url.split("/").filter(Boolean);
    
    // /country/:countryId
    if (parts[0] === "country" && parts[1]) {
      const countryId = decodeURIComponent(parts[1]).toLowerCase();
      const country = COUNTRIES.find((c) => c.code.toLowerCase() === countryId || c.name.toLowerCase() === countryId);
      if (country) {
        title = `${country.name} Agricultural Data | Afrixplorer`;
        description = `Explore historical crop production, yield, and agricultural investment opportunities in ${country.name}.`;
        schemaData = {
          "@context": "https://schema.org/",
          "@type": "Dataset",
          "name": `Agricultural Production Data for ${country.name}`,
          "description": description,
          "spatialCoverage": {
            "@type": "Place",
            "name": country.name
          },
          "creator": {
            "@type": "Organization",
            "name": "Afrixplorer"
          }
        };
      }
    } 
    // /crop/:cropName
    else if (parts[0] === "crop" && parts[1]) {
      const cropName = decodeURIComponent(parts[1]);
      title = `${cropName} Production & Trade | Afrixplorer`;
      description = `Analyze global and African production, yield trends, and trade data for ${cropName}.`;
      schemaData = {
        "@context": "https://schema.org/",
        "@type": "Dataset",
        "name": `Global ${cropName} Production Data`,
        "description": description,
        "keywords": [cropName, "Agriculture", "Yield", "Production"],
        "creator": {
          "@type": "Organization",
          "name": "Afrixplorer"
        }
      };
    } 
    // /explore/:countryId/:cropName
    else if (parts[0] === "explore" && parts.length >= 3) {
      const countryId = decodeURIComponent(parts[1]).toLowerCase();
      const cropName = decodeURIComponent(parts[2]);
      const country = COUNTRIES.find((c) => c.code.toLowerCase() === countryId || c.name.toLowerCase() === countryId);
      if (country) {
        title = `${cropName} in ${country.name} | Afrixplorer`;
        description = `Deep-dive into ${cropName} production volume, planted area, and yield metrics in ${country.name}.`;
        schemaData = {
          "@context": "https://schema.org/",
          "@type": "Dataset",
          "name": `${cropName} Production in ${country.name}`,
          "description": description,
          "spatialCoverage": {
            "@type": "Place",
            "name": country.name
          },
          "keywords": [cropName, country.name, "Agriculture", "Yield"],
          "creator": {
            "@type": "Organization",
            "name": "Afrixplorer"
          }
        };
      }
    }
    else if (parts[0] === "pricing") {
      title = "Pricing | Afrixplorer";
    }
  } catch (e) {
    console.error("SEO injection error:", e);
  }

  // Inject the new title
  let html = template.replace(
    /<title>.*?<\/title>/,
    `<title>${title}</title>`
  );

  // Inject the new description
  html = html.replace(
    /<meta name="description" content="[^"]*">/,
    `<meta name="description" content="${description}">`
  );
  
  // Also inject og:title and og:description
  html = html.replace(
    /<meta property="og:title" content="[^"]*">/,
    `<meta property="og:title" content="${title}">`
  );
  html = html.replace(
    /<meta property="og:description" content="[^"]*">/,
    `<meta property="og:description" content="${description}">`
  );

  // Extract country name from URL to pass to OG generator
  let countryName = "";
  if (url.startsWith("/country/")) {
    countryName = decodeURIComponent(url.split("/")[2]);
  } else if (url.startsWith("/explore/")) {
    const parts = url.split("/");
    if (parts.length >= 3) {
      const iso3 = parts[2];
      // Reuse the same resolution logic if needed, but since we just need a name match for the flags, 
      // we'll pass the ISO3 code and let og.ts map it, or we can resolve it here.
      // For simplicity, we can pass the raw code and let the OG generator resolve it if needed, 
      // or we can just pass the title which already contains the country name (e.g. "Maize in Uganda" -> extract Uganda).
      // Actually, since `/explore/UGA/Maize` generates the title "Maize in Uganda", it's easier to just pass the raw ISO3 
      // and let the OG endpoint handle it.
      countryName = iso3;
    }
  }

  // Inject dynamic Open Graph Image
  const encodedTitle = encodeURIComponent(title.replace(" | Afrixplorer", ""));
  const shortDesc = description.length > 65 ? description.substring(0, 62) + "..." : description;
  const encodedSubtitle = encodeURIComponent(shortDesc);
  const ogImageUrl = url === "/" || url === "" 
    ? "https://afrixplorer.com/apple-touch-icon.png"
    : `https://afrixplorer.com/api/og?title=${encodedTitle}&subtitle=${encodedSubtitle}${countryName ? `&country=${encodeURIComponent(countryName)}` : ''}`;
  
  html = html.replace(
    /<meta property="og:image" content="[^"]*">/,
    `<meta property="og:image" content="${ogImageUrl}">`
  );

  // Inject dynamic canonical tag
  // We use the raw URL (which excludes query parameters since we split by "/") to prevent duplicate content indexing
  const canonicalUrl = `https://afrixplorer.com${url.split("?")[0]}`;
  html = html.replace(
    "</head>",
    `  <link rel="canonical" href="${canonicalUrl}" />\n  </head>`
  );

  // Inject JSON-LD Schema
  if (schemaData) {
    html = html.replace(
      "</head>",
      `  <script type="application/ld+json">\n${JSON.stringify(schemaData, null, 2)}\n  </script>\n  </head>`
    );
  }

  return html;
}
