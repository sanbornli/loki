import { existsSync, readFileSync, writeFileSync } from "node:fs";

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
  if (info && info.version === current && !name.includes("lokiplay") && name !== "") {
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

for (const file of ["apps/web/hosted-sdk/stable.js", "apps/web/hosted-sdk/candidate.js"]) {
  if (!existsSync(file)) {
    if (file.endsWith("stable.js")) throw new Error(`${file} is missing`);
    continue;
  }
  const text = readFileSync(file, "utf8");
  const from = `/*lokiplay-hosted-sdk version=${current}`;
  if (!text.startsWith(from)) throw new Error(`${file} header is not ${current}`);
  writeFileSync(file, text.replace(from, `/*lokiplay-hosted-sdk version=${next}`));
  console.log(`${file}: header`);
}

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
