import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { Pool } from "pg";
import { GameManifestSchema } from "../../../packages/protocol/src/index.js";
import { PostgresCliDeviceAuthorizationService } from "./cli-device-auth.js";
import { loadProviderEnvironment } from "./config.js";
import { DashboardService } from "./dashboard.js";
import { PostgresDeploymentDedupService } from "./deployment-dedup.js";
import { DeploymentService } from "./deployments.js";
import { GitHubAppClient } from "./github-app.js";
import { PostgresGitHubConnectionService } from "./github-connections.js";
import {
  GuestResumeSigner,
  PlayInviteSigner,
  PostgresHostingAuthorization,
} from "./hosting-auth.js";
import { NakamaGateway } from "./nakama.js";
import { startObservability } from "./observability.js";
import {
  PostgresDeploymentRepository,
  PostgresPlatformService,
} from "./postgres.js";
import { R2ArtifactStore } from "./r2.js";
import { reviewDeploymentFiles } from "./async-security.js";
import { PostgresSafetyService, SecurityReviewWorker } from "./safety.js";
import { startApiServer } from "./server.js";
import { SupabaseAuthVerifier } from "./supabase-auth.js";
import { SessionTokenService } from "./tokens.js";

const environment = loadProviderEnvironment(process.env);

const decodePem = (value: string, name: string): string => {
  const pem = Buffer.from(value, "base64").toString("utf8");
  if (!pem.includes("-----BEGIN")) throw new Error(`${name} is not base64 PEM`);
  return pem;
};

const pool = new Pool({
  connectionString: environment.SUPABASE_DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});
await pool.query("SELECT 1");

const tokens = new SessionTokenService({
  privateKeyPem: decodePem(
    environment.LOKI_SESSION_PRIVATE_KEY!,
    "LOKI_SESSION_PRIVATE_KEY",
  ),
  publicKeyPem: decodePem(
    environment.LOKI_SESSION_PUBLIC_KEY!,
    "LOKI_SESSION_PUBLIC_KEY",
  ),
});
const platform = new PostgresPlatformService(pool, tokens);
const safety = new PostgresSafetyService(pool);
const playInviteKey = environment.LOKI_PLAY_INVITE_KEY
  ? Buffer.from(environment.LOKI_PLAY_INVITE_KEY, "base64url")
  : createHash("sha256").update(environment.LOKI_SESSION_PRIVATE_KEY!).digest();
const hostingAuth = new PostgresHostingAuthorization(
  pool,
  new PlayInviteSigner(playInviteKey),
);
const guestResume = new GuestResumeSigner(playInviteKey);
const dashboard = new DashboardService(pool);
const deploymentDedup = new PostgresDeploymentDedupService(pool);
const githubConnections = new PostgresGitHubConnectionService(pool);
const githubApp = environment.LOKI_GITHUB_APP_SLUG
  ? new GitHubAppClient({
      appId: environment.LOKI_GITHUB_APP_ID!,
      privateKeyPem: decodePem(
        environment.LOKI_GITHUB_PRIVATE_KEY!,
        "LOKI_GITHUB_PRIVATE_KEY",
      ),
      webhookSecret: environment.LOKI_GITHUB_WEBHOOK_SECRET!,
    })
  : undefined;
const deviceAuth = new PostgresCliDeviceAuthorizationService(
  pool,
  Buffer.from(environment.LOKI_DEVICE_AUTH_KEY!, "base64"),
  {
    verificationUri: new URL(
      "/device",
      environment.LOKI_PUBLIC_WEB_ORIGIN!,
    ).toString(),
    maximumAccessTokenLifetimeSeconds: 3_700,
  },
);
const artifacts = new R2ArtifactStore({
  accountId: environment.LOKI_R2_ACCOUNT_ID!,
  bucket: environment.LOKI_R2_BUCKET!,
  accessKeyId: environment.LOKI_R2_ACCESS_KEY_ID!,
  secretAccessKey: environment.LOKI_R2_SECRET_ACCESS_KEY!,
});
const deployments = new DeploymentService(
  platform,
  artifacts,
  new PostgresDeploymentRepository(pool),
  safety,
);
const securityWorker = new SecurityReviewWorker(pool, async (deploymentId) => {
  const result = await pool.query<{ files: string[]; manifest: { networkAllowlist?: string[] } }>(
    "SELECT files, manifest FROM deployments WHERE id = $1",
    [deploymentId],
  );
  const row = result.rows[0];
  if (!row) throw new Error("deployment not found");
  const files = new Map<string, Uint8Array>();
  for (const name of row.files ?? []) {
    const bytes = await artifacts.get(deploymentId, name);
    if (bytes) files.set(name, bytes);
  }
  if (files.size === 0) {
    return { decision: "needs_operator", evidenceRefs: [`async-scan:missing-bytes:${deploymentId}`] };
  }
  return reviewDeploymentFiles(files, row.manifest?.networkAllowlist ?? []);
});
const securityReviewTimer = setInterval(() => {
  void securityWorker.runOne().catch(observability.captureException);
}, 5_000);
securityReviewTimer.unref();
const auth = new SupabaseAuthVerifier({
  supabaseUrl: environment.SUPABASE_URL!,
  issuer: environment.SUPABASE_JWT_ISSUER,
  audience: environment.SUPABASE_JWT_AUDIENCE,
});
const nakama = new NakamaGateway(platform, {
  origin: environment.LOKI_NAKAMA_ORIGIN!,
  serverKey: environment.LOKI_NAKAMA_SERVER_KEY!,
  httpKey: environment.LOKI_NAKAMA_HTTP_KEY!,
  async projectConfig(projectId) {
    const result = await pool.query<{ manifest: unknown }>(
      `SELECT deployments.manifest
         FROM projects
         JOIN deployments ON deployments.id = projects.active_deployment_id
        WHERE projects.id = $1
          AND deployments.status IN ('ready', 'ready_with_warnings')`,
      [projectId],
    );
    const multiplayer = GameManifestSchema.parse(result.rows[0]?.manifest).multiplayer;
    if (!multiplayer?.enabled) throw new Error("multiplayer is not enabled");
    return {
      maxPlayers: multiplayer.maxPlayers,
      tickRate: multiplayer.tickRate,
    };
  },
});
const observability = startObservability({
  serviceName: "lokiplay-api",
  environment: environment.SENTRY_ENVIRONMENT,
  sentryDsn: environment.SENTRY_DSN,
  release: environment.SENTRY_RELEASE,
});
const acceptedLegalVersions = (request: {
  headers: Record<string, string | string[] | undefined>;
}) =>
  request.headers["x-loki-terms-version"] === environment.LOKI_TERMS_VERSION &&
  request.headers["x-loki-privacy-version"] === environment.LOKI_PRIVACY_VERSION &&
  request.headers["x-loki-aup-version"] === environment.LOKI_AUP_VERSION
    ? {
        terms: environment.LOKI_TERMS_VERSION!,
        privacy: environment.LOKI_PRIVACY_VERSION!,
        aup: environment.LOKI_AUP_VERSION!,
      }
    : undefined;

