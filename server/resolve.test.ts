import { describe, it, expect } from "vitest";
import { resolveCountry, resolveCrop } from "./resolve";

describe("resolveCountry", () => {
  it("matches by exact ISO3 code", () => {
    const result = resolveCountry("NGA");
    expect(result?.name).toBe("Nigeria");
    expect(result?.code).toBe("NGA");
  });

  it("matches by full name, case-insensitively", () => {
    expect(resolveCountry("nigeria")?.code).toBe("NGA");
    expect(resolveCountry("NIGERIA")?.code).toBe("NGA");
  });

  it("returns null for an unknown identifier", () => {
    expect(resolveCountry("Atlantis")).toBeNull();
  });

  it("returns null rather than throwing on a malformed percent-encoded identifier", () => {
    expect(resolveCountry("%")).toBeNull();
  });
});

describe("resolveCrop", () => {
  it("matches by exact name", () => {
    expect(resolveCrop("Rice")).toBe("Rice");
  });

  it("matches case-insensitively and returns the canonical stored casing", () => {
    expect(resolveCrop("rice")).toBe("Rice");
    expect(resolveCrop("RICE")).toBe("Rice");
  });

  it("returns null for an unknown crop", () => {
    expect(resolveCrop("Unobtainium")).toBeNull();
  });
});
