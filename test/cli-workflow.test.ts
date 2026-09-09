import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import {
  detectFramework,
  detectOutputDirectory,
  detectPackageManager,
  isDirectExecution,
  selectBuildScript,
} from "../packages/cli/src/index.js";

async function fixture(
  packageJson: Record<string, unknown>,
): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "lokiplay-cli-"));
  await writeFile(
    path.join(directory, "package.json"),
    `${JSON.stringify(packageJson, null, 2)}\n`,
  );
  return directory;
}

test("recognizes npm-style symlink as direct CLI execution", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "lokiplay-bin-"));
  const executable = path.join(directory, "dist", "index.js");
  const binDirectory = path.join(directory, "node_modules", ".bin");
  const binPath = path.join(binDirectory, "lokiplay");
  try {
    await mkdir(path.dirname(executable), { recursive: true });
    await mkdir(binDirectory, { recursive: true });
    await writeFile(executable, "#!/usr/bin/env node\n");
    await symlink(path.relative(binDirectory, executable), binPath);
    assert.equal(isDirectExecution(pathToFileURL(executable).href, binPath), true);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("detects package managers from lockfiles and rejects ambiguity", async () => {
  const directory = await fixture({ scripts: { build: "vite build" } });
  try {
    await writeFile(path.join(directory, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
    assert.equal(await detectPackageManager(directory), "pnpm");
    await writeFile(path.join(directory, "yarn.lock"), "");
    await assert.rejects(
      detectPackageManager(directory),
      /Ambiguous package manager.*pnpm-lock\.yaml.*yarn\.lock/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("detects frameworks without treating React as a replacement framework", async () => {
  const directory = await fixture({
    scripts: { build: "vite build" },
    dependencies: { react: "^19.0.0" },
    devDependencies: { vite: "^7.0.0" },
  });
  try {
    await writeFile(path.join(directory, "vite.config.ts"), "export default {};\n");
    assert.equal(await detectFramework(directory), "vite");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("rejects ambiguous framework build tools", async () => {
  const directory = await fixture({
    scripts: { build: "next build" },
    dependencies: { next: "^15.0.0" },
    devDependencies: { vite: "^7.0.0" },
  });
  try {
    await assert.rejects(
      detectFramework(directory),
      /Ambiguous framework\/build tool: next, vite/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("selects only an existing unambiguous build script", () => {
  assert.equal(
    selectBuildScript({ scripts: { build: "vite build", dev: "vite" } }),
    "build",
  );
  assert.equal(
    selectBuildScript({ scripts: { "build:production": "astro build" } }),
    "build:production",
  );
  assert.throws(
    () =>
      selectBuildScript({
        scripts: {
          "build:prod": "vite build",
          "build:production": "vite build",
        },
      }),
    /Ambiguous build scripts/,
  );
});

test("detects configured and common output directories", async () => {
  const configured = await fixture({
    scripts: { build: "vite build" },
    devDependencies: { vite: "^7.0.0" },
  });
  const common = await fixture({ scripts: { build: "custom-builder" } });
  try {
    await writeFile(
      path.join(configured, "vite.config.ts"),
      "export default { build: { outDir: 'release' } };\n",
    );
    assert.equal(
      await detectOutputDirectory(configured, "vite", "build"),
      path.join(configured, "release"),
    );
    await mkdir(path.join(common, "dist"));
    assert.equal(
      await detectOutputDirectory(common, "unknown", "build"),
      path.join(common, "dist"),
    );
  } finally {
    await rm(configured, { recursive: true, force: true });
    await rm(common, { recursive: true, force: true });
  }
});

test("rejects ambiguous output directories", async () => {
  const directory = await fixture({ scripts: { build: "custom-builder" } });
  try {
    await mkdir(path.join(directory, "dist"));
    await mkdir(path.join(directory, "build"));
    await assert.rejects(
      detectOutputDirectory(directory, "unknown", "build"),
      /Ambiguous output directory: found dist, build/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
