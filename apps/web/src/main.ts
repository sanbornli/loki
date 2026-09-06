import { Pool } from "pg";
import { z } from "zod";
import { PostgresDeploymentRepository, PostgresPlatformService } from "../../api/src/postgres.js";
import { PlayInviteSigner, PostgresHostingAuthorization } from "../../api/src/hosting-auth.js";
import { R2ReadOnlyArtifactStore } from "../../api/src/r2.js";
import { SupabaseAuthVerifier } from "../../api/src/supabase-auth.js";
import { SessionTokenService } from "../../api/src/tokens.js";
import { startWebServer } from "./server.js";

const environment = z
  .object({
    PORT: z.coerce.number().int().min(1).max(65_535).default(8788),
    SUPABASE_DATABASE_URL: z.string().min(16),
    SUPABASE_URL: z.string().url(),
    SUPABASE_ANON_KEY: z.string().min(16),
    LOKI_PUBLIC_API_ORIGIN: z.string().url(),
    LOKI_GAME_BASE_DOMAIN: z.string().min(3),
    LOKI_R2_ACCOUNT_ID: z.string().regex(/^[a-f0-9]{32}$/i),
    LOKI_R2_BUCKET: z.string().min(3),
    LOKI_R2_READ_ACCESS_KEY_ID: z.string().min(16),
    LOKI_R2_READ_SECRET_ACCESS_KEY: z.string().min(16),
    LOKI_PLAY_INVITE_KEY: z.string().min(43),
  })
  .parse(process.env);

const pool = new Pool({
  connectionString: environment.SUPABASE_DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});
await pool.query("SELECT 1");

const platform = new PostgresPlatformService(pool, new SessionTokenService());
const deployments = new PostgresDeploymentRepository(pool);
const artifacts = new R2ReadOnlyArtifactStore({
  accountId: environment.LOKI_R2_ACCOUNT_ID,
  bucket: environment.LOKI_R2_BUCKET,
  accessKeyId: environment.LOKI_R2_READ_ACCESS_KEY_ID,
  secretAccessKey: environment.LOKI_R2_READ_SECRET_ACCESS_KEY,
});
const playAuthorization = new PostgresHostingAuthorization(
  pool,
  new PlayInviteSigner(Buffer.from(environment.LOKI_PLAY_INVITE_KEY, "base64url")),
);
const auth = new SupabaseAuthVerifier({ supabaseUrl: environment.SUPABASE_URL });

const server = startWebServer(
  {
    platform,
    deployments,
    artifacts,
    async authorizePlay(request, projectId) {
      let actorId: string | undefined;
      const authorization = request.headers.authorization;
      if (authorization?.startsWith("Bearer ")) {
        const identity = await auth.verify(authorization.slice("Bearer ".length));
        if (identity.email) {
          actorId = (
            await pool.query<{ id: string }>(
              "SELECT id FROM accounts WHERE auth_subject = $1 AND suspended_at IS NULL",
              [identity.subject],
            )
          ).rows[0]?.id;
        }
      }
      return playAuthorization.authorizeRequest(request, projectId, actorId);
    },
    gameOrigin(projectId) {
      return `https://${projectId}.${environment.LOKI_GAME_BASE_DOMAIN}`;
    },
    productConfig: {
      apiOrigin: environment.LOKI_PUBLIC_API_ORIGIN,
      supabaseUrl: environment.SUPABASE_URL,
      supabaseAnonKey: environment.SUPABASE_ANON_KEY,
    },
    async readiness() {
      const checks = { postgres: false, r2: false };
      try {
        await pool.query("SELECT 1");
        checks.postgres = true;
      } catch {}
      try {
        await artifacts.get("00000000-0000-0000-0000-000000000000", "_health");
        checks.r2 = true;
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
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  await pool.end();
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
