import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { strToU8, zipSync } from "fflate";
import {
  DeploymentService,
  MemoryArtifactStore,
} from "../apps/api/src/deployments.js";
import { NakamaGateway } from "../apps/api/src/nakama.js";
import {
  PlatformService,
  type PlatformOperations,
} from "../apps/api/src/platform.js";
import {
  gameSecurityHeaders,
  renderPlayerShell,
} from "../apps/web/src/player.js";
import { renderCreatorPage } from "../apps/web/src/creator-page.js";
import { renderDevicePage } from "../apps/web/src/device-page.js";
import { renderMarketingPage } from "../apps/web/src/marketing-page.js";
import { renderOperatorPage } from "../apps/web/src/operator-page.js";
import { renderPlayerPlatformPage } from "../apps/web/src/player-platform-page.js";
import { startWebServer } from "../apps/web/src/server.js";
import {
  archiveBuild,
  initializeProject,
  validateBuildDirectory,
  verifyPlayableUrl,
} from "../packages/cli/src/index.js";
import {
  LokiClient,
  lokiErrorFromUnknown,
  type LokiTransport,
} from "../packages/sdk-js/src/index.js";
import type {
  ClientEnvelope,
  ServerEnvelope,
} from "../packages/protocol/src/index.js";

const manifest = {
  schemaVersion: 1 as const,
  name: "Counter Party",
  entrypoint: "index.html",
  multiplayer: {
    enabled: true,
    authority: "host" as const,
    maxPlayers: 8,
    tickRate: 10,
  },
  networkAllowlist: [],
};

function buildZip(files: Record<string, string>): Uint8Array {
  return zipSync(
    Object.fromEntries(
      Object.entries(files).map(([name, value]) => [name, strToU8(value)]),
    ),
  );
}

function setupProject() {
  const platform = new PlatformService();
  const creator = platform.registerCreator("creator@example.test", "Studio");
  const project = platform.createProject(
    creator.account.id,
    creator.organization.id,
    { name: "Counter Party", slug: "counter-party" },
  );
  platform.transitionProject(creator.account.id, project.id, "private");
  return { platform, creator, project };
}

test("finished builds are scanned, stored immutably and activated", async () => {
  const { platform, creator, project } = setupProject();
  const artifacts = new MemoryArtifactStore();
  const deployments = new DeploymentService(platform, artifacts);
  const credential = platform.issueDeploymentCredential(
    creator.account.id,
    project.id,
  );
  const archive = buildZip({
    "game.json": JSON.stringify(manifest),
    "index.html": "<!doctype html><script src='game.js'></script>",
    "game.js": "document.body.textContent = 'Ready';",
  });
  const release = await deployments.deployZip({
    ...credential,
    archive,
    activate: true,
  });
  assert.equal(release.status, "ready");
  assert.deepEqual(release.files, ["game.js", "game.json", "index.html"]);
  assert.equal(
    platform.getProject(creator.account.id, project.id).activeDeploymentId,
    release.id,
  );
  assert.match(
    Buffer.from((await artifacts.get(release.id, "index.html"))!).toString(),
    /doctype/,
  );
  assert.throws(
    () =>
      platform.consumeDeploymentCredential(
        credential.credentialId,
        credential.secret,
      ),
    /invalid/,
  );
  const duplicateCredential = platform.issueDeploymentCredential(
    creator.account.id,
    project.id,
  );
  const duplicate = await deployments.deployZip({
    ...duplicateCredential,
    archive,
    activate: true,
  });
  assert.equal(duplicate.id, release.id);
});

test("a new project's first activated deployment becomes public", async () => {
  const platform = new PlatformService();
  const creator = platform.registerCreator("public@example.test", "Public Studio");
  const project = platform.createProject(
    creator.account.id,
    creator.organization.id,
    { name: "Public Game", slug: "public-game" },
  );
  const deployments = new DeploymentService(platform);
  const credential = platform.issueDeploymentCredential(
    creator.account.id,
    project.id,
  );
  const release = await deployments.deployZip({
    ...credential,
    archive: buildZip({
      "game.json": JSON.stringify(manifest),
      "index.html": "<!doctype html><main>Public</main>",
    }),
    activate: true,
  });
  const activated = platform.getProject(creator.account.id, project.id);
  assert.equal(activated.activeDeploymentId, release.id);
  assert.equal(activated.state, "unlisted");
});

