import { describe, it, expect } from "vitest";
import { isKnownRoute, injectSEO } from "./seo";
import { getCountries, getCropData } from "./data";
import { getExplorePair } from "./indexing";

describe("isKnownRoute — rankings", () => {
  it("returns true for a launch crop's rankings page", () => {
    expect(isKnownRoute("/rankings/Rice")).toBe(true);
    expect(isKnownRoute("/rankings/Coffee")).toBe(true);
  });

  it("is case-insensitive, matching how canonicalRedirect resolves before this ever runs", () => {
    expect(isKnownRoute("/rankings/rice")).toBe(true);
  });

  it("returns false for a real crop that is not one of the 14 launch crops", () => {
    expect(isKnownRoute("/rankings/Sorghum")).toBe(false);
  });

  it("returns false for a crop that doesn't exist at all", () => {
    expect(isKnownRoute("/rankings/Unobtainium")).toBe(false);
  });

  it("returns false for a malformed rankings path with no crop segment", () => {
    expect(isKnownRoute("/rankings")).toBe(false);
    expect(isKnownRoute("/rankings/")).toBe(false);
  });
});

describe("isKnownRoute — explore", () => {
  it("returns true for a country that produces the crop", () => {
    expect(isKnownRoute("/explore/NGA/Cassava")).toBe(true);
  });

  it("returns false for an unknown crop instead of serving a soft-404", () => {
    expect(isKnownRoute("/explore/NGA/Unobtainium")).toBe(false);
  });

  it("returns false for an unknown country", () => {
    expect(isKnownRoute("/explore/XXX/Cassava")).toBe(false);
  });
});

describe("injectSEO — indexing directives", () => {
  const template = `<html><head><title>x</title><meta name="description" content="x"></head><body><div id="root"></div></body></html>`;

  it("leaves a major producer's explore page indexable", () => {
    expect(injectSEO("/explore/NGA/Cassava", template)).not.toContain("noindex");
  });

  it("noindexes a minor producer's explore page", () => {
    const pair = [...minorPairs()][0];
    expect(injectSEO(pair, template)).toContain('<meta name="robots" content="noindex, follow">');
  });

  it("noindexes /welcome, which targets the same intent as the homepage", () => {
    const html = injectSEO("/welcome", template);
    expect(html).toContain('<meta name="robots" content="noindex, follow">');
    expect(html).not.toContain("<title>African Agricultural Data & Investment Intelligence | Afrixplorer</title>");
  });

  it("noindexes /pricing until the site has organic traffic worth converting", () => {
    expect(injectSEO("/pricing", template)).toContain('<meta name="robots" content="noindex, follow">');
  });

  it("noindexes the auth pages", () => {
    expect(injectSEO("/sign-in", template)).toContain("noindex");
    expect(injectSEO("/sign-up", template)).toContain("noindex");
  });

  it("renders crawlable hub links on the homepage, /countries and /crops", () => {
    expect(injectSEO("/", template)).toContain('href="/country/NGA"');
    expect(injectSEO("/countries", template)).toContain('href="/country/KEN"');
    expect(injectSEO("/crops", template)).toContain('href="/crop/Cassava"');
  });
});

function* minorPairs() {
  const cropData = getCropData();
  for (const c of getCountries()) {
    for (const crop of Object.keys(cropData[c.name] || {})) {
      const pair = getExplorePair(c.name, crop);
      if (pair && !pair.indexable) yield `/explore/${c.code}/${encodeURIComponent(crop)}`;
    }
  }
}

