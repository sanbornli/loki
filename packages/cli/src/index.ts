#!/usr/bin/env node
import {
  chmod,
  copyFile,
  mkdir,
  readFile,
  readdir,
  stat,
  writeFile,
} from "node:fs/promises";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { zipSync } from "fflate";
import { GameManifestSchema } from "../../protocol/src/index.js";

const AGENT_INSTRUCTIONS = `# Loki integration rules

- Install and use \`@lokiplay/sdk\`; do not import Nakama APIs into game code.
- Production multiplayer runs only from a Loki-hosted finished browser build.
- Upload \`game.json\`, \`index.html\`, and static assets. Do not upload source-only
  repositories, backend processes, secrets, creator ad scripts, or localhost
  dependencies.
- MVP multiplayer is host-authoritative. Loki controls identity, tenant
  boundaries, membership, matchmaking, sequencing, snapshots, and host
  migration.
- Never trust or override the \`projectId\`, player identity, room membership, or
  sequence returned by Loki.
- Keep game state JSON-compatible and use finite safe integers.
- Handle reconnect snapshots, host changes, stale-update errors, and focus
  release when the Loki overlay opens.
- Connect and ship with \`npx lokiplay connect --project <uuid>\` followed by
  \`npx lokiplay ship\`.
`;

export type PackageManager = "npm" | "pnpm" | "yarn" | "bun";
export type Framework =
  | "vite"
  | "next"
  | "astro"
  | "sveltekit"
  | "angular"
  | "webpack"
  | "parcel"
  | "react-scripts"
  | "unknown";

