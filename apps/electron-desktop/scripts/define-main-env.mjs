#!/usr/bin/env node
/**
 * Inlines build-time environment variables into the compiled main-process JS.
 * Must run after `tsc` so that dist/main.js exists.
 *
 * Uses esbuild --define (no bundling) to replace process.env.* literals.
 * Also reads from a local .env file when env vars are not already set in the
 * shell — this covers both local dev builds and CI environments alike.
 */
import { build } from "esbuild";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

// Load .env if present, but don't override vars already set in the environment.
const envFile = join(root, ".env");
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf-8").split("\n")) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)=(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}

// Values must be valid JS expressions — JSON.stringify wraps them in quotes.
const define = {
  "process.env.POSTHOG_API_KEY": JSON.stringify(process.env.POSTHOG_API_KEY ?? ""),
};

const targets = ["dist/main/analytics/posthog-main.js"];

for (const target of targets) {
  await build({
    entryPoints: [join(root, target)],
    outfile: join(root, target),
    platform: "node",
    format: "cjs",
    allowOverwrite: true,
    define,
  });
}

console.log("[define-main-env] main-process env vars inlined.");
