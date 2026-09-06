import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { strToU8, zipSync } from "fflate";
import {
  DeploymentService,
  MemoryArtifactStore,
} from "../apps/api/src/deployments.js";
import { PlatformService } from "../apps/api/src/platform.js";
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
} from "../packages/cli/src/index.js";
import {
  LokiClient,
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
  const headers = gameSecurityHeaders(manifest);
  assert.match(
    headers["content-security-policy"]!,
    /connect-src https:\/\/api\.lokiplay\.cc wss:\/\/multiplayer\.lokiplay\.cc/,
  );
  assert.match(headers["permissions-policy"]!, /camera=\(\)/);
  const shell = renderPlayerShell({
    title: "Counter Party",
    projectId: crypto.randomUUID(),
    deploymentId: crypto.randomUUID(),
    gameOrigin: "https://counter-party.games.loki.test",
  });
  assert.match(shell, /sandbox="allow-scripts allow-pointer-lock"/);
  assert.doesNotMatch(shell, /allow-same-origin/);
  assert.match(shell, /MessageChannel/);
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
  assert.match(creator, /Editorial Studio \/ 03/);
  assert.match(creator, /Copy agent prompt/);
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
  const shellSource = await shell.text();
  assert.match(shellSource, new RegExp(release.id));
  assert.match(shellSource, /sandbox="allow-scripts allow-pointer-lock"/);

  const asset = await fetch(
    `${origin}/games/${project.id}/releases/${release.id}/index.html`,
  );
  assert.equal(asset.status, 200);
  assert.equal(asset.headers.get("cross-origin-resource-policy"), "same-origin");
  assert.match(
    asset.headers.get("content-security-policy")!,
    /connect-src https:\/\/api\.lokiplay\.cc wss:\/\/multiplayer\.lokiplay\.cc/,
  );
  assert.match(await asset.text(), /Playable/);
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
    async joinRoom() {
      return { roomId, snapshot };
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
  assert.deepEqual(await client.joinRoom("party-room"), snapshot);
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
      sequence: 1,
      type: "state",
      state: { tick: 1 },
    });
  }
  assert.equal(received.length, 1, "outgoing sequence must not hide server updates");
  await client.close();
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
