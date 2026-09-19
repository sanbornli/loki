// Keeps packages/cli's scaffolded AGENTS.md in sync with the single
// canonical source at packages/agent-instructions/templates/AGENTS.md.
// Run via `npm test`/`npm run check` (root "pretest") and via
// `packages/cli`'s own build script, so both the dev/test copy
// (packages/cli/src/AGENTS.template.md) and the published copy
// (packages/cli/dist/AGENTS.template.md, once dist exists) stay
// byte-identical to the canonical template without hand-copying.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const source = path.join(root, "packages/agent-instructions/templates/AGENTS.md");
const target = path.join(root, "packages/cli/src/AGENTS.template.md");

const content = await readFile(source, "utf8");
await mkdir(path.dirname(target), { recursive: true });
await writeFile(target, content);
