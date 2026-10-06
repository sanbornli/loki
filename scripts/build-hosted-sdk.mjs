// Builds the hosted browser SDK: one ES module that inlines @lokiplay/sdk,
// @lokiplay/protocol, and @heroiclabs/nakama-js.
//
//   node scripts/build-hosted-sdk.mjs
//     writes apps/web/hosted-sdk/candidate.js, and stable.js only when it
//     does not exist yet (stable changes only when a candidate is accepted).
//   node scripts/build-hosted-sdk.mjs --out <file>
//     writes just that file (used by the CLI build for `lokiplay preview`).
import { mkdir, readFile, writeFile, access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { build } from "esbuild";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// Measured at ~131 KB gzipped (zod alone is about two thirds of the raw size).
// The budget leaves modest headroom so the file cannot silently grow.
const MAX_GZIP_BYTES = 160 * 1024;
const COMPATIBILITY = 1;

// The protocol package imports node:crypto for stateHash(), which the browser
// SDK never calls. Give the browser build an inert stand-in.
const nodeCryptoShim = {
  name: "node-crypto-shim",
  setup(esbuildBuild) {
    esbuildBuild.onResolve({ filter: /^node:crypto$/ }, () => ({
      path: "node-crypto-shim",
      namespace: "loki-shim",
    }));
    esbuildBuild.onLoad({ filter: /.*/, namespace: "loki-shim" }, () => ({
      contents:
        'export function createHash() { throw new Error("node:crypto is not available in the browser"); }',
      loader: "js",
    }));
  },
};

export async function buildHostedSdk() {
  const sdkPackage = JSON.parse(
    await readFile(path.join(root, "packages/sdk-js/package.json"), "utf8"),
  );
  const version = String(sdkPackage.version);
  const entry = [
    'export * from "./packages/sdk-js/src/index.ts";',
    `export const LOKI_SDK_VERSION = ${JSON.stringify(version)};`,
    `export const LOKI_HOSTED_SDK_COMPATIBILITY = ${COMPATIBILITY};`,
  ].join("\n");
  const result = await build({
    stdin: { contents: entry, resolveDir: root, sourcefile: "hosted-sdk-entry.ts", loader: "ts" },
    bundle: true,
    write: false,
    format: "esm",
    platform: "browser",
    target: "es2020",
    minify: true,
    legalComments: "none",
    logLevel: "warning",
    plugins: [nodeCryptoShim],
    banner: {
      js: `/*lokiplay-hosted-sdk version=${version} compatibility=${COMPATIBILITY}*/`,
    },
  });
  const output = result.outputFiles[0];
  if (!output) throw new Error("hosted SDK build produced no output");
  const bytes = Buffer.from(output.contents);
  const gzipBytes = gzipSync(bytes, { level: 9 }).length;
  if (gzipBytes > MAX_GZIP_BYTES) {
    throw new Error(
      `hosted SDK is ${gzipBytes} bytes gzipped, over the ${MAX_GZIP_BYTES} byte limit`,
    );
  }
  return { bytes, version, gzipBytes };
}

async function exists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

async function main(argv) {
  const outIndex = argv.indexOf("--out");
  const built = await buildHostedSdk();
  if (outIndex !== -1) {
    const target = path.resolve(argv[outIndex + 1] ?? "");
    if (!argv[outIndex + 1]) throw new Error("--out requires a file path");
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, built.bytes);
    console.log(`hosted SDK ${built.version}: ${built.bytes.length} bytes, ${built.gzipBytes} gzipped -> ${target}`);
    return;
  }
  const directory = path.join(root, "apps/web/hosted-sdk");
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, "candidate.js"), built.bytes);
  const stable = path.join(directory, "stable.js");
  if (!(await exists(stable))) await writeFile(stable, built.bytes);
  console.log(`hosted SDK ${built.version}: ${built.bytes.length} bytes, ${built.gzipBytes} gzipped`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
