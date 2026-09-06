import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

const mode = process.argv.includes("--registry") ? "registry" : "local";
const outputPosition = process.argv.indexOf("--output");
const output =
  outputPosition === -1
    ? undefined
    : process.argv[outputPosition + 1];
const explicitSpecs = process.argv
  .slice(2)
  .filter(
    (argument, index, all) =>
      !argument.startsWith("--") &&
      all[index - 1] !== "--output",
  );
const specs: string[] =
  mode === "registry"
    ? (JSON.parse(
        process.env.LOKI_REGISTRY_PACKAGE_SPECS ?? "null",
      ) as unknown as string[])
    : explicitSpecs;
if (!Array.isArray(specs) || specs.length === 0) {
  throw new Error(
    mode === "registry"
      ? "LOKI_REGISTRY_PACKAGE_SPECS must be a JSON array of exact package@version specs"
      : "provide local package tarball paths",
  );
}
if (
  mode === "registry" &&
  specs.some(
    (spec) =>
      typeof spec !== "string" ||
      /(?:latest|next|workspace:|file:|https?:|git\+)/.test(spec) ||
      !/@[^@/]+$/.test(spec),
  )
) {
  throw new Error("registry smoke requires exact immutable package versions");
}

async function run(
  command: string,
  args: string[],
  cwd: string,
): Promise<void> {
  await new Promise<void>((resolveRun, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: "inherit",
      env: { ...process.env, npm_config_package_lock: "false" },
    });
    child.once("error", reject);
    child.once("exit", (code) =>
      code === 0
        ? resolveRun()
        : reject(new Error(`${command} exited with ${code}`)),
    );
  });
}

const directory = await mkdtemp(join(tmpdir(), "loki-package-smoke-"));
try {
  await writeFile(
    join(directory, "package.json"),
    JSON.stringify({ name: "loki-package-smoke", private: true, type: "module" }),
  );
  await run(
    "npm",
    ["install", "--ignore-scripts", "--no-audit", "--no-fund", ...specs],
    directory,
  );
  const installed = JSON.parse(
    await readFile(join(directory, "package.json"), "utf8"),
  ) as { dependencies?: Record<string, string> };
  const packageNames = Object.keys(installed.dependencies ?? {});
  await writeFile(
    join(directory, "smoke.mjs"),
    [
      "globalThis.HTMLElement ??= class { attachShadow() { return {}; } };",
      "globalThis.customElements ??= { get() { return undefined; }, define() {} };",
      ...packageNames.map(
        (name) =>
          `await import(${JSON.stringify(name)}).then((value) => { if (!value || typeof value !== "object") throw new Error("empty module: ${name}"); });`,
      ),
    ].join("\n"),
  );
  await run("node", ["smoke.mjs"], directory);
  const artifact = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    mode,
    requestedSpecs: specs,
    installedPackages: installed.dependencies,
    imported: packageNames,
    passed: true,
  };
  if (output) {
    await writeFile(output, `${JSON.stringify(artifact, null, 2)}\n`, {
      flag: "wx",
    });
  }
  console.log(JSON.stringify(artifact, null, 2));
} finally {
  await rm(directory, { recursive: true, force: true });
}
