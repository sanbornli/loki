import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { renderMarketingPage } from "../apps/web/src/marketing-page.js";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputDirectory = resolve(repositoryRoot, "dist/marketing");
const assetDirectory = resolve(outputDirectory, "assets");

await mkdir(assetDirectory, { recursive: true });

await Promise.all([
  writeFile(
    resolve(outputDirectory, "index.html"),
    renderMarketingPage({
      apiOrigin: "https://api.lokiplay.cc",
      supabaseUrl: "https://auth.lokiplay.cc",
      supabaseAnonKey: "marketing-site",
    }),
  ),
  writeFile(
    resolve(outputDirectory, "_headers"),
    `/*
  Content-Security-Policy: default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' data:; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; object-src 'none'
  Referrer-Policy: strict-origin-when-cross-origin
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY

/
  Cache-Control: public, max-age=60, stale-while-revalidate=300

/assets/*
  Cache-Control: public, max-age=31536000, immutable
`,
  ),
  copyFile(
    resolve(
      repositoryRoot,
      "apps/web/src/assets/loki-vibecoded-game-montage.png",
    ),
    resolve(assetDirectory, "loki-vibecoded-game-montage.png"),
  ),
]);
