import { getCountries } from "./data";

export function injectSEO(url: string, template: string): string {
  const COUNTRIES = getCountries();
  let title = "Afrixplorer";
  let description = "Discover African agricultural investment opportunities";

  try {
    const parts = url.split("/").filter(Boolean);
    
    // /country/:code
    if (parts[0] === "country" && parts[1]) {
      const code = parts[1];
      const country = COUNTRIES.find((c) => c.code === code);
      if (country) {
        title = `${country.name} Agricultural Data | Afrixplorer`;
        description = `Explore historical crop production, yield, and agricultural investment opportunities in ${country.name}.`;
      }
    } 
    // /crop/:cropName
    else if (parts[0] === "crop" && parts[1]) {
      const cropName = decodeURIComponent(parts[1]);
      title = `${cropName} Production & Trade | Afrixplorer`;
      description = `Analyze global and African production, yield trends, and trade data for ${cropName}.`;
    } 
    // /explore/:code/:cropName
    else if (parts[0] === "explore" && parts.length >= 3) {
      const code = parts[1];
      const cropName = decodeURIComponent(parts[2]);
      const country = COUNTRIES.find((c) => c.code === code);
      if (country) {
        title = `${cropName} in ${country.name} | Afrixplorer`;
        description = `Deep-dive into ${cropName} production volume, planted area, and yield metrics in ${country.name}.`;
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

  return html;
}