describe("injectSEO — titles, descriptions and schema (second audit pass)", () => {
  const titleOf = (html: string) => html.match(/<title>(.*?)<\/title>/)![1];
  const descOf = (html: string) => html.match(/<meta name="description" content="([^"]*)">/)![1];
  const datasets = (html: string) =>
    [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
      .map((m) => JSON.parse(m[1]))
      .flatMap((j) => (Array.isArray(j) ? j : [j]));
  const template = `<html><head><title>x</title><meta name="description" content="x"></head><body><div id="root"></div></body></html>`;

  it("keeps every country title within 60 characters", () => {
    for (const c of getCountries() as { code: string }[]) {
      const t = titleOf(injectSEO(`/country/${c.code}`, template));
      expect(t.length, t).toBeLessThanOrEqual(60);
    }
  });

  it("keeps crop, explore and rankings titles within 60 characters for ordinary crop names", () => {
    for (const url of ["/crop/Cassava", "/crop/Sweet%20Potatoes", "/explore/NGA/Cassava", "/explore/ETH/Coffee", "/rankings/Seed%20Cotton", "/rankings/Sugar%20Cane", "/countries"]) {
      const t = titleOf(injectSEO(url, template));
      expect(t.length, t).toBeLessThanOrEqual(60);
    }
  });

  it("keeps descriptions within 160 characters, even for very long FAOSTAT crop names", () => {
    const long = "/crop/Edible%20roots%20and%20tubers%20with%20high%20starch%20or%20inulin%20content%2C%20n.e.c.%2C%20fresh";
    for (const url of [long, "/country/CAF", "/explore/NGA/Cassava", "/rankings/Coffee"]) {
      const d = descOf(injectSEO(url, template));
      expect(d.length, d).toBeLessThanOrEqual(160);
      expect(d.length, d).toBeGreaterThanOrEqual(70);
    }
  });

  it("writes data-driven explore descriptions with the country's rank and output", () => {
    const d = descOf(injectSEO("/explore/NGA/Cassava", template));
    expect(d).toMatch(/Nigeria/);
    expect(d).toMatch(/#1 in Africa|Africa's largest/);
    expect(d).toMatch(/[\d,]+ thousand tonnes/);
  });

  it("gives every Dataset a url matching the page and a spatialCoverage", () => {
    for (const url of ["/country/NGA", "/crop/Cassava", "/explore/NGA/Cassava", "/rankings/Coffee"]) {
      const ds = datasets(injectSEO(url, template)).find((o) => o["@type"] === "Dataset");
      expect(ds, url).toBeTruthy();
      expect(ds.url).toBe(`https://afrixplorer.com${url}`);
      expect(ds.spatialCoverage, url).toBeTruthy();
    }
  });

  it("matches the rankings JSON-LD breadcrumb to the visible one (through the crop hub)", () => {
    const bc = datasets(injectSEO("/rankings/Coffee", template)).find((o) => o["@type"] === "BreadcrumbList");
    const items = bc.itemListElement.map((li: any) => li.item);
    expect(items).toContain("https://afrixplorer.com/crop/Coffee");
  });

  it("server-renders an H1 on the static pages", () => {
    for (const url of ["/about", "/pricing", "/terms", "/privacy"]) {
      const body = injectSEO(url, template).split('<div id="root">')[1] || "";
      expect((body.match(/<h1>/g) || []).length, url).toBe(1);
    }
  });
});

describe("injectSEO — every indexed title fits", () => {
  const template = `<html><head><title>x</title><meta name="description" content="x"></head><body><div id="root"></div></body></html>`;
  const titleOf = (html: string) => html.match(/<title>(.*?)<\/title>/)![1];

  it("keeps all crop and indexable explore titles within 60 characters", () => {
    const tooLong: string[] = [];
    const cropData = getCropData();
    const crops = new Set<string>();
    for (const [name, byCrop] of Object.entries(cropData)) {
      const code = (getCountries() as { name: string; code: string }[]).find((c) => c.name === name)?.code;
      for (const crop of Object.keys(byCrop)) {
        crops.add(crop);
        if (!code || !getExplorePair(name, crop)?.indexable) continue;
        const t = titleOf(injectSEO(`/explore/${code}/${encodeURIComponent(crop)}`, template));
        if (t.length > 60) tooLong.push(t);
      }
    }
    for (const crop of crops) {
      const t = titleOf(injectSEO(`/crop/${encodeURIComponent(crop)}`, template));
      if (t.length > 60) tooLong.push(t);
    }
    expect(tooLong).toEqual([]);
  }, 60000);
});