interface PackageJson {
  name?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

async function exists(file: string): Promise<boolean> {
  try {
    await stat(file);
    return true;
  } catch {
    return false;
  }
}

async function readPackageJson(directory: string): Promise<PackageJson> {
  try {
    return JSON.parse(
      await readFile(path.join(directory, "package.json"), "utf8"),
    ) as PackageJson;
  } catch (error) {
    throw new Error(
      `Could not read package.json: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export async function detectPackageManager(
  directory: string,
): Promise<PackageManager> {
  const lockfiles: Array<[string, PackageManager]> = [
    ["package-lock.json", "npm"],
    ["npm-shrinkwrap.json", "npm"],
    ["pnpm-lock.yaml", "pnpm"],
    ["yarn.lock", "yarn"],
    ["bun.lock", "bun"],
    ["bun.lockb", "bun"],
  ];
  const found = await Promise.all(
    lockfiles.map(async ([file, manager]) => ({
      file,
      manager,
      found: await exists(path.join(directory, file)),
    })),
  );
  const present = found.filter((item) => item.found);
  const managers = [...new Set(present.map((item) => item.manager))];
  if (managers.length > 1) {
    throw new Error(
      `Ambiguous package manager: found ${present.map((item) => item.file).join(", ")}`,
    );
  }
  return managers[0] ?? "npm";
}

const frameworkConfigFiles: Record<Exclude<Framework, "unknown" | "react-scripts" | "parcel">, RegExp> = {
  vite: /^vite\.config\.(?:js|mjs|cjs|ts|mts|cts)$/,
  next: /^next\.config\.(?:js|mjs|cjs|ts)$/,
  astro: /^astro\.config\.(?:js|mjs|cjs|ts|mts|cts)$/,
  sveltekit: /^svelte\.config\.(?:js|mjs|cjs|ts)$/,
  angular: /^angular\.json$/,
  webpack: /^webpack\.config\.(?:js|mjs|cjs|ts)$/,
};

export async function detectFramework(directory: string): Promise<Framework> {
  const packageJson = await readPackageJson(directory);
  const dependencies = {
    ...packageJson.dependencies,
    ...packageJson.devDependencies,
  };
  const entries = await readdir(directory);
  const candidates = new Set<Exclude<Framework, "unknown">>();
  for (const [framework, pattern] of Object.entries(frameworkConfigFiles) as Array<
    [Exclude<Framework, "unknown" | "react-scripts" | "parcel">, RegExp]
  >) {
    if (entries.some((entry) => pattern.test(entry))) candidates.add(framework);
  }
  const dependencyMarkers: Array<[string, Exclude<Framework, "unknown">]> = [
    ["next", "next"],
    ["astro", "astro"],
    ["@sveltejs/kit", "sveltekit"],
    ["@angular/cli", "angular"],
    ["vite", "vite"],
    ["webpack", "webpack"],
    ["parcel", "parcel"],
    ["react-scripts", "react-scripts"],
  ];
  for (const [dependency, framework] of dependencyMarkers) {
    if (dependencies[dependency]) candidates.add(framework);
  }
  if (candidates.size > 1) {
    const compatible =
      candidates.size === 2 &&
      candidates.has("vite") &&
      candidates.has("sveltekit");
    if (!compatible) {
      throw new Error(
        `Ambiguous framework/build tool: ${[...candidates].sort().join(", ")}`,
      );
    }
    return "sveltekit";
  }
  return candidates.values().next().value ?? "unknown";
}

export function selectBuildScript(packageJson: PackageJson): string {
  const scripts = packageJson.scripts ?? {};
  if (typeof scripts.build === "string" && scripts.build.trim()) return "build";
  const candidates = Object.keys(scripts).filter(
    (name) =>
      /^build:(?:prod|production)$/.test(name) &&
      typeof scripts[name] === "string" &&
      scripts[name]!.trim().length > 0,
  );
  if (candidates.length > 1) {
    throw new Error(`Ambiguous build scripts: ${candidates.join(", ")}`);
  }
  if (candidates.length === 1) return candidates[0]!;
  throw new Error(
    "No existing build script found (expected build, build:prod, or build:production)",
  );
}

function scriptOutputCandidates(script: string): string[] {
  const candidates: string[] = [];
  for (const pattern of [
    /(?:^|\s)--outDir(?:=|\s+)(?:"([^"]+)"|'([^']+)'|([^\s]+))/g,
    /(?:^|\s)--output-path(?:=|\s+)(?:"([^"]+)"|'([^']+)'|([^\s]+))/g,
    /(?:^|\s)--output(?:=|\s+)(?:"([^"]+)"|'([^']+)'|([^\s]+))/g,
  ]) {
    for (const match of script.matchAll(pattern)) {
      candidates.push(match[1] ?? match[2] ?? match[3]!);
    }
  }
  return candidates;
}

async function configOutputCandidates(
  directory: string,
  framework: Framework,
): Promise<string[]> {
  if (framework === "angular") {
    const input = JSON.parse(
      await readFile(path.join(directory, "angular.json"), "utf8"),
    ) as {
      projects?: Record<
        string,
        { architect?: { build?: { options?: { outputPath?: string | { base?: string } } } } }
      >;
    };
    return Object.values(input.projects ?? {}).flatMap((project) => {
      const output = project.architect?.build?.options?.outputPath;
      if (typeof output === "string") return [output];
      return output?.base ? [output.base] : [];
    });
  }
  const matcher =
    framework === "vite" || framework === "astro"
      ? /\boutDir\s*:\s*["']([^"']+)["']/g
      : framework === "webpack"
        ? /\bpath\s*:\s*(?:path\.(?:resolve|join)\([^,]+,\s*)?["']([^"']+)["']/g
        : undefined;
  if (matcher) {
    const entries = await readdir(directory);
    const configPattern =
      framework === "webpack"
        ? frameworkConfigFiles.webpack
        : framework === "astro"
          ? frameworkConfigFiles.astro
          : frameworkConfigFiles.vite;
    const candidates: string[] = [];
    for (const entry of entries.filter((name) => configPattern.test(name))) {
      const source = await readFile(path.join(directory, entry), "utf8");
      for (const match of source.matchAll(matcher)) candidates.push(match[1]!);
    }
    return candidates;
  }
  if (framework === "next") {
    const entries = await readdir(directory);
    for (const entry of entries.filter((name) => frameworkConfigFiles.next.test(name))) {
      const source = await readFile(path.join(directory, entry), "utf8");
      if (/\boutput\s*:\s*["']export["']/.test(source)) return ["out"];
    }
  }
  return [];
}

export async function detectOutputDirectory(
  directory: string,
  framework?: Framework,
  buildScript?: string,
): Promise<string> {
  const selectedFramework = framework ?? (await detectFramework(directory));
  const packageJson = await readPackageJson(directory);
  const scriptName = buildScript ?? selectBuildScript(packageJson);
  const explicit = [
    ...scriptOutputCandidates(packageJson.scripts?.[scriptName] ?? ""),
    ...(await configOutputCandidates(directory, selectedFramework)),
  ];
  const normalizedExplicit = [
    ...new Set(explicit.map((candidate) => candidate.replace(/^\.\//, "").replace(/\/$/, ""))),
  ];
  if (normalizedExplicit.length > 1) {
    throw new Error(
      `Ambiguous output directory in build configuration: ${normalizedExplicit.join(", ")}`,
    );
  }
  if (normalizedExplicit.length === 1) {
    return path.resolve(directory, normalizedExplicit[0]!);
  }
  const defaults: Partial<Record<Framework, string>> = {
    vite: "dist",
    astro: "dist",
    sveltekit: "build",
    angular: "dist",
    webpack: "dist",
    parcel: "dist",
    "react-scripts": "build",
  };
  const common = ["dist", "build", "out"];
  const existing = (
    await Promise.all(
      common.map(async (candidate) => ({
        candidate,
        exists: await exists(path.join(directory, candidate)),
      })),
    )
  ).filter((item) => item.exists);
  const preferred = defaults[selectedFramework];
  if (existing.length > 1) {
    throw new Error(
      `Ambiguous output directory: found ${existing.map((item) => item.candidate).join(", ")}`,
    );
  }
  if (existing.length === 1) return path.join(directory, existing[0]!.candidate);
  if (preferred) return path.join(directory, preferred);
  throw new Error(
    "Could not detect build output; configure an output directory or create one of dist, build, or out",
  );
}

async function walk(root: string, relative = ""): Promise<string[]> {
  const directory = path.join(root, relative);
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const child = path.posix.join(relative.replaceAll("\\", "/"), entry.name);
    if (entry.isSymbolicLink()) throw new Error(`symbolic link not allowed: ${child}`);
    if (entry.isDirectory()) files.push(...(await walk(root, child)));
    else if (entry.isFile()) files.push(child);
  }
  return files;
}

export async function initializeProject(
  directory: string,
  input: { name: string; projectId?: string },
): Promise<void> {
  await mkdir(directory, { recursive: true });
  const manifestPath = path.join(directory, "game.json");
  try {
    await stat(manifestPath);
  } catch {
    await writeFile(
      manifestPath,
      `${JSON.stringify(
        {
          schemaVersion: 1,
          name: input.name,
          entrypoint: "index.html",
          multiplayer: {
            enabled: true,
            authority: "host",
            maxPlayers: 8,
            tickRate: 10,
          },
          networkAllowlist: [],
        },
        null,
        2,
      )}\n`,
    );
  }
  await writeFile(path.join(directory, "AGENTS.md"), AGENT_INSTRUCTIONS);
  if (input.projectId) {
    await mkdir(path.join(directory, ".loki"), { recursive: true });
    await writeFile(
      path.join(directory, ".loki", "project.json"),
      `${JSON.stringify({ projectId: input.projectId }, null, 2)}\n`,
    );
  }
}

export async function validateBuildDirectory(directory: string): Promise<{
  files: string[];
  warnings: string[];
}> {
  const files = await walk(directory);
  if (!files.includes("game.json")) throw new Error("game.json is required");
  const manifest = GameManifestSchema.parse(
    JSON.parse(await readFile(path.join(directory, "game.json"), "utf8")),
  );
  if (!files.includes(manifest.entrypoint)) {
    throw new Error(`entrypoint ${manifest.entrypoint} is missing`);
  }
  const warnings: string[] = [];
  let multiplayerSdkDetected = !manifest.multiplayer?.enabled;
  for (const file of files) {
    if (/(^|\/)(server|backend)(\.|\/)/i.test(file)) {
      throw new Error(`backend source is not supported: ${file}`);
    }
    if (!/\.(?:html|js|mjs|css|json|txt)$/i.test(file)) continue;
    const source = await readFile(path.join(directory, file), "utf8");
    if (/@lokiplay\/sdk|FirstPartyTransport|LokiClient/.test(source)) {
      multiplayerSdkDetected = true;
    }
    if (/@heroiclabs\/nakama-js|new\s+Client\s*\([^)]*(?:7350|nakama)/i.test(source)) {
      throw new Error(
        `${file}: import @lokiplay/sdk instead of connecting to Nakama directly`,
      );
    }
    if (
      /socket\.io-client|(?:https?:\/\/[^"'`\s]+)?\/socket\.io\b|io\s*\(\s*["'`]https?:/i.test(
        source,
      )
    ) {
      throw new Error(
        `${file}: obsolete Socket.IO multiplayer backend must be migrated to @lokiplay/sdk`,
      );
    }
    if (/https?:\/\/(?:localhost|127\.0\.0\.1)/i.test(source)) {
      warnings.push(`${file}: contains a localhost URL`);
    }
  }
  if (!multiplayerSdkDetected) {
    warnings.push(
      "multiplayer build does not visibly include @lokiplay/sdk; verify the published SDK and FirstPartyTransport are bundled",
    );
  }
  return { files, warnings };
}

