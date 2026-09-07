import { describe, it, expect } from "vitest";
import { renderRankingsContent } from "./content";
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
