import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import { injectSEO } from "./seo";

export function serveStatic(app: Express) {
  const distPath = path.resolve(__dirname, "public");
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  app.use(express.static(distPath));

  // fall through to index.html if the file doesn't exist
  app.use("/{*path}", async (req, res, next) => {
    try {
      const htmlPath = path.resolve(distPath, "index.html");
      const template = await fs.promises.readFile(htmlPath, "utf-8");
      const seoHtml = injectSEO(req.originalUrl, template);
      res.status(200).set({ "Content-Type": "text/html" }).send(seoHtml);
    } catch (err) {
      next(err);
    }
  });
}
