import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import vm from "node:vm";
import { gzipSync } from "node:zlib";
import { strToU8, zipSync } from "fflate";
import { DeploymentService, MemoryArtifactStore } from "../apps/api/src/deployments.js";
import { PlatformService } from "../apps/api/src/platform.js";
import { startApiServer } from "../apps/api/src/server.js";
import { hostedSdkBundleFromSource, type HostedSdkConfig } from "../apps/web/src/hosted-sdk.js";
import { renderPlayerShell } from "../apps/web/src/player.js";
import { startWebServer } from "../apps/web/src/server.js";
import {
  startPreviewServer,
  validateBuildDirectory,
} from "../packages/cli/src/index.js";
import {
  HOSTED_SDK_BUILD_MARKER,
  HOSTED_SDK_COMPATIBILITY,
  HOSTED_SDK_IMPORT_MAP,
  hostedSdkBanner,
  hostedSdkImportMapCspSource,
  injectHostedSdkHtml,
  parseHostedSdkBanner,
  renderHostedSdkSupportScript,
} from "../packages/protocol/src/index.js";
import * as sdkSource from "../packages/sdk-js/src/index.js";

const run = promisify(execFile);
const root = path.resolve(import.meta.dirname, "..");

const manifest = {
  schemaVersion: 1 as const,
  name: "Counter Party",
  entrypoint: "index.html",
  multiplayer: { enabled: true, authority: "host" as const, maxPlayers: 8, tickRate: 10 },
  networkAllowlist: [],
};

const bundleSource = (version: string, body: string): string =>
  `${hostedSdkBanner(version)}\n${body}\n`;

// ---------------------------------------------------------------- contract

test("hosted SDK contract: banner, import map, and CSP hash agree", () => {
  assert.equal(HOSTED_SDK_COMPATIBILITY, 1);
  assert.equal(HOSTED_SDK_IMPORT_MAP, '{"imports":{"@lokiplay/sdk":"/loki/sdk.js"}}');
  assert.deepEqual(parseHostedSdkBanner(`${hostedSdkBanner("1.2.3")}\ncode`), {
    version: "1.2.3",
    compatibility: 1,
  });
  assert.equal(parseHostedSdkBanner("no banner"), undefined);
  assert.equal(
    hostedSdkImportMapCspSource(),
    `'sha256-${createHash("sha256").update(HOSTED_SDK_IMPORT_MAP).digest("base64")}'`,
  );
});

test("injection puts the import map and support script before the first module script", () => {
  const html =
    '<!doctype html><html><head><title>t</title><script>/*classic*/</script>' +
    '<script type="module" crossorigin src="game.js"></script></head><body></body></html>';
  const injected = injectHostedSdkHtml(html);
  const mapAt = injected.indexOf('<script type="importmap">');
  const supportAt = injected.indexOf('<script src="/loki/support.js"></script>');
  const moduleAt = injected.indexOf('<script type="module"');
  assert.ok(mapAt > -1 && supportAt > mapAt && moduleAt > supportAt);
  assert.ok(injected.includes(`<script type="importmap">${HOSTED_SDK_IMPORT_MAP}</script>`));
  assert.equal(injectHostedSdkHtml(injected), injected);
});

test("injection falls back to the end of head, then creates head", () => {
  const withHead = injectHostedSdkHtml("<html><head><title>x</title></head><body></body></html>");
  assert.match(withHead, /<title>x<\/title><script type="importmap">.*<\/script><script src="\/loki\/support.js"><\/script><\/head>/);
  const withoutHead = injectHostedSdkHtml("<!doctype html><main>Playable</main>");
  assert.match(withoutHead, /^<!doctype html><head><script type="importmap">/);
  assert.match(withoutHead, /<main>Playable<\/main>$/);
});

// ------------------------------------------------------------------ bundle