test("unsafe or backend-dependent browser builds fail closed", async () => {
  const { platform, creator, project } = setupProject();
  const deployments = new DeploymentService(platform);
  const credential = platform.issueDeploymentCredential(
    creator.account.id,
    project.id,
  );
  const release = await deployments.deployZip({
    ...credential,
    archive: buildZip({
      "game.json": JSON.stringify(manifest),
      "index.html": "<script src='server.js'></script>",
      "server.js":
        "const secret_key = 'abcdefghijklmnop123'; fetch('https://tracking.invalid/x')",
    }),
  });
  assert.equal(release.status, "blocked");
  assert.ok(release.findings.some((finding) => finding.code === "BACKEND_SOURCE"));
  assert.ok(release.findings.some((finding) => finding.code === "POSSIBLE_SECRET"));
  assert.ok(
    release.findings.some((finding) => finding.code === "UNAPPROVED_NETWORK"),
  );
});

test("compiled dependency documentation URLs are not outbound findings", async () => {
  const { platform, creator, project } = setupProject();
  const deployments = new DeploymentService(platform);
  const credential = platform.issueDeploymentCredential(
    creator.account.id,
    project.id,
  );
  const release = await deployments.deployZip({
    ...credential,
    archive: buildZip({
      "game.json": JSON.stringify(manifest),
      "index.html": "<script src='game.js'></script>",
      "game.js": 'const docs = "https://dependency.example/docs";',
    }),
  });
  assert.equal(release.status, "ready");
  assert.equal(
    release.findings.some((finding) => finding.code === "UNAPPROVED_NETWORK"),
    false,
  );
});

test("ZIP traversal is rejected before deployment credentials are consumed", async () => {
  const { platform, creator, project } = setupProject();
  const deployments = new DeploymentService(platform);
  const credential = platform.issueDeploymentCredential(
    creator.account.id,
    project.id,
  );
  await assert.rejects(
    deployments.deployZip({
      ...credential,
      archive: buildZip({ "../escape.html": "unsafe" }),
    }),
    /unsafe archive path/,
  );
  const release = await deployments.deployZip({
    ...credential,
    archive: buildZip({
      "game.json": JSON.stringify(manifest),
      "index.html": "<!doctype html>",
    }),
  });
  assert.equal(release.status, "ready");
});

