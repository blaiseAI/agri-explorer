import { describe, it, expect } from "vitest";
import { cacheControlFor } from "./static";

describe("cacheControlFor", () => {
  it("caches hashed Vite build assets for a year as immutable", () => {
    expect(cacheControlFor("/app/dist/public/assets/index-Yx6vHqfl.js")).toBe("public, max-age=31536000, immutable");
    expect(cacheControlFor("/app/dist/public/assets/index-CR0mHxbB.css")).toBe("public, max-age=31536000, immutable");
  });

  it("gives unhashed root files a short cache so updates show up", () => {
    expect(cacheControlFor("/app/dist/public/favicon.ico")).toBe("public, max-age=3600");
    expect(cacheControlFor("/app/dist/public/robots.txt")).toBe("public, max-age=3600");
  });
});
