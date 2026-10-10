import { readFileSync, writeFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync("packages/protocol/package.json", "utf8"));
const commit = process.env.GITHUB_SHA || process.env.LOKI_GIT_SHA || "unknown";
const identity = { version: pkg.version, commit };
writeFileSync("release-identity.json", `${JSON.stringify(identity, null, 2)}\n`);
console.log(`release identity ${identity.version} ${identity.commit}`);
