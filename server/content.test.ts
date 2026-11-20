import { describe, it, expect } from "vitest";
import { renderRankingsContent, renderExploreContent } from "./content";
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