test("hosted SDK bundle keeps every SDK export, the marker, and stays within budget", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "loki-hosted-sdk-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const output = path.join(directory, "sdk.js");
  await run("node", [path.join(root, "scripts/build-hosted-sdk.mjs"), "--out", output]);
  const bytes = await readFile(output);
  const source = bytes.toString("utf8");

  const sdkPackage = JSON.parse(
    await readFile(path.join(root, "packages/sdk-js/package.json"), "utf8"),
  ) as { version: string };
  assert.deepEqual(parseHostedSdkBanner(source), {
    version: sdkPackage.version,
    compatibility: HOSTED_SDK_COMPATIBILITY,
  });
  assert.ok(source.includes(HOSTED_SDK_BUILD_MARKER));
  assert.ok(gzipSync(bytes, { level: 9 }).length < 160 * 1024);
  // Protocol and Nakama are inside; nothing is left to resolve.
  assert.doesNotMatch(source, /from\s*["']@(?:heroiclabs|lokiplay)\//);
  assert.doesNotMatch(source, /import\s*["']@(?:heroiclabs|lokiplay)\//);

  const hosted = (await import(pathToFileURL(output).href)) as Record<string, unknown>;
  const missing = Object.keys(sdkSource).filter((name) => !(name in hosted));
  assert.deepEqual(missing, []);
  assert.equal(hosted.LOKI_HOSTED_SDK_COMPATIBILITY, HOSTED_SDK_COMPATIBILITY);
  assert.equal(hosted.LOKI_SDK_VERSION, sdkPackage.version);
  assert.equal(
    (hosted.LokiClient as { buildMarker: string }).buildMarker,
    HOSTED_SDK_BUILD_MARKER,
  );
});

test("the committed stable bundle is a valid hosted SDK", async () => {
  const stable = await readFile(path.join(root, "apps/web/hosted-sdk/stable.js"));
  const bundle = hostedSdkBundleFromSource(stable);
  assert.match(bundle.version, /^\d+\.\d+\.\d+/);
  assert.ok(stable.toString("utf8").includes(HOSTED_SDK_BUILD_MARKER));
});

// -------------------------------------------------------------- web server

function setup() {
  const platform = new PlatformService();
  const creator = platform.registerCreator("creator@example.test", "Studio");
  platform.assignPlan(creator.account.id, "loki");
  const project = platform.createProject(creator.account.id, creator.organization.id, {
    name: "Counter Party",
    slug: "counter-party",
  });
  platform.transitionProject(creator.account.id, project.id, "private");
  return { platform, creator, project };
}

const zip = (files: Record<string, string>): Uint8Array =>
  zipSync(Object.fromEntries(Object.entries(files).map(([n, v]) => [n, strToU8(v)])));

async function hostedGame(
  t: test.TestContext,
  hostedSdk: HostedSdkConfig | undefined,
) {
  const { platform, creator, project } = setup();
  const artifacts = new MemoryArtifactStore();
  const deployments = new DeploymentService(platform, artifacts);
  const credential = platform.issueDeploymentCredential(creator.account.id, project.id);
  const entry =
    '<!doctype html><html><head></head><body><script type="module" src="game.js"></script></body></html>';
  const release = await deployments.deployZip({
    ...credential,
    archive: zip({
      "game.json": JSON.stringify(manifest),
      "index.html": entry,
      "game.js": 'import { LokiClient } from "@lokiplay/sdk"; console.log(LokiClient);',
    }),
    activate: true,
  });
  const logs: Record<string, unknown>[] = [];
  const server = startWebServer(
    {
      platform,
      deployments,
      artifacts,
      async authorizePlay() {},
      gameOrigin: (projectId: string) => `https://${projectId}.games.test`,
      hostedSdk,
      log: (record) => logs.push(record),
    },
    0,
  );
  t.after(() => server.close());
  await once(server, "listening");
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const get = (pathname: string, projectId = project.id, headers: Record<string, string> = {}) =>
    fetch(`${origin}${pathname}`, {
      headers: { "x-forwarded-host": `${projectId}.games.test`, ...headers },
    });
  return { project, release, entry, get, logs, origin };
}

const stableSource = bundleSource("1.0.0", "export const generation = 'stable';");
const candidateSource = bundleSource("1.1.0", "export const generation = 'candidate';");

function config(overrides: Partial<HostedSdkConfig> = {}): HostedSdkConfig {
  return {
    stable: hostedSdkBundleFromSource(stableSource),
    candidate: hostedSdkBundleFromSource(candidateSource),
    serve: "stable",
    canaryProjectIds: [],
    ...overrides,
  };
}

test("game host serves stable by default, revalidates, and varies on Host", async (t) => {
  const { get, project, logs } = await hostedGame(t, config());
  const response = await get("/loki/sdk.js");
  assert.equal(response.status, 200);
  assert.equal(await response.text(), stableSource);
  assert.match(response.headers.get("content-type") ?? "", /javascript/);
  assert.equal(response.headers.get("cache-control"), "no-cache");
  assert.doesNotMatch(response.headers.get("cache-control") ?? "", /immutable/);
  assert.equal(response.headers.get("vary"), "Host");
  assert.equal(response.headers.get("x-loki-sdk-version"), "1.0.0");
  assert.equal(response.headers.get("x-loki-sdk-generation"), "stable");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  const etag = response.headers.get("etag")!;
  assert.match(etag, /^"[0-9a-f]{32}"$/);

  const revalidated = await get("/loki/sdk.js", project.id, { "if-none-match": etag });
  assert.equal(revalidated.status, 304);
  assert.ok(
    logs.some(
      (record) =>
        record.type === "hosted-sdk" &&
        record.projectId === project.id &&
        record.generation === "stable" &&
        record.version === "1.0.0",
    ),
  );
});

test("canary projects get the candidate, others stay on stable, clearing the list rolls back", async (t) => {
  const hostedSdk = config();
  const { get, project } = await hostedGame(t, hostedSdk);
  const otherProject = crypto.randomUUID();

  hostedSdk.canaryProjectIds = [project.id];
  const canary = await get("/loki/sdk.js");
  assert.equal(await canary.text(), candidateSource);
  assert.equal(canary.headers.get("x-loki-sdk-generation"), "candidate");
  const other = await get("/loki/sdk.js", otherProject);
  assert.equal(await other.text(), stableSource);

  hostedSdk.canaryProjectIds = [];
  const rolledBack = await get("/loki/sdk.js");
  assert.equal(await rolledBack.text(), stableSource);
  assert.equal(rolledBack.headers.get("x-loki-sdk-generation"), "stable");

  hostedSdk.serve = "candidate";
  assert.equal(await (await get("/loki/sdk.js", otherProject)).text(), candidateSource);
  hostedSdk.serve = "stable";
  assert.equal(await (await get("/loki/sdk.js", otherProject)).text(), stableSource);
});

test("a missing candidate falls back to stable, and non-game hosts get no SDK", async (t) => {
  const hostedSdk = config({ candidate: undefined, serve: "candidate" });
  const { get, origin, project } = await hostedGame(t, hostedSdk);
  assert.equal(await (await get("/loki/sdk.js")).text(), stableSource);
  const wrongHost = await fetch(`${origin}/loki/sdk.js`, {
    headers: { "x-forwarded-host": "play.lokiplay.cc" },
  });
  assert.equal(wrongHost.status, 404);
  const mismatched = await fetch(`${origin}/loki/sdk.js`, {
    headers: { "x-forwarded-host": `${project.id}.elsewhere.test` },
  });
  assert.equal(mismatched.status, 404);
});

test("the support script is served per game host with the selected version", async (t) => {
  const { get } = await hostedGame(t, config({ serve: "candidate" }));
  const response = await get("/loki/support.js");
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-cache");
  const script = await response.text();
  assert.match(script, /"version":"1\.1\.0"/);
  assert.match(script, /\/v1\/runtime-reports/);
});

test("only the entrypoint is rewritten and only its CSP gains the import-map hash", async (t) => {
  const { get, release, entry } = await hostedGame(t, config());
  const base = `/games/${release.projectId}/releases/${release.id}`;
  const page = await get(`${base}/index.html`);
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.equal(html, injectHostedSdkHtml(entry));
  assert.ok(html.indexOf('type="importmap"') < html.indexOf('type="module"'));
  const policy = page.headers.get("content-security-policy")!;
  assert.match(policy, /script-src https:\/\/[0-9a-f-]+\.games\.test 'sha256-[A-Za-z0-9+/=]+'/);
  assert.ok(policy.includes(hostedSdkImportMapCspSource()));
  assert.doesNotMatch(policy, /unsafe-inline.*script-src|script-src[^;]*unsafe-inline/);
  assert.match(page.headers.get("etag")!, /^"[0-9a-f-]+-[0-9a-f]{16}"$/);

  const script = await get(`${base}/game.js`);
  assert.equal(
    await script.text(),
    'import { LokiClient } from "@lokiplay/sdk"; console.log(LokiClient);',
  );
  assert.doesNotMatch(script.headers.get("content-security-policy")!, /sha256-/);
});

test("without hosted SDK configuration the entrypoint is served unchanged", async (t) => {
  const { get, release, entry } = await hostedGame(t, undefined);
  const page = await get(`/games/${release.projectId}/releases/${release.id}/index.html`);
  assert.equal(await page.text(), entry);
  assert.doesNotMatch(page.headers.get("content-security-policy")!, /sha256-/);
  assert.equal((await get("/loki/sdk.js")).status, 404);
});

// ------------------------------------------------------------ shell + reports

test("the play shell reacts to unsupported-browser and runtime-unavailable messages", () => {
  const html = renderPlayerShell({
    title: "Counter Party",
    projectId: crypto.randomUUID(),
    deploymentId: crypto.randomUUID(),
    gameOrigin: "https://abc.games.test",
    playPath: "/play/x",
  });
  assert.match(html, /loki:browser-unsupported/);
  assert.match(html, /loki:runtime-unavailable/);
  assert.match(html, /event\.origin !== gameOrigin/);
  assert.match(html, /event\.source !== frame\.contentWindow/);
  assert.match(html, /Retry/);
  assert.match(html, /const gameOrigin = "https:\/\/abc\.games\.test"/);
});

function runSupportScript(options: { supportsImportMap: boolean }) {
  const projectId = crypto.randomUUID();
  const posted: unknown[] = [];
  const beacons: { url: string; body: Promise<string> }[] = [];
  const sandbox = {
    window: { parent: { postMessage: (message: unknown) => posted.push(message) } },
    location: { hostname: `${projectId}.games.test` },
    navigator: {
      sendBeacon: (url: string, blob: Blob) => {
        beacons.push({ url, body: blob.text() });
        return true;
      },
    },
    Blob,
    HTMLScriptElement: { supports: () => options.supportsImportMap },
  };
  const source = renderHostedSdkSupportScript({
    apiOrigin: "https://api.lokiplay.cc",
    sdkVersion: "1.0.0",
  });
  vm.runInNewContext(source, sandbox);
  return { projectId, posted, beacons };
}

test("support script reports an unsupported browser to the shell and the API", async () => {
  const { projectId, posted, beacons } = runSupportScript({ supportsImportMap: false });
  assert.deepEqual(JSON.parse(JSON.stringify(posted)), [{ type: "loki:browser-unsupported" }]);
  assert.equal(beacons[0]?.url, "https://api.lokiplay.cc/v1/runtime-reports");
  assert.deepEqual(JSON.parse(await beacons[0]!.body), {
    projectId,
    kind: "browser-unsupported",
    compatibility: 1,
    sdkVersion: "1.0.0",
  });
});

test("support script reports a failed SDK download to the shell and the API", async () => {
  // The vm has no dynamic-import callback, so import() rejects: a failed load.
  const { projectId, posted, beacons } = runSupportScript({ supportsImportMap: true });
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.deepEqual(JSON.parse(JSON.stringify(posted)), [{ type: "loki:runtime-unavailable" }]);
  assert.equal(JSON.parse(await beacons[0]!.body).kind, "load-failed");
  assert.equal(JSON.parse(await beacons[0]!.body).projectId, projectId);
});

test("runtime reports are validated and logged, not stored", async (t) => {
  const platform = new PlatformService();
  const logs: Record<string, unknown>[] = [];
  const server = startApiServer(
    {
      platform,
      deployments: new DeploymentService(platform),
      async authenticateCreator() {
        throw new Error("not used");
      },
      async authenticatePlayer() {
        return undefined;
      },
      log: (record) => logs.push(record),
    },
    0,
  );
  t.after(() => server.close());
  await once(server, "listening");
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const report = {
    projectId: crypto.randomUUID(),
    kind: "load-failed",
    compatibility: 1,
    sdkVersion: "1.0.0",
  };
  const accepted = await fetch(`${origin}/v1/runtime-reports`, {
    method: "POST",
    headers: { "content-type": "text/plain;charset=UTF-8" },
    body: JSON.stringify(report),
  });
  assert.equal(accepted.status, 204);
  assert.ok(logs.some((record) => record.type === "runtime-report" && record.projectId === report.projectId));

  for (const bad of [
    { ...report, kind: "other" },
    { ...report, projectId: "not-a-uuid" },
    { ...report, extra: true },
  ]) {
    const rejected = await fetch(`${origin}/v1/runtime-reports`, {
      method: "POST",
      body: JSON.stringify(bad),
    });
    assert.equal(rejected.status, 400);
  }
});

// ------------------------------------------------------------------- CLI

async function buildDirectory(
  t: test.TestContext,
  files: Record<string, string>,
): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "loki-hosted-build-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(path.join(directory, "game.json"), JSON.stringify(manifest));
  for (const [name, content] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(directory, name)), { recursive: true });
    await writeFile(path.join(directory, name), content);
  }
  return directory;
}

