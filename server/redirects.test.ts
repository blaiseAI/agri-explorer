import { describe, it, expect, vi } from "vitest";
import { canonicalRedirect } from "./redirects";

function mockReqRes(path: string) {
  const req: any = { path, url: path };
  const redirectCalls: [number, string][] = [];
  const res: any = {
    redirect: (status: number, location: string) => {
      redirectCalls.push([status, location]);
    },
  };
  const next = vi.fn();
  return { req, res, next, redirectCalls };
}

describe("canonicalRedirect — rankings", () => {
  it("redirects a lowercase crop to canonical casing", () => {
    const { req, res, next, redirectCalls } = mockReqRes("/rankings/rice");
    canonicalRedirect(req, res, next);
    expect(redirectCalls).toEqual([[301, "/rankings/Rice"]]);
    expect(next).not.toHaveBeenCalled();
  });

  it("does not redirect an already-canonical rankings URL", () => {
    const { req, res, next, redirectCalls } = mockReqRes("/rankings/Rice");
    canonicalRedirect(req, res, next);
    expect(redirectCalls).toEqual([]);
    expect(next).toHaveBeenCalled();
  });

  it("falls through to next() for an unknown crop rather than redirecting", () => {
    const { req, res, next, redirectCalls } = mockReqRes("/rankings/Unobtainium");
    canonicalRedirect(req, res, next);
    expect(redirectCalls).toEqual([]);
    expect(next).toHaveBeenCalled();
  });

  it("preserves query strings on redirect", () => {
    const { req, res, next, redirectCalls } = mockReqRes("/rankings/rice?utm_source=x");
    req.path = "/rankings/rice";
    canonicalRedirect(req, res, next);
    expect(redirectCalls).toEqual([[301, "/rankings/Rice?utm_source=x"]]);
  });
});
