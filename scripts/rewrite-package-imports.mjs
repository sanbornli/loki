import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

const outputDirectory = path.resolve(process.argv[2] ?? "dist");
const workspaceProtocolImport = "../../protocol/src/index.js";

for (const entry of await readdir(outputDirectory, { withFileTypes: true })) {
  if (!entry.isFile() || !/\.(?:js|d\.ts)$/.test(entry.name)) continue;
  const file = path.join(outputDirectory, entry.name);
  const source = await readFile(file, "utf8");
  const rewritten = source.replaceAll(
    workspaceProtocolImport,
    "@lokiplay/protocol",
  );
  if (rewritten !== source) await writeFile(file, rewritten);
}