test("player shell and game responses enforce origin isolation", () => {
  const gameOrigin = "https://counter-party.games.loki.test";
  const headers = gameSecurityHeaders(manifest, gameOrigin);
  assert.match(
    headers["content-security-policy"]!,
    /script-src https:\/\/counter-party\.games\.loki\.test/,
  );
  assert.match(
    headers["content-security-policy"]!,
    /connect-src https:\/\/api\.lokiplay\.cc https:\/\/multiplayer\.lokiplay\.cc wss:\/\/multiplayer\.lokiplay\.cc/
  );
  assert.match(headers["permissions-policy"]!, /camera=\(\)/);
  assert.equal(headers["cross-origin-resource-policy"], "cross-origin");
  const shell = renderPlayerShell({
    title: "Counter Party",
    projectId: crypto.randomUUID(),
    deploymentId: crypto.randomUUID(),
    gameOrigin,
  });
  assert.match(
    shell,
    /sandbox="allow-scripts allow-pointer-lock allow-same-origin"/,
  );
  assert.match(shell, /MessageChannel/);
  assert.match(shell, /postMessage\([\s\S]*"\*",[\s\S]*\[channel\.port2\]/);
  assert.match(shell, /Connection timed out/);
  assert.match(shell, /status\.textContent = "Connected"/);
});

test("Theme 03 product surfaces render functional, safely configured shells", () => {
  const config = {
    apiOrigin: "https://api.lokiplay.test",
    supabaseUrl: "https://auth.lokiplay.test",
    supabaseAnonKey: "</script><script>unsafe()</script>",
  };
  const creator = renderCreatorPage(config);
  const device = renderDevicePage(config, "ABCD-EFGH");
  const marketing = renderMarketingPage(config);
  const player = renderPlayerPlatformPage(config);
  const operator = renderOperatorPage(config);

  assert.match(marketing, /The only plugin you need for your vibe-coded games/);
  assert.match(marketing, /Its only a game when there are players/);
  assert.match(marketing, /Just leave it to your Agent/);
  assert.match(marketing, /loki-vibecoded-game-montage\.png/);
  assert.match(marketing, /https:\/\/app\.lokiplay\.cc\/login/);
  assert.match(marketing, /https:\/\/app\.lokiplay\.cc\/signup/);
  assert.match(creator, /window\.location\.pathname === "\/signup"/);
  assert.match(creator, /Editorial Studio \/ 03/);
  assert.match(creator, /Copy agent prompt/);
  assert.match(creator, /Full agent prompt/);
  assert.match(creator, /className: "integration-prompt"/);
  assert.match(creator, /text: agentPrompt\(project\)/);
  assert.match(creator, /npm view @lokiplay\/sdk@/);
  assert.match(creator, /function configuredCliVersion\(\)/);
  assert.match(creator, /"0\.2\.0"/);
  assert.match(creator, /npx lokiplay@" \+ cliVersion \+ " login/);
  assert.match(creator, /createRoom\(\)/);
  assert.match(creator, /joinRoom\(\{ inviteCode \}\)/);
  assert.match(creator, /createSynchronizedRoom\(\)/);
  assert.match(creator, /Package installation and creator authentication are separate/);
  assert.match(creator, /Needs an operator; approval will activate it automatically/);
  assert.match(creator, /Passed and publicly playable/);
  assert.match(creator, /unlisted: "Make public"/);
  assert.doesNotMatch(
    creator,
    /private: \["draft", "unlisted", "review_requested"\]/,
  );
  assert.doesNotMatch(creator, /Activate this release/);
  assert.doesNotMatch(creator, /@lokiplay\/agent-instructions/);
  assert.doesNotMatch(creator, /Upload finished build/);
  assert.match(creator, /signup\?redirect_to=/);
  assert.match(creator, /This email is already registered/);
  assert.match(creator, /auth\/v1\/resend\?redirect_to=/);
  assert.match(player, /Public catalog/);
  assert.match(player, /Recent games/);
  assert.match(operator, /Operator console/);
  assert.match(operator, /Audit events/);
  assert.match(device, /Connect this terminal/);
  assert.match(device, /ABCD-EFGH/);
  assert.match(device, /\/v1\/cli\/device\/approve/);
  assert.match(creator, /\\u003c\/script\\u003e/);
  assert.doesNotMatch(creator, /<script>unsafe\(\)<\/script>/);
});

test("creator host login and signup paths render the creator studio", async (t) => {
  const { platform } = setupProject();
  const server = startWebServer(
    {
      platform,
      deployments: { get() { return undefined; } },
      artifacts: { async get() { return undefined; } },
      async authorizePlay() {},
      gameOrigin() {
        return "https://game.lokiplay.test";
      },
      productConfig: {
        apiOrigin: "https://api.lokiplay.test",
        supabaseUrl: "https://auth.lokiplay.test",
        supabaseAnonKey: "marketing-site",
      },
    },
    0,
  );
  t.after(() => server.close());
  await once(server, "listening");
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  for (const pathname of ["/login", "/signup"]) {
    const response = await fetch(`${origin}${pathname}`, {
      headers: { host: "app.lokiplay.cc" },
    });
    assert.equal(response.status, 200);
    assert.match(await response.text(), /Creator Studio — Loki/);
  }
});

test("web server delivers the active immutable release through a sandbox shell", async (t) => {
  const { platform, creator, project } = setupProject();
  const artifacts = new MemoryArtifactStore();
  const deployments = new DeploymentService(platform, artifacts);
  const credential = platform.issueDeploymentCredential(
    creator.account.id,
    project.id,
  );
  const release = await deployments.deployZip({
    ...credential,
    archive: buildZip({
      "game.json": JSON.stringify(manifest),
      "index.html": "<!doctype html><main>Playable</main>",
    }),
    activate: true,
  });
  const server = startWebServer(
    {
      platform,
      deployments,
      artifacts,
      async authorizePlay() {},
      gameOrigin() {
        return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      },
    },
    0,
  );
  t.after(() => server.close());
  await once(server, "listening");
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const shell = await fetch(`${origin}/play/${project.id}`);
  assert.equal(shell.status, 200);
  assert.match(
    shell.headers.get("content-security-policy")!,
    /connect-src https:\/\/api\.lokiplay\.cc/,
  );
  const shellSource = await shell.text();
  assert.match(shellSource, new RegExp(release.id));
  assert.match(
    shellSource,
    /sandbox="allow-scripts allow-pointer-lock allow-same-origin"/,
  );

  const asset = await fetch(
    `${origin}/games/${project.id}/releases/${release.id}/index.html`,
  );
  assert.equal(asset.status, 200);
  assert.equal(asset.headers.get("cross-origin-resource-policy"), "cross-origin");
  assert.match(
    asset.headers.get("content-security-policy")!,
    /connect-src https:\/\/api\.lokiplay\.cc https:\/\/multiplayer\.lokiplay\.cc wss:\/\/multiplayer\.lokiplay\.cc/
  );
  assert.match(await asset.text(), /Playable/);
});

test("SDK converts transport failures into readable Loki errors", async () => {
  const failed = new Response("{\"message\":\"INVALID_MESSAGE: invalid room key\"}", {
    status: 400,
    headers: { "content-type": "application/json" },
  });
  const error = await lokiErrorFromUnknown(failed);
  assert.match(error.message, /Loki request failed \(400\): INVALID_MESSAGE: invalid room key/);
  assert.equal((await lokiErrorFromUnknown(new Error("[object Response]"))).message, "Loki request failed");
});

test("JavaScript SDK follows the Loki protocol without Nakama types", async () => {
  const roomId = crypto.randomUUID();
  const hostId = crypto.randomUUID();
  const listeners = new Set<(message: unknown) => void>();
  const sent: ClientEnvelope[] = [];
  const snapshot: ServerEnvelope = {
    protocolVersion: 1,
    roomId,
    sequence: 0,
    type: "snapshot",
    hostId,
    state: { tick: 0 },
  };
  const transport: LokiTransport = {
    async authenticate() {
      return { playerId: crypto.randomUUID() };
    },
    async createRoom() {
      for (const listener of listeners) {
        listener({
          ...snapshot,
          sequence: 1,
          type: "state",
          state: { tick: 1, seated: true },
        });
      }
      return { roomId, inviteCode: "ABCDEF0123456789", snapshot };
    },
    async joinRoom() {
      return { roomId, inviteCode: "ABCDEF0123456789", snapshot };
    },
    async send(message) {
      sent.push(message);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async close() {},
  };
  const client = new LokiClient({ projectId: crypto.randomUUID(), transport });
  const received: ServerEnvelope[] = [];
  client.onMessage((message) => received.push(message));
  client.initialize();
  await client.authenticate("signed-token");
  assert.deepEqual(await client.createRoom(), {
    roomId,
    inviteCode: "ABCDEF0123456789",
    snapshot,
  });
  await assert.rejects(
    client.joinRoom({ inviteCode: "not-a-loki-invite" }),
    /INVITE_INVALID/,
  );
  assert.equal(received[0]?.type, "state");
  assert.deepEqual(received[0]?.state, { tick: 1, seated: true });
  await client.sendAction({ move: 1 });
  assert.equal(sent[0]?.type, "action");
  assert.equal(sent[0]?.roomId, roomId);
  await client.sendHostState(0, { tick: 1 });
  assert.equal(sent[1]?.type, "host_state");
  await client.sendChat("ready");
  assert.equal(sent[2]?.type, "chat");
  for (const listener of listeners) {
    listener({
      ...snapshot,
      sequence: 2,
      type: "state",
      state: { tick: 1 },
    });
  }
  assert.equal(received.length, 2, "outgoing sequence must not hide server updates");
  await client.close();
});

test("Nakama sessions expose the authoritative Nakama user id", async (t) => {
  const lokiPlayerId = crypto.randomUUID();
  const nakamaPlayerId = crypto.randomUUID();
  const projectId = crypto.randomUUID();
  const nakamaToken = [
    "header",
    Buffer.from(JSON.stringify({ uid: nakamaPlayerId })).toString("base64url"),
    "signature",
  ].join(".");
  const server = createServer((request, response) => {
    if (request.url?.startsWith("/v2/account/authenticate/custom")) {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ token: nakamaToken }));
      return;
    }
    if (request.url === "/v2/rpc/loki_provision_tenant?unwrap") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ ok: true }));
      return;
    }
    response.writeHead(404).end();
  });
  t.after(() => server.close());
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const platform = {
    tokens: {
      verify: () => ({ subject: lokiPlayerId, projectId }),
    },
    playableProject: async () => ({ id: projectId }),
  } as unknown as PlatformOperations;
  const gateway = new NakamaGateway(platform, {
    origin,
    serverKey: "server-key",
    httpKey: "http-key",
  });

  const session = await gateway.exchangePlayerToken("loki-token");

  assert.equal(session.playerId, nakamaPlayerId);
  assert.notEqual(session.playerId, lokiPlayerId);
});

test("CLI initializes, validates and archives finished builds", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "lokiplay-"));
  try {
    await initializeProject(directory, {
      name: "CLI Game",
      projectId: crypto.randomUUID(),
    });
    await writeFile(path.join(directory, "index.html"), "<!doctype html>");
    const validation = await validateBuildDirectory(directory);
    assert.ok(validation.files.includes("game.json"));
    assert.match(await readFile(path.join(directory, "AGENTS.md"), "utf8"), /Loki/);
    assert.ok((await archiveBuild(directory)).byteLength > 0);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
test("CLI verifies that a playable URL returns an activated Loki shell", async (t) => {
  let authorization = "";
  const server = createServer((request, response) => {
    authorization = request.headers.authorization ?? "";
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end("<!doctype html><iframe></iframe><script>/* loki:init */</script>");
  });
  t.after(() => server.close());
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  await verifyPlayableUrl(origin, "creator-token");
  assert.equal(authorization, "Bearer creator-token");
});