const moduleEntry =
  '<!doctype html><html><head></head><body><script type="module" src="game.js"></script></body></html>';

test("an externalized build passes without a bundled-SDK warning", async (t) => {
  const directory = await buildDirectory(t, {
    "index.html": moduleEntry,
    "game.js": 'import { LokiClient } from "@lokiplay/sdk"; new LokiClient({});',
  });
  const result = await validateBuildDirectory(directory);
  assert.deepEqual(result.warnings, []);
});

test("a build that copied the SDK is warned, and bad scripts still fail", async (t) => {
  const copied = await buildDirectory(t, {
    "index.html": moduleEntry,
    "game.js": `const m="${HOSTED_SDK_BUILD_MARKER}";console.log(m);`,
  });
  const result = await validateBuildDirectory(copied);
  assert.equal(result.warnings.length, 1);
  assert.match(result.warnings[0]!, /game\.js: the Loki SDK is copied into this build/);

  const remote = await buildDirectory(t, {
    "index.html": '<!doctype html><script type="module" src="https://cdn.example/x.js"></script>',
    "game.js": 'import "@lokiplay/sdk";',
  });
  await assert.rejects(validateBuildDirectory(remote), /remote <script src>/);
  const inline = await buildDirectory(t, {
    "index.html": "<!doctype html><script>alert(1)</script>",
    "game.js": 'import "@lokiplay/sdk";',
  });
  await assert.rejects(validateBuildDirectory(inline), /inline <script>/);
});

