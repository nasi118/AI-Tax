#!/usr/bin/env node
/**
 * Reassembles the app into a single self-contained HTML file (dist/tax-advisory-pro.html)
 * that runs offline from file:// — the format the app was originally distributed in.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
let html = readFileSync(join(root, "index.html"), "utf8");

html = html.replace(
  /<link rel="stylesheet" href="([^"]+)">/g,
  (_, href) => "<style>\n" + readFileSync(join(root, href), "utf8") + "</style>"
);
html = html.replace(
  /<script src="([^"]+)"><\/script>/g,
  (_, src) => "<script>\n" + readFileSync(join(root, src), "utf8") + "</script>"
);

mkdirSync(join(root, "dist"), { recursive: true });
const out = join(root, "dist", "tax-advisory-pro.html");
writeFileSync(out, html);
console.log("Wrote " + out + " (" + (html.length / 1024).toFixed(0) + " KB)");
