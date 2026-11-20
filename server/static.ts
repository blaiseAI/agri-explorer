import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import { injectSEO, isKnownRoute } from "./seo";

/**
 * Vite emits content-hashed filenames under /assets, so a changed file always gets
 * a new URL and the old one can be cached forever. Everything else (favicon,
 * robots.txt, llms.txt) keeps its name across deploys and gets a short cache.
 */
export function cacheControlFor(filePath: string): string {
  return filePath.split(path.sep).includes("assets")
    ? "public, max-age=31536000, immutable"
    : "public, max-age=3600";
}

export function serveStatic(app: Express) {
  const distPath = path.resolve(__dirname, "public");
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  // Prevent express.static from serving index.html natively 
  // so that the catch-all route handles it and injects SEO tags.
  app.use(express.static(distPath, {
    index: false,
    setHeaders: (res, filePath) => res.setHeader("Cache-Control", cacheControlFor(filePath)),
  }));

  // fall through to index.html if the file doesn't exist
  app.use("/{*path}", async (req, res, next) => {
    try {
      const htmlPath = path.resolve(distPath, "index.html");
      const template = await fs.promises.readFile(htmlPath, "utf-8");
      const seoHtml = injectSEO(req.originalUrl, template);
      const statusCode = isKnownRoute(req.originalUrl) ? 200 : 404;
      res.status(statusCode).set({ "Content-Type": "text/html" }).send(seoHtml);
    } catch (err) {
      next(err);
    }
  });
}
