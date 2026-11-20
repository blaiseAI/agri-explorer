import { describe, it, expect } from "vitest";
import { renderRankingsContent, renderExploreContent, renderCountryContent, renderCropContent } from "./content";
import { resolveCountry } from "./resolve";
import { isIndexableExplore } from "./indexing";
import type { GlobalRankingRow } from "./data";

function row(overrides: Partial<GlobalRankingRow>): GlobalRankingRow {
  return {
    rank: 1,
    country: "Brazil",
    code: null,
    production: 3200,
    yield: 15000,
    area: 200,
    yoyPct: 5.0,
    year: "2024",
    ...overrides,
  };
}

describe("renderRankingsContent", () => {
  it("returns empty string when there are no rows", () => {
    expect(renderRankingsContent("Coffee", [])).toBe("");
  });

  it("includes an H1 naming the crop", () => {
    const html = renderRankingsContent("Coffee", [row({})]);
    expect(html).toContain("<h1>Coffee Production by Country — World Ranking</h1>");
  });

  it("names the #1 producer and its production figure in the lead paragraph", () => {
    const html = renderRankingsContent("Coffee", [
      row({ rank: 1, country: "Brazil", production: 3200 }),
      row({ rank: 2, country: "Vietnam", production: 1900 }),
    ]);
    expect(html).toContain("Brazil");
    expect(html).toContain("3,200");
  });

  it("renders one table row per country", () => {
    const rows = [
      row({ rank: 1, country: "Brazil" }),
      row({ rank: 2, country: "Vietnam" }),
      row({ rank: 3, country: "Colombia" }),
    ];
    const html = renderRankingsContent("Coffee", rows);
    expect((html.match(/<tr>/g) || []).length).toBeGreaterThanOrEqual(3);
  });

  it("links African-country rows to their /country/:code page, but not non-African rows", () => {
    const rows = [
      row({ rank: 1, country: "Brazil", code: null }),
      row({ rank: 6, country: "Ethiopia", code: "ETH" }),
    ];
    const html = renderRankingsContent("Coffee", rows);
    expect(html).toContain('href="/country/ETH"');
    expect(html).not.toContain('href="/country/null"');
    expect(html).not.toContain("href=\"/country/Brazil\"");
  });

  it("includes an Africa-in-context subsection listing only African rows", () => {
    const rows = [
      row({ rank: 1, country: "Brazil", code: null }),
      row({ rank: 6, country: "Ethiopia", code: "ETH" }),
      row({ rank: 12, country: "Uganda", code: "UGA" }),
    ];
    const html = renderRankingsContent("Coffee", rows);
    expect(html).toContain("Ethiopia");
    expect(html).toContain("Uganda");
    expect(html).toContain("#6");
  });

  it("does not throw and returns empty-ish content when no rows have a code (no African producers in top 30)", () => {
    const rows = [row({ rank: 1, country: "Brazil", code: null })];
    expect(() => renderRankingsContent("Coffee", rows)).not.toThrow();
  });
});

describe("renderExploreContent", () => {
  const nigeria = resolveCountry("NGA")!;
  const html = renderExploreContent(nigeria, "Cassava");
  const h2s = html.match(/<h2>[^<]*<\/h2>/g) || [];

  it("has exactly one H1 and several H2 sections", () => {
    expect((html.match(/<h1>/g) || []).length).toBe(1);
    expect(h2s.length).toBeGreaterThanOrEqual(4);
  });

  it("renders a breadcrumb linking home, the country and the crop", () => {
    const nav = html.match(/<nav aria-label="Breadcrumb">[\s\S]*?<\/nav>/)?.[0] || "";
    expect(nav).toContain('href="/"');
    expect(nav).toContain('href="/country/NGA"');
    expect(nav).toContain('href="/crop/Cassava"');
  });

  it("states the country's rank and share of African output", () => {
    expect(html).toMatch(/Africa's (largest|#\d+) producer of Cassava/);
    expect(html).toMatch(/\d+(\.\d)?% of African Cassava output/);
  });

  it("links to the world ranking when the crop has one", () => {
    expect(html).toContain('href="/rankings/Cassava"');
  });

  it("explains what drove the production trend", () => {
    expect(html).toMatch(/harvested area|yield/i);
    expect(html).toMatch(/peak/i);
  });

  it("links to other leading African producers of the crop, not to itself", () => {
    const links = html.match(/href="\/explore\/[A-Z]{3}\/Cassava"/g) || [];
    expect(links.length).toBeGreaterThanOrEqual(3);
    expect(html).not.toContain('href="/explore/NGA/Cassava"');
  });

  it("links only to indexable explore pages", () => {
    const pairs = [...html.matchAll(/href="\/explore\/([A-Z]{3})\/([^"]+)"/g)];
    expect(pairs.length).toBeGreaterThan(0);
    for (const [, code, crop] of pairs) {
      const name = resolveCountry(code)!.name;
      expect(isIndexableExplore(name, decodeURIComponent(crop)), `${code}/${crop}`).toBe(true);
    }
  });

  it("links to other major crops in the same country", () => {
    const links = html.match(/href="\/explore\/NGA\/(?!Cassava")[^"]+"/g) || [];
    expect(links.length).toBeGreaterThanOrEqual(3);
  });

  it("has substantially more text than the bare data table", () => {
    const prose = html.replace(/<table[\s\S]*?<\/table>/g, "").replace(/<[^>]+>/g, " ");
    expect(prose.split(/\s+/).filter(Boolean).length).toBeGreaterThanOrEqual(180);
  });

  it("returns an empty string when the country has no data for the crop", () => {
    expect(renderExploreContent(nigeria, "Unobtainium")).toBe("");
  });
});

function proseWords(html: string): number {
  return html.replace(/<table[\s\S]*?<\/table>/g, "").replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean).length;
}

