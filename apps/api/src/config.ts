import { z } from "zod";

const optionalUrl = z.string().url().optional();
const optionalSecret = z.string().min(16).optional();

const ProviderEnvironmentSchema = z
  .object({
    LOKI_RUNTIME: z.enum(["local", "production"]).default("local"),
    PORT: z.coerce.number().int().min(1).max(65_535).default(8787),
    LOKI_PUBLIC_ORIGIN: optionalUrl,
    LOKI_PUBLIC_WEB_ORIGIN: optionalUrl,
    LOKI_GAME_BASE_DOMAIN: z.string().min(3).optional(),
    LOKI_DEVICE_AUTH_KEY: optionalSecret,
    LOKI_GITHUB_APP_SLUG: z.string().regex(/^[A-Za-z0-9-]+$/).optional(),
    LOKI_GITHUB_APP_ID: z.string().regex(/^[1-9][0-9]*$/).optional(),
    LOKI_GITHUB_PRIVATE_KEY: optionalSecret,
    LOKI_GITHUB_WEBHOOK_SECRET: optionalSecret,

    SUPABASE_URL: optionalUrl,
    SUPABASE_JWT_ISSUER: optionalUrl,
    SUPABASE_JWT_AUDIENCE: z.string().min(1).default("authenticated"),
    SUPABASE_DATABASE_URL: optionalSecret,

    LOKI_SESSION_PRIVATE_KEY: optionalSecret,
    LOKI_SESSION_PUBLIC_KEY: optionalSecret,
    LOKI_PLAY_INVITE_KEY: optionalSecret,
    LOKI_TERMS_VERSION: z.string().min(1).optional(),
    LOKI_PRIVACY_VERSION: z.string().min(1).optional(),
    LOKI_AUP_VERSION: z.string().min(1).optional(),

    LOKI_R2_ACCOUNT_ID: z.string().min(1).optional(),
    LOKI_R2_BUCKET: z.string().min(3).optional(),
    LOKI_R2_ACCESS_KEY_ID: optionalSecret,
    LOKI_R2_SECRET_ACCESS_KEY: optionalSecret,

    LOKI_NAKAMA_ORIGIN: optionalUrl,
    LOKI_NAKAMA_SERVER_KEY: optionalSecret,
    LOKI_NAKAMA_HTTP_KEY: optionalSecret,
    NAKAMA_DATABASE_URL: optionalSecret,
    NAKAMA_SESSION_ENCRYPTION_KEY: optionalSecret,
    NAKAMA_REFRESH_ENCRYPTION_KEY: optionalSecret,

    SENTRY_DSN: optionalUrl,
    SENTRY_ENVIRONMENT: z.string().default("local"),
    SENTRY_RELEASE: z.string().optional(),
  })
  .superRefine((environment, context) => {
    const githubKeys = [
      "LOKI_GITHUB_APP_SLUG",
      "LOKI_GITHUB_APP_ID",
      "LOKI_GITHUB_PRIVATE_KEY",
      "LOKI_GITHUB_WEBHOOK_SECRET",
    ] as const;
    if (githubKeys.some((key) => environment[key])) {
      for (const key of githubKeys) {
        if (!environment[key]) {
          context.addIssue({
            code: "custom",
            path: [key],
            message: `${key} is required when GitHub App integration is configured`,
          });
        }
      }
    }
    if (environment.LOKI_RUNTIME !== "production") return;
    const required = [
      "LOKI_PUBLIC_ORIGIN",
      "LOKI_PUBLIC_WEB_ORIGIN",
      "LOKI_GAME_BASE_DOMAIN",
      "LOKI_DEVICE_AUTH_KEY",
      "SUPABASE_URL",
      "SUPABASE_DATABASE_URL",
      "LOKI_SESSION_PRIVATE_KEY",
      "LOKI_SESSION_PUBLIC_KEY",
      "LOKI_PLAY_INVITE_KEY",
      "LOKI_TERMS_VERSION",
      "LOKI_PRIVACY_VERSION",
      "LOKI_AUP_VERSION",
      "LOKI_R2_ACCOUNT_ID",
      "LOKI_R2_BUCKET",
      "LOKI_R2_ACCESS_KEY_ID",
      "LOKI_R2_SECRET_ACCESS_KEY",
      "LOKI_NAKAMA_ORIGIN",
      "LOKI_NAKAMA_SERVER_KEY",
      "LOKI_NAKAMA_HTTP_KEY",
    ] as const;
    for (const key of required) {
      if (!environment[key]) {
        context.addIssue({
          code: "custom",
          path: [key],
          message: `${key} is required in production`,
        });
      }
    }
  });

export type ProviderEnvironment = z.infer<typeof ProviderEnvironmentSchema>;

export function loadProviderEnvironment(
  environment: NodeJS.ProcessEnv = process.env,
): ProviderEnvironment {
  const parsed = ProviderEnvironmentSchema.parse(environment);
  if (parsed.SUPABASE_URL && !parsed.SUPABASE_JWT_ISSUER) {
    parsed.SUPABASE_JWT_ISSUER = `${parsed.SUPABASE_URL.replace(/\/$/, "")}/auth/v1`;
  }
  return parsed;
}
