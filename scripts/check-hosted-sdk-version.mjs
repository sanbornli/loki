import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync("packages/sdk-js/package.json", "utf8"));
const header = readFileSync("apps/web/hosted-sdk/stable.js", "utf8").split("\n", 1)[0] ?? "";
const match = header.match(/version=(\d+\.\d+\.\d+)/);
if (!match || match[1] !== pkg.version) {
  throw new Error(
    `apps/web/hosted-sdk/stable.js is ${match?.[1] ?? "unversioned"}, expected ${pkg.version}`,
  );
}
const tag = process.env.GITHUB_REF_NAME ?? "";
if (/^v\d+\.\d+\.\d+$/.test(tag) && tag.slice(1) !== pkg.version) {
  throw new Error(`tag ${tag} does not match @lokiplay/sdk ${pkg.version}`);
}
console.log(`hosted SDK ${match[1]} matches @lokiplay/sdk`);