function exploreLinksAreIndexable(html: string) {
  for (const [, code, crop] of html.matchAll(/href="\/explore\/([A-Z]{3})\/([^"]+)"/g)) {
    expect(isIndexableExplore(resolveCountry(code)!.name, decodeURIComponent(crop)), `${code}/${crop}`).toBe(true);
  }
}

describe("renderCountryContent", () => {
  const nigeria = resolveCountry("NGA")!;
  const html = renderCountryContent(nigeria);

  it("has one H1 and several H2 sections", () => {
    expect((html.match(/<h1>/g) || []).length).toBe(1);
    expect((html.match(/<h2>/g) || []).length).toBeGreaterThanOrEqual(4);
  });

  it("renders a breadcrumb through the countries hub", () => {
    const nav = html.match(/<nav aria-label="Breadcrumb">[\s\S]*?<\/nav>/)?.[0] || "";
    expect(nav).toContain('href="/"');
    expect(nav).toContain('href="/countries"');
  });

  it("states the real number of tracked crops, not the table length", () => {
    expect(html).not.toMatch(/produces 15\+ tracked crops/);
    expect(html).toMatch(/\d+ crops? tracked/);
  });

  it("describes agriculture's role in the economy from World Bank data", () => {
    expect(html).toMatch(/% of GDP/);
    expect(html).toMatch(/employ/i);
  });

  it("names crops where the country leads Africa", () => {
    expect(html).toMatch(/Africa's largest producer of/);
  });

  it("links to other countries in the same region", () => {
    const links = (html.match(/href="\/country\/[A-Z]{3}"/g) || []).filter((l) => !l.includes("NGA"));
    expect(links.length).toBeGreaterThanOrEqual(3);
  });

  it("links only to indexable explore pages", () => exploreLinksAreIndexable(html));

  it("has substantially more text than the bare table", () => {
    expect(proseWords(html)).toBeGreaterThanOrEqual(180);
  });
});

describe("renderCropContent", () => {
  const html = renderCropContent("Cassava");

  it("has one H1 and several H2 sections", () => {
    expect((html.match(/<h1>/g) || []).length).toBe(1);
    expect((html.match(/<h2>/g) || []).length).toBeGreaterThanOrEqual(4);
  });

  it("renders a breadcrumb through the crops hub", () => {
    const nav = html.match(/<nav aria-label="Breadcrumb">[\s\S]*?<\/nav>/)?.[0] || "";
    expect(nav).toContain('href="/crops"');
  });

  it("counts every producing country, not just the table rows", () => {
    expect(html).not.toMatch(/across 15 producing countries/);
    expect(html).toMatch(/3\d producing countries/); // Cassava has 39 African producers
  });

  it("states total African output, concentration and the trend", () => {
    expect(html).toMatch(/Africa produced [\d,.]+ thousand tonnes of Cassava/);
    expect(html).toMatch(/top three producers/i);
    expect(html).toMatch(/since 2010|from 2010/);
  });

  it("compares yields across producers", () => {
    expect(html).toMatch(/highest yield/i);
  });

  it("links to the world ranking when the crop has one", () => {
    expect(html).toContain('href="/rankings/Cassava"');
  });

  it("links only to indexable explore pages", () => exploreLinksAreIndexable(html));

  it("has substantially more text than the bare table", () => {
    expect(proseWords(html)).toBeGreaterThanOrEqual(180);
  });
});
