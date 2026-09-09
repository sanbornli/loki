import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { DeploymentService } from "../apps/api/src/deployments.js";
import { GuestResumeSigner, PlayInviteSigner } from "../apps/api/src/hosting-auth.js";
import {
  DEPLOYMENT_CREDENTIAL_MONTHLY_QUOTA,
  isMasterTestAccount,
  MASTER_TEST_ACCOUNT_EMAIL,
} from "../apps/api/src/master-account.js";
import { PlatformService } from "../apps/api/src/platform.js";
import { ServiceError, type SafetyOperations } from "../apps/api/src/safety.js";
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

test("deployment credential quota is 100 and skips the master test account", async (t) => {
  assert.equal(DEPLOYMENT_CREDENTIAL_MONTHLY_QUOTA, 100);
  assert.equal(isMasterTestAccount(MASTER_TEST_ACCOUNT_EMAIL), true);
  assert.equal(isMasterTestAccount("other@example.test"), false);

  const platform = new PlatformService();
  const publicCreator = platform.registerCreator("creator@example.test", "Studio");
  const master = platform.registerCreator(MASTER_TEST_ACCOUNT_EMAIL, "Master");
  const publicProject = platform.createProject(
    publicCreator.account.id,
    publicCreator.organization.id,
    { name: "Public Quota", slug: "public-quota" },
  );
  const masterProject = platform.createProject(
    master.account.id,
    master.organization.id,
    { name: "Master Quota", slug: "master-quota" },
  );
  const emails = new Map([
    [publicCreator.account.id, publicCreator.account.email],
    [master.account.id, master.account.email],
  ]);
  const usage = new Map<string, number>([
    [`${publicProject.id}:deployment_credentials`, DEPLOYMENT_CREDENTIAL_MONTHLY_QUOTA],
    [`${masterProject.id}:deployment_credentials`, DEPLOYMENT_CREDENTIAL_MONTHLY_QUOTA],
  ]);
  const safety: Pick<SafetyOperations, "meter" | "rateLimit"> = {
    async rateLimit() {},
    async meter(_scope, scopeId, metric, amount, _period, actorId) {
      if (isMasterTestAccount(emails.get(actorId ?? ""))) return 0;
      const key = `${scopeId}:${metric}`;
      const next = (usage.get(key) ?? 0) + amount;
      if (next > DEPLOYMENT_CREDENTIAL_MONTHLY_QUOTA) {
        throw new ServiceError("QUOTA_EXCEEDED", `${metric} quota exceeded`, 429);
      }
      usage.set(key, next);
      return next;
    },
  };
  let actorId = publicCreator.account.id;
  const server = startApiServer({
    platform,
    deployments: new DeploymentService(platform),
    safety: safety as SafetyOperations,
    async authenticateCreator() {
      return actorId;
    },
  }, 0);
  t.after(() => server.close());
  await once(server, "listening");
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const blocked = await fetch(
    `${origin}/v1/projects/${publicProject.id}/deployment-credentials`,
    { method: "POST" },
  );
  assert.equal(blocked.status, 429);
  assert.match(await blocked.text(), /deployment_credentials quota exceeded/);

  actorId = master.account.id;
  const allowed = await fetch(
    `${origin}/v1/projects/${masterProject.id}/deployment-credentials`,
    { method: "POST" },
  );
  assert.equal(allowed.status, 201);
  assert.equal(
    typeof ((await allowed.json()) as { secret?: string }).secret,
    "string",
  );
});
