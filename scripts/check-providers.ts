import { loadProviderEnvironment } from "../apps/api/src/config.js";

const environment = loadProviderEnvironment({
  ...process.env,
  LOKI_RUNTIME: "production",
});

console.log(
  JSON.stringify(
    {
      supabase: {
        auth: new URL(environment.SUPABASE_URL!).host,
        databaseConfigured: true,
      },
      railway: {
        publicOrigin: environment.LOKI_PUBLIC_ORIGIN,
        nakamaOrigin: environment.LOKI_NAKAMA_ORIGIN,
      },
      cloudflare: {
        gameBaseDomain: environment.LOKI_GAME_BASE_DOMAIN,
        r2Bucket: environment.LOKI_R2_BUCKET,
      },
      supabaseNakama: { separateDatabaseConfigured: true },
      railwayMonitoring: { configuredAtDeployment: true },
      sentry: { applicationMonitoringConfigured: true },
    },
    null,
    2,
  ),
);
