import { describe, it, expect } from "vitest";
import { cachedByDataVersion } from "./apiCache";

describe("cachedByDataVersion", () => {
  it("computes once per data version and recomputes when it changes", () => {
    let version = "v1";
    let calls = 0;
    const get = cachedByDataVersion(() => ++calls, () => version);
    expect(get()).toBe(1);
    expect(get()).toBe(1);
    expect(calls).toBe(1);
    version = "v2";
    expect(get()).toBe(2);
    expect(get()).toBe(2);
    expect(calls).toBe(2);
  });
});
