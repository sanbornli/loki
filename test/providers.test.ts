import assert from "node:assert/strict";
import test from "node:test";
import { loadProviderEnvironment } from "../apps/api/src/config.js";

const secret = "a-secure-value-longer-than-sixteen";

test("local provider configuration has safe defaults", () => {
  const environment = loadProviderEnvironment({});
  assert.equal(environment.LOKI_RUNTIME, "local");
  assert.equal(environment.PORT, 8787);
  assert.equal(environment.SENTRY_ENVIRONMENT, "local");
});

test("GitHub App provider variables are validated as one secret group", () => {
  assert.throws(
    () =>
      loadProviderEnvironment({
        LOKI_GITHUB_APP_SLUG: "loki-play",
      }),
    /LOKI_GITHUB_APP_ID is required/,
  );
  const environment = loadProviderEnvironment({
    LOKI_GITHUB_APP_SLUG: "loki-play",
    LOKI_GITHUB_APP_ID: "12345",
    LOKI_GITHUB_PRIVATE_KEY: secret,
    LOKI_GITHUB_WEBHOOK_SECRET: secret,
  });
  assert.equal(environment.LOKI_GITHUB_APP_SLUG, "loki-play");
});

test("production provider configuration fails closed", () => {
  assert.throws(
    () => loadProviderEnvironment({ LOKI_RUNTIME: "production" }),
    /required in production/,
  );
});

test("selected production providers validate without exposing secrets", () => {
  const environment = loadProviderEnvironment({
    LOKI_RUNTIME: "production",
    LOKI_PUBLIC_ORIGIN: "https://api.lokiplay.test",
    LOKI_PUBLIC_WEB_ORIGIN: "https://play.lokiplay.test",
    LOKI_GAME_BASE_DOMAIN: "games.lokiplay.test",
    LOKI_DEVICE_AUTH_KEY: Buffer.alloc(32, 7).toString("base64"),
    SUPABASE_URL: "https://project.supabase.co",
    SUPABASE_DATABASE_URL: `postgresql://postgres:${secret}@db.test/postgres`,
    LOKI_SESSION_PRIVATE_KEY: secret,
    LOKI_SESSION_PUBLIC_KEY: secret,
    LOKI_PLAY_INVITE_KEY: secret,
    LOKI_TERMS_VERSION: "counsel-approved-terms-v1",
    LOKI_PRIVACY_VERSION: "counsel-approved-privacy-v1",
    LOKI_AUP_VERSION: "counsel-approved-aup-v1",
    LOKI_R2_ACCOUNT_ID: "account",
    LOKI_R2_BUCKET: "lokiplay-releases",
    LOKI_R2_ACCESS_KEY_ID: secret,
    LOKI_R2_SECRET_ACCESS_KEY: secret,
    LOKI_NAKAMA_ORIGIN: "https://nakama.lokiplay.test",
    LOKI_NAKAMA_SERVER_KEY: secret,
    LOKI_NAKAMA_HTTP_KEY: secret,
    NAKAMA_DATABASE_URL: `postgresql://postgres.nakama:${secret}@supabase.test/postgres`,
    NAKAMA_SESSION_ENCRYPTION_KEY: secret,
    NAKAMA_REFRESH_ENCRYPTION_KEY: secret,
    SENTRY_DSN: "https://public@sentry.test/1",
  });
  assert.equal(
    environment.SUPABASE_JWT_ISSUER,
    "https://project.supabase.co/auth/v1",
  );
  assert.equal(environment.LOKI_R2_BUCKET, "lokiplay-releases");
});
