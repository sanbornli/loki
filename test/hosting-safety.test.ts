import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { DeploymentService } from "../apps/api/src/deployments.js";
import { GuestResumeSigner, PlayInviteSigner } from "../apps/api/src/hosting-auth.js";
import { PlatformService } from "../apps/api/src/platform.js";
import { startApiServer } from "../apps/api/src/server.js";

test("play invites are signed, scoped, and expiring", () => {
  const signer = new PlayInviteSigner(Buffer.alloc(32, 7));
  const payload = {
    id: crypto.randomUUID(),
    projectId: crypto.randomUUID(),
    expiresAt: 200,
  };
  const token = signer.issue(payload);
  assert.deepEqual(signer.verify(token, 199), payload);
  assert.throws(() => signer.verify(`${token}x`, 199), /invalid play invite/);
  assert.throws(() => signer.verify(token, 200), /expired/);
});

test("creator transitions cannot publish without operator review", () => {
  const platform = new PlatformService();
  const creator = platform.registerCreator("creator@example.test", "Studio");
  const project = platform.createProject(
    creator.account.id,
    creator.organization.id,
    { name: "Private Game", slug: "private-game" },
  );
  platform.transitionProject(creator.account.id, project.id, "private");
  platform.transitionProject(creator.account.id, project.id, "review_requested");
  assert.throws(
    () => platform.transitionProject(creator.account.id, project.id, "published"),
    /publication is closed/i,
  );
});

test("guest player sessions resume the same identity from a signed cookie", async (t) => {
  const platform = new PlatformService();
  const creator = platform.registerCreator("creator@example.test", "Studio");
  const project = platform.createProject(
    creator.account.id,
    creator.organization.id,
    { name: "Public Game", slug: "public-game" },
  );
  platform.transitionProject(creator.account.id, project.id, "private");
  platform.transitionProject(creator.account.id, project.id, "unlisted");
  platform.setActiveDeployment(creator.account.id, project.id, crypto.randomUUID());
  const guestResume = new GuestResumeSigner(Buffer.alloc(32, 9));
  const server = startApiServer({
    platform,
    deployments: new DeploymentService(platform),
    guestResume,
    async authenticateCreator() {
      return creator.account.id;
    },
    async authenticatePlayer() {
      return undefined;
    },
  }, 0);
  t.after(() => server.close());
  await once(server, "listening");
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const first = await fetch(`${origin}/v1/player-sessions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ projectId: project.id }),
  });
  assert.equal(first.status, 201);
  const cookie = first.headers.get("set-cookie");
  assert.match(cookie ?? "", new RegExp(`loki_guest_${project.id}=`));
  const firstToken = ((await first.json()) as { token: string }).token;
  const second = await fetch(`${origin}/v1/player-sessions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: cookie!.split(";", 1)[0]!,
    },
    body: JSON.stringify({ projectId: project.id, playerId: crypto.randomUUID() }),
  });
  assert.equal(second.status, 201);
  const secondToken = ((await second.json()) as { token: string }).token;
  assert.equal(
    platform.tokens.verify(firstToken).subject,
    platform.tokens.verify(secondToken).subject,
  );
});

test("player session endpoint ignores client supplied player identity", async (t) => {
  const platform = new PlatformService();
  const creator = platform.registerCreator("creator@example.test", "Studio");
  const project = platform.createProject(
    creator.account.id,
    creator.organization.id,
    { name: "Unlisted Game", slug: "unlisted-game" },
  );
  platform.transitionProject(creator.account.id, project.id, "private");
  platform.transitionProject(creator.account.id, project.id, "unlisted");
  platform.setActiveDeployment(creator.account.id, project.id, crypto.randomUUID());
  const server = startApiServer({
    platform,
    deployments: new DeploymentService(platform),
    async authenticateCreator() {
      return creator.account.id;
    },
    async authenticatePlayer() {
      return undefined;
    },
  }, 0);
  t.after(() => server.close());
  await once(server, "listening");
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const supplied = crypto.randomUUID();
  const response = await fetch(`${origin}/v1/player-sessions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ projectId: project.id, playerId: supplied }),
  });
  assert.equal(response.status, 201);
  const result = await response.json() as { token: string };
  assert.notEqual(platform.tokens.verify(result.token).subject, supplied);
});