export async function archiveBuild(directory: string): Promise<Uint8Array> {
  const validation = await validateBuildDirectory(directory);
  const archive: Record<string, [Uint8Array, { mtime: Date }]> = {};
  for (const file of [...validation.files].sort()) {
    if (file.startsWith(".loki/") || file === "AGENTS.md") continue;
    archive[file] = [
      new Uint8Array(await readFile(path.join(directory, file))),
      { mtime: new Date("1980-01-01T00:00:00.000Z") },
    ];
  }
  return zipSync(archive, { level: 6 });
}

async function readCliSession(): Promise<
  { endpoint: string; accessToken: string } | undefined
> {
  try {
    return JSON.parse(
      await readFile(
        path.join(os.homedir(), ".config", "lokiplay", "session.json"),
        "utf8",
      ),
    ) as { endpoint: string; accessToken: string };
  } catch {
    return undefined;
  }
}

async function readProjectId(directory: string): Promise<string | undefined> {
  if (process.env.LOKI_PROJECT_ID) return process.env.LOKI_PROJECT_ID;
  try {
    const linked = JSON.parse(
      await readFile(path.join(directory, ".loki", "project.json"), "utf8"),
    ) as { projectId?: string };
    return linked.projectId;
  } catch {
    return undefined;
  }
}

