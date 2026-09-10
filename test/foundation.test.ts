import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PlatformService } from "../apps/api/src/platform.js";
import {
  ClientEnvelopeSchema,
  GameManifestSchema,
  ProtocolHelloSchema,
  RoomConfigSchema,
  ServerEnvelopeSchema,
  canonicalJson,
  dequantize,
  quantize,
  snapshotMembersAreComplete,
  stateHash,
} from "../packages/protocol/src/index.js";

test("protocol validates manifests and canonical state consistently", () => {
  const manifest = GameManifestSchema.parse({
    schemaVersion: 1,
    name: "Counter Party",
    entrypoint: "index.html",
    multiplayer: {
      enabled: true,
      authority: "host",
      maxPlayers: 8,
      tickRate: 10,
    },
  });
  assert.equal(manifest.networkAllowlist.length, 0);
  assert.throws(() =>
    GameManifestSchema.parse({
      ...manifest,
      entrypoint: "../index.html",
    }),
  );
  assert.throws(() =>
    GameManifestSchema.parse({
      ...manifest,
      multiplayer: { ...manifest.multiplayer, authority: "server" },
    }),
  );
  assert.equal(canonicalJson({ z: 1, a: [2, 3] }), '{"a":[2,3],"z":1}');
  assert.equal(stateHash({ a: 1, b: 2 }), stateHash({ b: 2, a: 1 }));
  assert.throws(() => canonicalJson({ invalid: Number.NaN }));
  assert.throws(() => canonicalJson({ invalid: 3.35 }));
  assert.equal(quantize(3.35, 100), 335);
  assert.equal(dequantize(335, 100), 3.35);
  assert.throws(() => quantize(Number.NaN, 100));
  assert.throws(() => quantize(Number.MAX_SAFE_INTEGER, 100));
  assert.equal(snapshotMembersAreComplete({ membersComplete: true, members: [] }), true);
  assert.equal(snapshotMembersAreComplete({ membersComplete: false, members: [] }), false);
  assert.equal(
    snapshotMembersAreComplete({ members: [{ playerId: "a" }] }),
    true,
  );
  assert.equal(snapshotMembersAreComplete({ members: [] }), false);
});

test("protocol rejects malformed and unsupported client messages", () => {
  const roomId = crypto.randomUUID();
  assert.equal(
    ClientEnvelopeSchema.parse({
      protocolVersion: 1,
      roomId,
      sequence: 1,
      type: "action",
      payload: { move: 2 },
    }).type,
    "action",
  );
  assert.equal(
    ClientEnvelopeSchema.parse({
      protocolVersion: 1,
      roomId,
      sequence: 2,
      type: "host_state",
      expectedVersion: 0,
      expectedStateVersion: 0,
      actionId: "action001",
      payload: { n: 1 },
      state: { n: 1 },
    }).type,
    "host_state",
  );
  assert.throws(() =>
    ClientEnvelopeSchema.parse({
      protocolVersion: 2,
      roomId,
      sequence: 1,
      type: "action",
      payload: {},
    }),
  );
});

test("shared conformance fixture matches canonical JSON and hash", async () => {
  const fixture = JSON.parse(
    await readFile(
      new URL("../packages/protocol/fixtures/conformance.json", import.meta.url),
      "utf8",
    ),
  ) as {
    manifest: unknown;
    canonicalState: { input: unknown; json: string; sha256: string };
    hello: unknown;
    roomConfig: unknown;
    clientMessages: unknown[];
    serverReplay: unknown[];
  };
  GameManifestSchema.parse(fixture.manifest);
  ProtocolHelloSchema.parse(fixture.hello);
  RoomConfigSchema.parse(fixture.roomConfig);
  fixture.clientMessages.forEach((message) => ClientEnvelopeSchema.parse(message));
  fixture.serverReplay.forEach((message) => ServerEnvelopeSchema.parse(message));
  assert.equal(canonicalJson(fixture.canonicalState.input), fixture.canonicalState.json);
  assert.equal(stateHash(fixture.canonicalState.input), fixture.canonicalState.sha256);
});

test("accounts, projects, credentials, sessions and audits enforce boundaries", () => {
  const platform = new PlatformService();
  const alpha = platform.registerCreator("OWNER@alpha.test", "Alpha Studio");
  const beta = platform.registerCreator("owner@beta.test", "Beta Studio");
  const project = platform.createProject(alpha.account.id, alpha.organization.id, {
    name: "Counter Party",
    slug: "counter-party",
  });

  assert.throws(
    () => platform.getProject(beta.account.id, project.id),
    /access denied/,
  );
  assert.throws(() => platform.issuePlayerSession(project.id), /not playable/);

  platform.transitionProject(alpha.account.id, project.id, "private");
  const deployment = platform.issueDeploymentCredential(
    alpha.account.id,
    project.id,
    100,
  );
  assert.equal(deployment.expiresAt, 700);
  assert.throws(
    () =>
      platform.consumeDeploymentCredential(
        deployment.credentialId,
        `${deployment.secret}tampered`,
        101,
      ),
    /invalid/,
  );
  assert.deepEqual(
    platform.consumeDeploymentCredential(
      deployment.credentialId,
      deployment.secret,
      101,
    ),
    { projectId: project.id, actorId: alpha.account.id },
  );
  assert.throws(
    () =>
      platform.consumeDeploymentCredential(
        deployment.credentialId,
        deployment.secret,
        102,
      ),
    /invalid/,
  );

  const token = platform.issuePlayerSession(
    project.id,
    crypto.randomUUID(),
    true,
    200,
  );
  const claims = platform.tokens.verify(token, 201);
  assert.equal(claims.projectId, project.id);
  assert.equal(claims.organizationId, alpha.organization.id);
  assert.equal(claims.expiresAt, 800);
  const tampered = `${token.slice(0, -1)}${token.endsWith("a") ? "b" : "a"}`;
  assert.throws(() => platform.tokens.verify(tampered, 201), /signature/);

  const audit = platform.auditLog(alpha.account.id, alpha.organization.id);
  assert.deepEqual(
    audit.map((record) => record.action),
    [
      "creator.registered",
      "project.created",
      "project.state_changed",
      "deployment_credential.issued",
      "deployment_credential.consumed",
    ],
  );
});
