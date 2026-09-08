import { describe, it, expect, vi } from "vitest";
import { canonicalRedirect, wwwRedirect } from "./redirects";

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

function mockHostReqRes(hostname: string, originalUrl: string) {
  const req: any = { hostname, originalUrl };
  const redirectCalls: [number, string][] = [];
  const res: any = {
    redirect: (status: number, location: string) => {
      redirectCalls.push([status, location]);
    },
  };
  const next = vi.fn();
  return { req, res, next, redirectCalls };
}

describe("wwwRedirect", () => {
  it("redirects www to the apex domain, preserving path and query", () => {
    const { req, res, next, redirectCalls } = mockHostReqRes("www.afrixplorer.com", "/rankings/Coffee?utm_source=x");
    wwwRedirect(req, res, next);
    expect(redirectCalls).toEqual([[301, "https://afrixplorer.com/rankings/Coffee?utm_source=x"]]);
    expect(next).not.toHaveBeenCalled();
  });

  it("does not redirect the apex domain", () => {
    const { req, res, next, redirectCalls } = mockHostReqRes("afrixplorer.com", "/rankings/Coffee");
    wwwRedirect(req, res, next);
    expect(redirectCalls).toEqual([]);
    expect(next).toHaveBeenCalled();
  });

  it("does not redirect an unrelated hostname (e.g. localhost in dev)", () => {
    const { req, res, next, redirectCalls } = mockHostReqRes("localhost", "/rankings/Coffee");
    wwwRedirect(req, res, next);
    expect(redirectCalls).toEqual([]);
    expect(next).toHaveBeenCalled();
  });
});

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