interface ParsedArguments {
  command?: string;
  directory: string;
  projectId?: string;
}

function parseArguments(argv: string[]): ParsedArguments {
  const command = argv[0];
  let directory: string | undefined;
  let projectId: string | undefined;
  const positional: string[] = [];
  for (let index = 1; index < argv.length; index += 1) {
    const argument = argv[index]!;
    if (argument === "--") {
      positional.push(...argv.slice(index + 1));
      break;
    }
    if (argument === "--project" || argument === "--dir") {
      const value = argv[++index];
      if (!value || value.startsWith("--")) {
        throw new Error(`${argument} requires a value`);
      }
      if (argument === "--project") {
        if (projectId) throw new Error("--project may only be specified once");
        projectId = value;
      } else {
        if (directory) throw new Error("--dir may only be specified once");
        directory = value;
      }
      continue;
    }
    if (argument.startsWith("--project=")) {
      if (projectId) throw new Error("--project may only be specified once");
      projectId = argument.slice("--project=".length);
      if (!projectId) throw new Error("--project requires a value");
      continue;
    }
    if (argument.startsWith("--dir=")) {
      if (directory) throw new Error("--dir may only be specified once");
      directory = argument.slice("--dir=".length);
      if (!directory) throw new Error("--dir requires a value");
      continue;
    }
    if (argument.startsWith("-")) throw new Error(`Unknown option: ${argument}`);
    positional.push(argument);
  }
  if (positional.length > 1 || (directory && positional.length)) {
    throw new Error("Specify exactly one directory, either positionally or with --dir");
  }
  return {
    command,
    directory: path.resolve(directory ?? positional[0] ?? "."),
    projectId,
  };
}

function requireUuid(value: string | undefined, option: string): string {
  if (
    !value ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  ) {
    throw new Error(`${option} must be a valid UUID`);
  }
  return value;
}