test("lokiplay preview serves the hosted SDK and an injected entrypoint", async (t) => {
  const directory = await buildDirectory(t, {
    "index.html": moduleEntry,
    "game.js": 'import { LokiClient } from "@lokiplay/sdk"; new LokiClient({});',
    "AGENTS.md": "secret instructions",
  });
  const server = await startPreviewServer(directory, {
    port: 0,
    sdkBundle: stableSource,
    apiOrigin: "https://api.lokiplay.cc",
  });
  t.after(() => server.close());
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const page = await (await fetch(`${origin}/`)).text();
  assert.equal(page, injectHostedSdkHtml(moduleEntry));
  assert.ok(page.indexOf('type="importmap"') < page.indexOf('type="module"'));
  assert.equal(await (await fetch(`${origin}/loki/sdk.js`)).text(), stableSource);
  assert.match(await (await fetch(`${origin}/loki/support.js`)).text(), /"version":"1\.0\.0"/);
  assert.equal(
    await (await fetch(`${origin}/game.js`)).text(),
    'import { LokiClient } from "@lokiplay/sdk"; new LokiClient({});',
  );
  assert.equal((await fetch(`${origin}/AGENTS.md`)).status, 404);
  assert.equal((await fetch(`${origin}/../game.json`)).status, 200);
  assert.equal((await fetch(`${origin}/missing.js`)).status, 404);
});
