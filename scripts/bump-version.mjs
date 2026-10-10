import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";

const next = process.argv[2];
if (!/^\d+\.\d+\.\d+$/.test(next ?? "")) {
  throw new Error("usage: node scripts/bump-version.mjs <version>");
}

const current = JSON.parse(readFileSync("packages/protocol/package.json", "utf8")).version;
if (current === next) throw new Error(`${next} is already the package version`);

const files = [
  "packages/protocol/package.json",
  "packages/sdk-js/package.json",
  "packages/ui-web/package.json",
  "packages/mcp/package.json",
  "packages/cli/package.json",
  "clients/unity/package.json",
  "clients/kotlin/build.gradle.kts",
  "apps/api/package.json",
  "apps/web/package.json",
  "package-lock.json",
  "packages/mcp/src/index.ts",
  "apps/web/src/creator-page.ts",
  "apps/web/src/docs-site.ts",
  "scripts/verify-native-registry-install.ts",
  "release-identity.json",
];

const lock = JSON.parse(readFileSync("package-lock.json", "utf8"));
for (const [name, info] of Object.entries(lock.packages ?? {})) {
  // Workspace entries (apps/*, packages/*) are ours. A third-party package
  // under node_modules that happens to share the version must not be touched.
  if (info && info.version === current && name.includes("node_modules/") && !name.includes("@lokiplay/")) {
    throw new Error(`package-lock.json has ${name}@${current}; refusing a blind replace`);
  }
}

for (const file of files) {
  const text = readFileSync(file, "utf8");
  const count = text.split(current).length - 1;
  if (count === 0) throw new Error(`${file} does not contain ${current}`);
  writeFileSync(file, text.replaceAll(current, next));
  console.log(`${file}: ${count}`);
}

// The built SDK embeds its version in the header and in LOKI_SDK_VERSION, so
// rebuild it instead of editing text. The build keeps stable.js if it exists.
const stable = "apps/web/hosted-sdk/stable.js";
if (!existsSync(stable)) throw new Error(`${stable} is missing`);
unlinkSync(stable);
execFileSync("node", ["scripts/build-hosted-sdk.mjs"], { stdio: "inherit" });
if (!readFileSync(stable, "utf8").startsWith(`/*lokiplay-hosted-sdk version=${next}`)) {
  throw new Error(`${stable} was not rebuilt at ${next}`);
}
console.log(`${stable}: rebuilt`);

const docsPath = "apps/web/src/docs-page.ts";
const docs = readFileSync(docsPath, "utf8");
const marker = `<h2>${current}</h2>`;
if (!docs.includes(`<h2>${next}</h2>`) && docs.includes(marker)) {
  writeFileSync(
    docsPath,
    docs.replace(
      marker,
      `<h2>${next}</h2>\n          <p>Release ${next}.</p>\n          ${marker}`,
    ),
  );
  console.log(`${docsPath}: changelog heading`);
}

console.log(`bumped ${current} -> ${next}`);