function stage(
  name: string,
  status: "started" | "complete" | "reused",
  detail?: Record<string, unknown>,
): void {
  console.log(JSON.stringify({ stage: name, status, ...detail }));
}

async function apiJson<T>(
  url: string,
  accessToken: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      authorization: `Bearer ${accessToken}`,
      ...init?.headers,
    },
  });
  if (!response.ok) throw new Error(await response.text());
  return (await response.json()) as T;
}

async function connectProject(
  directory: string,
  projectId: string,
  session?: { endpoint: string; accessToken: string },
): Promise<void> {
  if (session) {
    await apiJson(`${session.endpoint}/v1/projects/${projectId}`, session.accessToken);
  }
  const packageJson = await readPackageJson(directory);
  await initializeProject(directory, {
    name:
      typeof packageJson.name === "string" && packageJson.name.trim()
        ? packageJson.name
        : path.basename(directory),
    projectId,
  });
  console.log(`Connected project ${projectId}`);
  console.log("Required package: @lokiplay/sdk");
  console.log("Optional web UI package: @lokiplay/ui-web");
}

async function runBuild(
  directory: string,
  packageManager: PackageManager,
  script: string,
): Promise<void> {
  const command: Record<PackageManager, [string, string[]]> = {
    npm: ["npm", ["run", script]],
    pnpm: ["pnpm", ["run", script]],
    yarn: ["yarn", ["run", script]],
    bun: ["bun", ["run", script]],
  };
  const [executable, args] = command[packageManager];
  await new Promise<void>((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd: directory,
      stdio: "inherit",
      shell: false,
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve();
      else {
        reject(
          new Error(
            `Build failed (${signal ? `signal ${signal}` : `exit ${code ?? "unknown"}`})`,
          ),
        );
      }
    });
  });
}

interface DeploymentResult {
  id: string;
  projectId: string;
  contentHash: string;
  status: "ready" | "ready_with_warnings" | "blocked";
  playableUrl?: string;
}

async function activateDeployment(
  endpoint: string,
  accessToken: string,
  projectId: string,
  deploymentId: string,
): Promise<void> {
  await apiJson(
    `${endpoint}/v1/projects/${projectId}/deployments/${deploymentId}/activate`,
    accessToken,
    { method: "POST" },
  );
}

