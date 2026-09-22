import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildLlmsFull,
  docsRoutes,
  llmsTxt,
  renderDocsPage,
} from "../apps/web/src/docs-page.js";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputDirectory = resolve(repositoryRoot, "dist/docs");
const assetDirectory = resolve(outputDirectory, "assets");
const config = {
  apiOrigin: "https://api.lokiplay.cc",
  supabaseUrl: "https://auth.lokiplay.cc",
  supabaseAnonKey: "docs-site",
};

function outputPathFor(route: string): string {
  return route === "/" ? "index.html" : `${route.slice(1)}/index.html`;
}

const agentsMarkdown = await readFile(
  resolve(repositoryRoot, "packages/agent-instructions/templates/AGENTS.md"),
  "utf8",
);

const llmsFull = buildLlmsFull(agentsMarkdown);

await mkdir(assetDirectory, { recursive: true });

await Promise.all([
  ...docsRoutes.map(async (route) => {
    const relative = outputPathFor(route);
    const filePath = resolve(outputDirectory, relative);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, renderDocsPage(config, route));
  }),
  writeFile(resolve(outputDirectory, "llms.txt"), `${llmsTxt.trim()}\n`),
  writeFile(resolve(outputDirectory, "llms-full.txt"), `${llmsFull.trim()}\n`),
  writeFile(
    resolve(outputDirectory, "_headers"),
    `/*
  Content-Security-Policy: default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' data:; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; object-src 'none'
  Referrer-Policy: strict-origin-when-cross-origin
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Cache-Control: public, max-age=60, stale-while-revalidate=300

/llms.txt
  Content-Type: text/plain; charset=utf-8

/llms-full.txt
  Content-Type: text/plain; charset=utf-8

/assets/*
  Cache-Control: public, max-age=31536000, immutable
`,
  ),
  ...[
    "loki-mark.png",
    "loki-app-icon-dark.png",
    "loki-app-icon-light.png",
    "loki-lockup-dark.png",
    "loki-lockup-light.png",
  ].map((fileName) =>
    copyFile(
      resolve(repositoryRoot, "apps/web/src/assets/brand", fileName),
      resolve(assetDirectory, fileName),
    ),
  ),
]);
