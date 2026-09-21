import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  marketingRoutes,
  renderMarketingPage,
} from "../apps/web/src/marketing-page.js";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputDirectory = resolve(repositoryRoot, "dist/marketing");
const assetDirectory = resolve(outputDirectory, "assets");
const config = {
  apiOrigin: "https://api.lokiplay.cc",
  supabaseUrl: "https://auth.lokiplay.cc",
  supabaseAnonKey: "marketing-site",
};

function outputPathFor(route: string): string {
  return route === "/" ? "index.html" : `${route.slice(1)}/index.html`;
}

await mkdir(assetDirectory, { recursive: true });

await Promise.all([
  ...marketingRoutes.map(async (route) => {
    const relative = outputPathFor(route);
    const filePath = resolve(outputDirectory, relative);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, renderMarketingPage(config, route));
  }),
  writeFile(
    resolve(outputDirectory, "_headers"),
    `/*
  Content-Security-Policy: default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' data:; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; object-src 'none'
  Referrer-Policy: strict-origin-when-cross-origin
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
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
  ...[
    "CUBE_2D_DARK.svg",
    "claude-color.svg",
    "openai-light.svg",
    "replit-color.svg",
    "lovable-color.svg",
    "cursor-screen.jpg",
    "cursor-screen-prompt.jpg",
    "phone-share.png",
  ].map((fileName) =>
    copyFile(
      resolve(repositoryRoot, "apps/web/src/assets/marketing", fileName),
      resolve(assetDirectory, fileName),
    ),
  ),
]);