async function pollDeployment(
  endpoint: string,
  accessToken: string,
  projectId: string,
  deploymentId: string,
): Promise<DeploymentResult> {
  stage("poll", "started", { deploymentId });
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const deployments = await apiJson<DeploymentResult[]>(
      `${endpoint}/v1/projects/${projectId}/deployments`,
      accessToken,
    );
    const deployment = deployments.find((candidate) => candidate.id === deploymentId);
    if (deployment) {
      if (deployment.status === "blocked") {
        throw new Error(`Deployment ${deploymentId} was blocked`);
      }
      stage("poll", "complete", {
        deploymentId,
        deploymentStatus: deployment.status,
      });
      return deployment;
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error(`Timed out waiting for deployment ${deploymentId}`);
}

async function ship(directory: string, requestedProjectId?: string): Promise<void> {
  stage("authenticate", "started");
  const session = await readCliSession();
  const endpoint = process.env.LOKI_API_URL ?? session?.endpoint;
  if (!endpoint || !session?.accessToken) throw new Error("Run `lokiplay login` first");
  stage("authenticate", "complete");

  const linkedProjectId = await readProjectId(directory);
  const projectId = requireUuid(
    requestedProjectId ?? linkedProjectId,
    requestedProjectId ? "--project" : "linked project",
  );
  if (!linkedProjectId || linkedProjectId !== projectId) {
    stage("connect", "started", { projectId });
    await connectProject(directory, projectId, {
      endpoint,
      accessToken: session.accessToken,
    });
    stage("connect", "complete", { projectId });
  }

  const packageJson = await readPackageJson(directory);
  const packageManager = await detectPackageManager(directory);
  const framework = await detectFramework(directory);
  const buildScript = selectBuildScript(packageJson);
  stage("build", "started", { packageManager, framework, script: buildScript });
  await runBuild(directory, packageManager, buildScript);
  stage("build", "complete");

  const outputDirectory = await detectOutputDirectory(
    directory,
    framework,
    buildScript,
  );
  if (!(await exists(outputDirectory))) {
    throw new Error(`Build output does not exist: ${outputDirectory}`);
  }
  const sourceManifest = path.join(directory, "game.json");
  if (!(await exists(sourceManifest))) {
    throw new Error("game.json is required; run `lokiplay connect --project <uuid>`");
  }
  if (path.resolve(outputDirectory) !== path.resolve(directory)) {
    await copyFile(sourceManifest, path.join(outputDirectory, "game.json"));
  }
  stage("validate", "started", { outputDirectory });
  const validation = await validateBuildDirectory(outputDirectory);
  for (const warning of validation.warnings) console.warn(`Warning: ${warning}`);
  stage("validate", "complete", { files: validation.files.length });

  const archive = await archiveBuild(outputDirectory);
  const contentHash = createHash("sha256").update(archive).digest("hex");
  stage("hash", "complete", { contentHash });
  const existingResponse = await fetch(
    `${endpoint}/v1/projects/${projectId}/deployments/by-hash/${contentHash}`,
    { headers: { authorization: `Bearer ${session.accessToken}` } },
  );
  if (existingResponse.status !== 404 && !existingResponse.ok) {
    throw new Error(await existingResponse.text());
  }
  let deployment =
    existingResponse.status === 404
      ? undefined
      : ((await existingResponse.json()) as DeploymentResult);
  if (deployment?.status === "blocked") deployment = undefined;

  if (deployment) {
    stage("upload", "reused", { deploymentId: deployment.id });
    stage("activate", "started", { deploymentId: deployment.id });
    await activateDeployment(endpoint, session.accessToken, projectId, deployment.id);
    stage("activate", "complete", { deploymentId: deployment.id });
    const polled = await pollDeployment(
      endpoint,
      session.accessToken,
      projectId,
      deployment.id,
    );
    deployment = { ...polled, playableUrl: deployment.playableUrl };
  } else {
    stage("credentials", "started");
    const credential = await apiJson<{ credentialId: string; secret: string }>(
      `${endpoint}/v1/projects/${projectId}/deployment-credentials`,
      session.accessToken,
      { method: "POST" },
    );
    stage("credentials", "complete");
    stage("upload", "started", { contentHash });
    stage("activate", "started");
    const response = await fetch(`${endpoint}/v1/deployments?activate=true`, {
      method: "POST",
      headers: {
        "content-type": "application/zip",
        "x-loki-credential-id": credential.credentialId,
        authorization: `Bearer ${credential.secret}`,
      },
      body: Buffer.from(archive),
    });
    if (!response.ok) throw new Error(await response.text());
    deployment = (await response.json()) as DeploymentResult;
    stage("upload", "complete", {
      deploymentId: deployment.id,
      deploymentStatus: deployment.status,
    });
    stage("activate", "complete", { deploymentId: deployment.id });
    const polled = await pollDeployment(
      endpoint,
      session.accessToken,
      projectId,
      deployment.id,
    );
    deployment = { ...polled, playableUrl: deployment.playableUrl };
  }

  stage("ready", "complete", { deploymentId: deployment.id });
  console.log(`Deployment ID: ${deployment.id}`);
  const playableUrl =
    deployment.playableUrl ??
    (process.env.LOKI_WEB_URL
      ? `${process.env.LOKI_WEB_URL.replace(/\/$/, "")}/play/${projectId}`
      : undefined);
  if (!playableUrl) {
    throw new Error("Deployment succeeded, but the API did not return a playable URL");
  }
  console.log(`Playable URL: ${playableUrl}`);
}

async function main(argv: string[]): Promise<void> {
  const { command, directory, projectId } = parseArguments(argv);
  if (command === "login") {
    const endpoint = process.env.LOKI_API_URL;
    if (!endpoint) throw new Error("LOKI_API_URL is required");
    const started = await fetch(`${endpoint}/v1/cli/device`, { method: "POST" });
    if (!started.ok) throw new Error(await started.text());
    const device = (await started.json()) as {
      deviceCode: string;
      userCode: string;
      verificationUri: string;
      interval: number;
      expiresIn: number;
    };
    const verificationUrl = new URL(device.verificationUri);
    verificationUrl.searchParams.set("user_code", device.userCode);
    console.log(`Open ${verificationUrl.toString()} and confirm ${device.userCode}`);
    const deadline = Date.now() + device.expiresIn * 1_000;
    while (Date.now() < deadline) {
      await new Promise((resolve) =>
        setTimeout(resolve, Math.max(1, device.interval) * 1_000),
      );
      const polled = await fetch(
        `${endpoint}/v1/cli/device/${encodeURIComponent(device.deviceCode)}`,
      );
      if (polled.status === 202) continue;
      if (!polled.ok) throw new Error(await polled.text());
      const session = (await polled.json()) as { accessToken: string };
      const configDirectory = path.join(os.homedir(), ".config", "lokiplay");
      const configPath = path.join(configDirectory, "session.json");
      await mkdir(configDirectory, { recursive: true, mode: 0o700 });
      await writeFile(
        configPath,
        `${JSON.stringify({ endpoint, accessToken: session.accessToken })}\n`,
        { mode: 0o600 },
      );
      await chmod(configPath, 0o600);
      console.log("Logged in");
      return;
    }
    throw new Error("device login expired");
  }
  if (command === "init") {
    await initializeProject(directory, {
      name: path.basename(directory),
      projectId: process.env.LOKI_PROJECT_ID,
    });
    console.log("Initialized Loki project");
    return;
  }
  if (command === "connect") {
    const id = requireUuid(projectId, "--project");
    const session = await readCliSession();
    const endpoint = process.env.LOKI_API_URL ?? session?.endpoint;
    if (!endpoint || !session?.accessToken) {
      throw new Error("Run `lokiplay login` first");
    }
    await connectProject(directory, id, {
      endpoint,
      accessToken: session.accessToken,
    });
    return;
  }
  if (command === "ship") {
    await ship(directory, projectId);
    return;
  }
  if (command === "validate") {
    const result = await validateBuildDirectory(directory);
    console.log(`Valid build: ${result.files.length} files`);
    for (const warning of result.warnings) console.warn(`Warning: ${warning}`);
    return;
  }
  if (command === "deploy") {
    const session = await readCliSession();
    const endpoint = process.env.LOKI_API_URL ?? session?.endpoint;
    const projectId = await readProjectId(directory);
    if (!endpoint || !projectId) {
      throw new Error("Log in and link a project before deploying");
    }
    let credentialId = process.env.LOKI_DEPLOY_CREDENTIAL_ID;
    let secret = process.env.LOKI_DEPLOY_SECRET;
    if (!credentialId || !secret) {
      if (!session?.accessToken) throw new Error("Run `lokiplay login` first");
      const credentialResponse = await fetch(
        `${endpoint}/v1/projects/${projectId}/deployment-credentials`,
        {
          method: "POST",
          headers: { authorization: `Bearer ${session.accessToken}` },
        },
      );
      if (!credentialResponse.ok) throw new Error(await credentialResponse.text());
      const credential = (await credentialResponse.json()) as {
        credentialId: string;
        secret: string;
      };
      credentialId = credential.credentialId;
      secret = credential.secret;
    }
    const archive = await archiveBuild(directory);
    const response = await fetch(`${endpoint}/v1/deployments`, {
      method: "POST",
      headers: {
        "content-type": "application/zip",
        "x-loki-credential-id": credentialId,
        authorization: `Bearer ${secret}`,
      },
      body: Buffer.from(archive),
    });
    if (!response.ok) throw new Error(await response.text());
    console.log(JSON.stringify(await response.json(), null, 2));
    return;
  }
  if (command === "status") {
    const session = await readCliSession();
    const endpoint = process.env.LOKI_API_URL ?? session?.endpoint;
    const projectId = await readProjectId(directory);
    if (!endpoint || !projectId || !session?.accessToken) {
      throw new Error("Log in and link a project before checking status");
    }
    const response = await fetch(`${endpoint}/v1/projects/${projectId}`, {
      headers: { authorization: `Bearer ${session.accessToken}` },
    });
    if (!response.ok) throw new Error(await response.text());
    console.log(JSON.stringify(await response.json(), null, 2));
    return;
  }
  throw new Error(
    "usage: lokiplay <login|init|connect|validate|ship|deploy|status> [directory] [--project <uuid>]",
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
