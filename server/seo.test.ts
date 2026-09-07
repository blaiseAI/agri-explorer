import { describe, it, expect } from "vitest";
import { isKnownRoute } from "./seo";

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
