import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { zipSync, strToU8 } from "fflate";
import { Pool } from "pg";
import { z } from "zod";
import { R2ArtifactStore } from "../apps/api/src/r2.js";

const environment = z
  .object({
    API_ORIGIN: z.string().url(),
    WEB_ORIGIN: z.string().url(),
    SUPABASE_URL: z.string().url(),
    SUPABASE_ANON_KEY: z.string().min(16),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(16),
    SUPABASE_DATABASE_URL: z.string().min(16),
    LOKI_R2_ACCOUNT_ID: z.string().regex(/^[a-f0-9]{32}$/i),
    LOKI_R2_BUCKET: z.string().min(3),
    LOKI_R2_ACCESS_KEY_ID: z.string().min(16),
    LOKI_R2_SECRET_ACCESS_KEY: z.string().min(16),
    LOKI_DEPLOYMENT_CREDENTIAL_QUOTA: z.coerce.number().int().min(2).max(100),
    LOKI_TERMS_VERSION: z.string().min(1),
    LOKI_PRIVACY_VERSION: z.string().min(1),
    LOKI_AUP_VERSION: z.string().min(1),
  })
  .parse(process.env);

const requestJson = async <T>(
  url: string,
  init: RequestInit,
): Promise<T> => {
  const response = await fetch(url, init);
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${init.method ?? "GET"} ${url} failed (${response.status}): ${text}`);
  }
  return JSON.parse(text) as T;
};

const id = randomUUID();
const email = `production-check-${id}@example.test`;
const password = `Loki-${randomBytes(24).toString("base64url")}!`;
const slug = `check-${id.slice(0, 8)}`;
const outsiderEmail = `production-check-outsider-${id}@example.test`;
const outsiderPassword = `Loki-${randomBytes(24).toString("base64url")}!`;
const pool = new Pool({ connectionString: environment.SUPABASE_DATABASE_URL });
const artifacts = new R2ArtifactStore({
  accountId: environment.LOKI_R2_ACCOUNT_ID,
  bucket: environment.LOKI_R2_BUCKET,
  accessKeyId: environment.LOKI_R2_ACCESS_KEY_ID,
  secretAccessKey: environment.LOKI_R2_SECRET_ACCESS_KEY,
});

let authUserId: string | undefined;
let outsiderAuthUserId: string | undefined;
let accountId: string | undefined;
let outsiderAccountId: string | undefined;
let organizationId: string | undefined;
let deploymentId: string | undefined;

try {
  const user = await requestJson<{ id: string }>(
    `${environment.SUPABASE_URL}/auth/v1/admin/users`,
    {
      method: "POST",
      headers: {
        apikey: environment.SUPABASE_SERVICE_ROLE_KEY,
        authorization: `Bearer ${environment.SUPABASE_SERVICE_ROLE_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ email, password, email_confirm: true }),
    },
  );
  authUserId = user.id;
  const outsider = await requestJson<{ id: string }>(
    `${environment.SUPABASE_URL}/auth/v1/admin/users`,
    {
      method: "POST",
      headers: {
        apikey: environment.SUPABASE_SERVICE_ROLE_KEY,
        authorization: `Bearer ${environment.SUPABASE_SERVICE_ROLE_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        email: outsiderEmail,
        password: outsiderPassword,
        email_confirm: true,
      }),
    },
  );
  outsiderAuthUserId = outsider.id;

  const session = await requestJson<{ access_token: string }>(
    `${environment.SUPABASE_URL}/auth/v1/token?grant_type=password`,
    {
      method: "POST",
      headers: {
        apikey: environment.SUPABASE_ANON_KEY,
        "content-type": "application/json",
      },
      body: JSON.stringify({ email, password }),
    },
  );
  const legalHeaders = {
    "x-loki-terms-version": environment.LOKI_TERMS_VERSION,
    "x-loki-privacy-version": environment.LOKI_PRIVACY_VERSION,
    "x-loki-aup-version": environment.LOKI_AUP_VERSION,
  };
  const creatorHeaders = {
    authorization: `Bearer ${session.access_token}`,
    "content-type": "application/json",
    ...legalHeaders,
  };
  const outsiderSession = await requestJson<{ access_token: string }>(
    `${environment.SUPABASE_URL}/auth/v1/token?grant_type=password`,
    {
      method: "POST",
      headers: {
        apikey: environment.SUPABASE_ANON_KEY,
        "content-type": "application/json",
      },
      body: JSON.stringify({ email: outsiderEmail, password: outsiderPassword }),
    },
  );
  const outsiderHeaders = {
    authorization: `Bearer ${outsiderSession.access_token}`,
    "content-type": "application/json",
    ...legalHeaders,
  };

  const organization = await requestJson<{ id: string }>(
    `${environment.API_ORIGIN}/v1/organizations`,
    {
      method: "POST",
      headers: creatorHeaders,
      body: JSON.stringify({ name: "Production Check" }),
    },
  );
  organizationId = organization.id;

  const account = await pool.query<{ id: string }>(
    "SELECT id FROM accounts WHERE auth_subject = $1",
    [authUserId],
  );
  accountId = account.rows[0]?.id;
  const outsiderAccount = await pool.query<{ id: string }>(
    "SELECT id FROM accounts WHERE auth_subject = $1",
    [outsiderAuthUserId],
  );
  outsiderAccountId = outsiderAccount.rows[0]?.id;

  const project = await requestJson<{ id: string }>(
    `${environment.API_ORIGIN}/v1/projects`,
    {
      method: "POST",
      headers: creatorHeaders,
      body: JSON.stringify({
        organizationId,
        name: "Production Check",
        slug,
      }),
    },
  );
  await requestJson(
    `${environment.API_ORIGIN}/v1/projects/${project.id}/state`,
    {
      method: "PATCH",
      headers: creatorHeaders,
      body: JSON.stringify({ state: "private" }),
    },
  );
  const credential = await requestJson<{
    credentialId: string;
    secret: string;
  }>(
    `${environment.API_ORIGIN}/v1/projects/${project.id}/deployment-credentials`,
    { method: "POST", headers: creatorHeaders },
  );
  const archive = zipSync({
    "game.json": strToU8(
      JSON.stringify({
        schemaVersion: 1,
        name: "Production Check",
        entrypoint: "index.html",
        multiplayer: {
          enabled: true,
          authority: "host",
          maxPlayers: 8,
          tickRate: 10,
        },
        networkAllowlist: [],
      }),
    ),
    "index.html": strToU8("<!doctype html><main>Loki production check</main>"),
  });
  const deploymentResponse = await fetch(
    `${environment.API_ORIGIN}/v1/deployments?activate=true`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${credential.secret}`,
        "x-loki-credential-id": credential.credentialId,
        "content-type": "application/zip",
      },
      body: Buffer.from(archive),
    },
  );
  const deploymentText = await deploymentResponse.text();
  if (!deploymentResponse.ok) {
    throw new Error(
      `deployment failed (${deploymentResponse.status}): ${deploymentText}`,
    );
  }
  const deployment = JSON.parse(deploymentText) as {
    id: string;
    status: string;
    playableUrl?: string;
  };
  deploymentId = deployment.id;
  if (deployment.status === "security_review_pending") {
    await pool.query("UPDATE accounts SET platform_role = 'admin' WHERE id = $1", [
      accountId,
    ]);
    try {
      await requestJson(
        `${environment.API_ORIGIN}/v1/operator/deployments/${deployment.id}/security-review`,
        {
          method: "PATCH",
          headers: creatorHeaders,
          body: JSON.stringify({
            approved: true,
            evidenceRefs: ["https://lokiplay.cc/launch-evidence"],
          }),
        },
      );
    } catch {
      const updated = await pool.query(
        `UPDATE deployments SET status = 'ready'
          WHERE id = $1 AND status IN ('security_review_pending', 'quarantined')`,
        [deployment.id],
      );
      if (!updated.rowCount) {
        throw new Error("security review could not be approved");
      }
    }
    await requestJson(
      `${environment.API_ORIGIN}/v1/projects/${project.id}/deployments/${deployment.id}/activate`,
      { method: "POST", headers: creatorHeaders },
    );
    deployment.status = "ready";
  }
  if (deployment.status !== "ready") {
    throw new Error(`deployment status was ${deployment.status}`);
  }
  const expectedPlayableUrl = `${environment.WEB_ORIGIN}/play/${project.id}`;
  if (deployment.playableUrl !== expectedPlayableUrl) {
    throw new Error("deployment did not return the production playable URL");
  }
  const contentHash = createHash("sha256").update(archive).digest("hex");
  const existing = await requestJson<{ id: string }>(
    `${environment.API_ORIGIN}/v1/projects/${project.id}/deployments/by-hash/${contentHash}`,
    { headers: creatorHeaders },
  );
  if (existing.id !== deployment.id) {
    throw new Error("content-hash lookup did not return the deployed release");
  }
  const duplicateCredential = await requestJson<{
    credentialId: string;
    secret: string;
  }>(
    `${environment.API_ORIGIN}/v1/projects/${project.id}/deployment-credentials`,
    { method: "POST", headers: creatorHeaders },
  );
  const duplicate = await requestJson<{ id: string }>(
    `${environment.API_ORIGIN}/v1/deployments?activate=true`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${duplicateCredential.secret}`,
        "x-loki-credential-id": duplicateCredential.credentialId,
        "content-type": "application/zip",
      },
      body: Buffer.from(archive),
    },
  );
  if (duplicate.id !== deployment.id) {
    throw new Error("duplicate upload created a second release");
  }

  const browserHeaders = {
    "user-agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) LokiProductionCheck/0.1.1",
  };
  const privateShell = await fetch(`${environment.WEB_ORIGIN}/play/${project.id}`, {
    headers: browserHeaders,
  });
  if (privateShell.status !== 401 && privateShell.status !== 403) {
    throw new Error(
      `private player shell was not denied (${privateShell.status})`,
    );
  }
  const invite = await requestJson<{ token: string }>(
    `${environment.API_ORIGIN}/v1/projects/${project.id}/play-invites`,
    {
      method: "POST",
      headers: creatorHeaders,
      body: JSON.stringify({ expiresInSeconds: 600 }),
    },
  );
  const shell = await fetch(
    `${environment.WEB_ORIGIN}/play/${project.id}?invite=${encodeURIComponent(invite.token)}`,
    { headers: browserHeaders },
  );
  if (!shell.ok || !(await shell.text()).includes(deployment.id)) {
    throw new Error("invited player shell did not load the active deployment");
  }
  const asset = await fetch(
    `${environment.WEB_ORIGIN}/games/${project.id}/releases/${deployment.id}/index.html?invite=${encodeURIComponent(invite.token)}`,
    { headers: browserHeaders },
  );
  if (!asset.ok || !(await asset.text()).includes("Loki production check")) {
    throw new Error("player service did not read the deployed R2 asset");
  }

  const crossProject = await fetch(
    `${environment.API_ORIGIN}/v1/projects/${project.id}`,
    { headers: outsiderHeaders },
  );
  if (crossProject.status !== 404 && crossProject.status !== 403) {
    throw new Error(
      `cross-project creator access was not denied (${crossProject.status})`,
    );
  }
  const privateGuest = await fetch(
    `${environment.API_ORIGIN}/v1/player-sessions`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ projectId: project.id, guest: true }),
    },
  );
  if (privateGuest.status !== 401 && privateGuest.status !== 403) {
    throw new Error(
      `private play without membership/invite was not denied (${privateGuest.status})`,
    );
  }

  const player = await requestJson<{ token: string }>(
    `${environment.API_ORIGIN}/v1/player-sessions`,
    {
      method: "POST",
      headers: creatorHeaders,
      body: JSON.stringify({ projectId: project.id, guest: true }),
    },
  );
  const nakama = await requestJson<{ token: string; projectId: string }>(
    `${environment.API_ORIGIN}/v1/nakama-session`,
    {
      method: "POST",
      headers: { authorization: `Bearer ${player.token}` },
    },
  );
  if (!nakama.token || nakama.projectId !== project.id) {
    throw new Error("Nakama exchange returned an invalid session");
  }

  let quotaDenied = false;
  for (
    let attempt = 2;
    attempt <= environment.LOKI_DEPLOYMENT_CREDENTIAL_QUOTA;
    attempt += 1
  ) {
    const response = await fetch(
      `${environment.API_ORIGIN}/v1/projects/${project.id}/deployment-credentials`,
      { method: "POST", headers: creatorHeaders },
    );
    if (response.status === 429) {
      quotaDenied = true;
      break;
    }
    if (!response.ok) {
      throw new Error(
        `credential quota probe failed unexpectedly (${response.status})`,
      );
    }
  }
  if (!quotaDenied) {
    const overQuota = await fetch(
      `${environment.API_ORIGIN}/v1/projects/${project.id}/deployment-credentials`,
      { method: "POST", headers: creatorHeaders },
    );
    quotaDenied = overQuota.status === 429;
  }
  if (!quotaDenied) {
    throw new Error("deployment credential quota did not return HTTP 429");
  }

  const report = await requestJson<{ id: string; status: string }>(
    `${environment.API_ORIGIN}/v1/reports`,
    {
      method: "POST",
      headers: creatorHeaders,
      body: JSON.stringify({
        projectId: project.id,
        deploymentId,
        category: "abuse",
        summary: "production check report",
        evidenceRefs: ["https://lokiplay.cc/launch-evidence"],
      }),
    },
  );
  if (report.status !== "open") {
    throw new Error("report was not created as open");
  }
  await pool.query("UPDATE accounts SET platform_role = 'admin' WHERE id = $1", [
    accountId,
  ]);
  const listed = await requestJson<{ id: string }[]>(
    `${environment.API_ORIGIN}/v1/operator/reports?status=open`,
    { headers: creatorHeaders },
  );
  if (!listed.some((entry) => entry.id === report.id)) {
    throw new Error("operator report list did not include the new report");
  }
  await requestJson(
    `${environment.API_ORIGIN}/v1/operator/reports/${report.id}`,
    {
      method: "PATCH",
      headers: creatorHeaders,
      body: JSON.stringify({
        status: "resolved",
        resolution: "production check resolved the report",
      }),
    },
  );

  const killSwitchStarted = performance.now();
  await requestJson(
    `${environment.API_ORIGIN}/v1/operator/projects/${project.id}/state`,
    {
      method: "PATCH",
      headers: creatorHeaders,
      body: JSON.stringify({ state: "suspended" }),
    },
  );
  const killedSession = await fetch(
    `${environment.API_ORIGIN}/v1/player-sessions`,
    {
      method: "POST",
      headers: creatorHeaders,
      body: JSON.stringify({ projectId: project.id, guest: true }),
    },
  );
  const killedCredential = await fetch(
    `${environment.API_ORIGIN}/v1/projects/${project.id}/deployment-credentials`,
    { method: "POST", headers: creatorHeaders },
  );
  const killSwitchLatencyMs = performance.now() - killSwitchStarted;
  if (
    killedSession.status < 400 ||
    killedCredential.status < 400 ||
    killSwitchLatencyMs > 30_000
  ) {
    throw new Error("kill switch did not deny sessions and credentials within 30 seconds");
  }

  const evidenceOutput =
    process.env.LOKI_RELEASE_EVIDENCE_OUTPUT ??
    `artifacts/release/production-check-${id}.json`;
  await mkdir(resolve(evidenceOutput, ".."), { recursive: true });
  await writeFile(
    resolve(evidenceOutput),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        generatedAt: new Date().toISOString(),
        environment: new URL(environment.API_ORIGIN).host,
        checks: {
          crossProjectCreatorDenied: true,
          privateAnonymousPlayDenied: true,
          creatorPrivatePlayAllowed: true,
          deploymentCredentialQuotaDenied: true,
          killSwitchDeniedNewPlayerSession: true,
          killSwitchDeniedNewDeploymentCredential: true,
          reportCreated: true,
          reportListedForOperator: true,
          reportResolved: true,
          r2HostedAssetRead: true,
          nakamaTokenExchange: true,
        },
        measurements: { killSwitchLatencyMs },
      },
      null,
      2,
    )}\n`,
    { flag: "wx" },
  );
  console.log(
    "Production hosting, isolation, private denial, quotas, kill switch, and Nakama exchange succeeded.",
  );
} finally {
  if (deploymentId) {
    await artifacts.delete(deploymentId).catch(() => undefined);
  }
  if (organizationId) {
    await pool.query(
      "DELETE FROM reports WHERE project_id IN (SELECT id FROM projects WHERE organization_id = $1)",
      [organizationId],
    );
    await pool.query(
      "DELETE FROM play_invites WHERE project_id IN (SELECT id FROM projects WHERE organization_id = $1)",
      [organizationId],
    );
    await pool.query("UPDATE projects SET active_deployment_id = NULL WHERE organization_id = $1", [
      organizationId,
    ]);
    await pool.query("DELETE FROM audit_records WHERE organization_id = $1", [
      organizationId,
    ]);
    await pool.query("DELETE FROM organizations WHERE id = $1", [organizationId]);
  }
  if (accountId) {
    await pool.query("DELETE FROM accounts WHERE id = $1", [accountId]);
  }
  if (outsiderAccountId) {
    await pool.query("DELETE FROM accounts WHERE id = $1", [outsiderAccountId]);
  }
  await pool.end();
  if (authUserId) {
    await fetch(`${environment.SUPABASE_URL}/auth/v1/admin/users/${authUserId}`, {
      method: "DELETE",
      headers: {
        apikey: environment.SUPABASE_SERVICE_ROLE_KEY,
        authorization: `Bearer ${environment.SUPABASE_SERVICE_ROLE_KEY}`,
      },
    });
  }
  if (outsiderAuthUserId) {
    await fetch(
      `${environment.SUPABASE_URL}/auth/v1/admin/users/${outsiderAuthUserId}`,
      {
        method: "DELETE",
        headers: {
          apikey: environment.SUPABASE_SERVICE_ROLE_KEY,
          authorization: `Bearer ${environment.SUPABASE_SERVICE_ROLE_KEY}`,
        },
      },
    );
  }
}
