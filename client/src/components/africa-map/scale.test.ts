import { describe, it, expect } from "vitest";
import { quantileBreaks, classify, formatTonnes, formatYield } from "./scale";
import { COUNTRY_SHAPES } from "./geometry";

describe("quantileBreaks / classify", () => {
  const values = Array.from({ length: 50 }, (_, i) => i + 1);
  const breaks = quantileBreaks(values);

  it("returns four ascending breaks for five classes", () => {
    expect(breaks).toHaveLength(4);
    expect([...breaks].sort((a, b) => a - b)).toEqual(breaks);
  });

  it("puts roughly the same number of values in each class", () => {
    const counts = [0, 0, 0, 0, 0];
    for (const v of values) counts[classify(v, breaks)]++;
    for (const c of counts) expect(c).toBe(10);
  });

  it("treats missing, zero and non-finite values as no data", () => {
    expect(classify(undefined, breaks)).toBe(-1);
    expect(classify(0, breaks)).toBe(-1);
    expect(classify(NaN, breaks)).toBe(-1);
  });

  it("collapses duplicate breaks when there are few producers", () => {
    expect(quantileBreaks([5, 5, 5])).toEqual([5]);
    expect(quantileBreaks([])).toEqual([]);
  });
});

describe("formatters", () => {
  it("formats thousands of tonnes", () => {
    expect(formatTonnes(62624.9)).toBe("63M t");
    expect(formatTonnes(1234)).toBe("1.2M t");
    expect(formatTonnes(320)).toBe("320K t");
    expect(formatTonnes(0.5)).toBe("500 t");
  });
  it("formats hg/ha as t/ha", () => {
    expect(formatYield(58405)).toBe("5.8 t/ha");
    expect(formatYield(150000)).toBe("15 t/ha");
  });
});

describe("geometry", () => {
  it("has a shape for each of the 54 tracked countries", () => {
    expect(COUNTRY_SHAPES).toHaveLength(54);
    expect(new Set(COUNTRY_SHAPES.map((c) => c.code)).size).toBe(54);
    for (const c of COUNTRY_SHAPES) expect(c.d.length, c.code).toBeGreaterThan(10);
  });
});
