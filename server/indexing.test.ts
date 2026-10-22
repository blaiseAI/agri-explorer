import { describe, it, expect } from "vitest";
import { buildExploreIndex, TOP_N_PRODUCERS } from "./indexing";

function series(latest: number, year = "2024") {
  return { production: { "2010": 1, [year]: latest } };
}

describe("buildExploreIndex", () => {
  it("ranks producers by their latest-year production and computes African share", () => {
    const pairs = buildExploreIndex({
      Nigeria: { Cassava: series(600) },
      Ghana: { Cassava: series(300) },
      Kenya: { Cassava: series(100) },
    });
    expect(pairs.get("Nigeria|Cassava")).toMatchObject({ rank: 1, share: 0.6 });
    expect(pairs.get("Kenya|Cassava")).toMatchObject({ rank: 3, share: 0.1 });
  });

  it("marks the top producers indexable and minor producers outside the top N as not", () => {
    const data: Record<string, any> = {};
    // One dominant producer plus many tiny ones, so tail producers have <5% share.
    data["Big"] = { Oats: series(10_000) };
    for (let i = 0; i < TOP_N_PRODUCERS + 3; i++) data[`Small${i}`] = { Oats: series(10 - i) };
    const pairs = buildExploreIndex(data);

    expect(pairs.get("Big|Oats")!.indexable).toBe(true);
    expect(pairs.get(`Small0|Oats`)!.indexable).toBe(true); // rank 2
    expect(pairs.get(`Small${TOP_N_PRODUCERS + 2}|Oats`)!.indexable).toBe(false);
  });

  it("keeps a producer outside the top N indexable when it has a large share", () => {
    const data: Record<string, any> = {};
    for (let i = 0; i < 8; i++) data[`C${i}`] = { Maize: series(100) };
    const pairs = buildExploreIndex(data);
    // Rank 8 of 8 equal producers still holds 12.5% of output.
    expect([...pairs.values()].every((p) => p.indexable)).toBe(true);
  });

  it("omits pairs with no positive production", () => {
    const pairs = buildExploreIndex({ Chad: { Onions: { production: { "2020": 0 } } } });
    expect(pairs.has("Chad|Onions")).toBe(false);
  });
});
