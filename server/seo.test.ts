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