const server = startApiServer(
  {
    platform,
    dashboard,
    deployments,
    deploymentDedup,
    deviceAuth,
    githubConnections,
    githubAppSlug: environment.LOKI_GITHUB_APP_SLUG,
    githubApp,
    hostingAuth,
    guestResume,
    safety,
    playableUrl(projectId) {
      return new URL(
        `/play/${projectId}`,
        environment.LOKI_PUBLIC_WEB_ORIGIN!,
      ).toString();
    },
    nakama,
    async authenticateCreator(request) {
      const identity = await auth.identityFromRequest(request);
      if (!identity.email) throw new Error("verified creator email required");
      return (await platform.ensureCreator(
        identity.subject,
        identity.email,
        acceptedLegalVersions(request),
      )).id;
    },
    async authorizeDeviceApproval(request) {
      const authorization = request.headers.authorization;
      if (!authorization?.startsWith("Bearer ")) {
        throw new Error("creator authentication required");
      }
      const accessToken = authorization.slice("Bearer ".length);
      const identity = await auth.verify(accessToken);
      if (!identity.email) throw new Error("verified creator email required");
      const actor = await platform.ensureCreator(
        identity.subject,
        identity.email,
        acceptedLegalVersions(request),
      );
      return {
        actorId: actor.id,
        accessToken,
        accessTokenExpiresAt: identity.expiresAt,
      };
    },
    async authenticatePlayer(request) {
      const authorization = request.headers.authorization;
      if (!authorization?.startsWith("Bearer ")) return undefined;
      const identity = await auth.verify(authorization.slice("Bearer ".length));
      return identity.email
        ? (await platform.ensureCreator(
            identity.subject,
            identity.email,
            acceptedLegalVersions(request),
          )).id
        : identity.subject;
    },
    allowOrigin(origin) {
      try {
        const url = new URL(origin);
        const baseDomain = environment.LOKI_GAME_BASE_DOMAIN!;
        return (
          (url.protocol === "https:" &&
            (url.hostname === baseDomain ||
              url.hostname.endsWith(`.${baseDomain}`))) ||
          (url.protocol === "http:" &&
            (url.hostname === "localhost" || url.hostname === "127.0.0.1"))
        );
      } catch {
        return false;
      }
    },
    captureException: observability.captureException,
    async readiness() {
      const checks: Record<string, boolean> = {
        postgres: false,
        r2: false,
        nakama: false,
      };
      try {
        await pool.query("SELECT 1");
        checks.postgres = true;
      } catch {}
      try {
        await artifacts.get("00000000-0000-0000-0000-000000000000", "_health");
        checks.r2 = true;
      } catch {}
      try {
        const response = await fetch(new URL("/healthcheck", environment.LOKI_NAKAMA_ORIGIN!));
        checks.nakama = response.ok;
      } catch {}
      return checks;
    },
    log(record) {
      console.log(JSON.stringify(record));
    },
  },
  environment.PORT,
  "0.0.0.0",
);

let shuttingDown = false;
const shutdown = async (): Promise<void> => {
  if (shuttingDown) return;
  shuttingDown = true;
  clearInterval(securityReviewTimer);
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  await pool.end();
  await observability.shutdown();
};

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    void shutdown().then(
      () => process.exit(0),
      (error) => {
        console.error(error);
        process.exit(1);
      },
    );
  });
}
