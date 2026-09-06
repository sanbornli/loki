# Production providers

Loki uses replaceable provider adapters. Provider credentials belong in Railway
service variables and must never be committed or included in game builds.

## Selected services

- Supabase project 1: creator/player identity and Loki control-plane data
- Supabase project 2: dedicated Nakama PostgreSQL data
- Railway: API, web, workers, Nakama compute, and infrastructure monitoring
- Cloudflare R2/CDN/DNS: immutable game files and application/game domains
- Sentry: browser/API exceptions, application traces/logs, uptime, and releases

## Current production resources

- Supabase platform project `qtkrudajyatxnwgzaitb` in Singapore; Loki migrations
  `001_foundation.sql` and `002_deployments.sql` are applied.
- Supabase Nakama project `jstaqafrzfniwrftgjpy` in Singapore; Nakama owns and
  has applied its database schema.
- Railway project `lokiplay-production` with `api`, `web`, and `nakama`
  services deployed in Singapore. Temporary verification endpoints exist for
  all three services.
- Cloudflare R2 is configured and passed write, read, immutable-release, and
  cleanup checks. `api.lokiplay.cc` and `*.lokiplay.cc` are attached to Railway.
  The wildcard traffic record is proxied through Cloudflare in Full SSL mode,
  and valid edge HTTPS is verified for `play.lokiplay.cc` and arbitrary
  per-project subdomains.
- Sentry is intentionally deferred.

Both Supabase projects and the initial Railway/Nakama environment are in
Singapore. Multiplayer starts in one region; add regions only after latency and
data-consistency tests define the topology.

## Supabase

1. Create a production platform project for Auth and Loki control-plane data.
2. Create a second production project used exclusively by Nakama.
3. Create separate development projects before shared development begins.
4. Enable email verification and the required social providers only in the
   platform project.
5. Set the site URL to the creator application and allow only explicit local,
   preview, and production callback URLs.
6. Use asymmetric JWT signing keys so the API can verify access tokens through
   the Supabase JWKS endpoint.
7. Put the platform project's direct PostgreSQL connection string in
   `SUPABASE_DATABASE_URL`; use it only from migrations and trusted services.
8. Put the Nakama project's direct connection string, or Supavisor session-mode
   string if required by Railway networking, in `NAKAMA_DATABASE_URL`.
9. Apply Loki migrations only to the platform project with
   `npm run db:migrate`. Nakama applies its own migrations to its project.
10. Enable point-in-time recovery on both projects before private beta and test
    each restore path.

Supabase identifies the human. Loki's database remains authoritative for
organizations, memberships, roles, projects, and deployment permissions.

## Railway

Create separate `api`, `web`, `nakama`, and worker services in development and
production environments. Use private networking between API and Nakama.

The Nakama service uses `infra/nakama/Dockerfile` and
`infra/nakama/railway.json`. Configure:

- `NAKAMA_DATABASE_URL`
- `LOKI_NAKAMA_HTTP_KEY`
- `LOKI_NAKAMA_SERVER_KEY`
- `NAKAMA_SESSION_ENCRYPTION_KEY`
- `NAKAMA_REFRESH_ENCRYPTION_KEY`
- `NAKAMA_CONSOLE_USERNAME`
- `NAKAMA_CONSOLE_PASSWORD`
- `NAKAMA_CONSOLE_SIGNING_KEY`

Generate independent random values for every environment. Never reuse local
defaults. Keep the Nakama console private rather than assigning it a public
domain.

The API and web services use PostgreSQL repositories and production bootstraps.
The deployed integration check covers Supabase authentication, account and
project persistence, deployment credentials, R2 upload/read, player hosting,
and Nakama session exchange. In-memory implementations remain for local tests.

## Cloudflare

1. Keep the R2 bucket private and create an API token scoped only to that bucket.
2. Configure the API with `LOKI_R2_ACCOUNT_ID`, `LOKI_R2_BUCKET`,
   `LOKI_R2_ACCESS_KEY_ID`, and `LOKI_R2_SECRET_ACCESS_KEY`.
3. Give the web service a separate read-only R2 credential before private beta;
   do not retain the API's read/write credential there.
4. Proxy the player and wildcard game domains through Cloudflare so immutable
   release responses can use the CDN while authorization remains at Loki.
5. Loki currently uses `api.lokiplay.cc` for the API and one Railway wildcard,
   `*.lokiplay.cc`, for `play.lokiplay.cc` and per-project isolated origins.
6. Add Turnstile to registration and abuse-sensitive forms when those frontends
   are built.

Cloudflare Access is an optional extra boundary for staging and the operator
console. It is not creator/player identity.

## GitHub App and Actions deployments

Configure the API with the complete GitHub App variable group:
`LOKI_GITHUB_APP_SLUG`, `LOKI_GITHUB_APP_ID`,
`LOKI_GITHUB_PRIVATE_KEY` (base64-encoded PEM), and
`LOKI_GITHUB_WEBHOOK_SECRET`. The setup URL is
`https://api.lokiplay.cc/v1/github/callback`; the webhook endpoint is
`https://api.lokiplay.cc/v1/github/webhooks`.

The App has read/write Contents and Workflows permissions. During connection,
Loki automatically creates the configured workflow on the selected branch. An
existing workflow is updated only when its decoded content starts with the
exact `lokiplay.github-actions.v1` ownership marker; Loki refuses to overwrite
any other file. `GET /v1/projects/:id/github/actions-configuration` still
returns `workflowContent` for transparency and recovery. The workflow builds in
GitHub Actions and uploads the configured finished-build artifact. Loki never
runs the repository's build command.

Apply API migrations through `005_github_pending_installation.sql` before
enabling callbacks. Automated workflow updates must remain limited to a file
bearing Loki's ownership marker and must never replace an arbitrary existing
workflow.

## Railway monitoring and Sentry

Use Railway's built-in dashboard for service logs, CPU, memory, disk, network,
deployment events, and threshold alerts. Set `SENTRY_DSN`,
`SENTRY_ENVIRONMENT`, and `SENTRY_RELEASE` for application errors, traces, logs,
uptime, and release correlation. Do not send credentials, player tokens, chat
contents, or uploaded game source as telemetry.

Grafana Cloud is deferred until longer retention, custom infrastructure metrics,
or cross-provider operations justify another monitoring supplier.

Before private beta, alerts must cover API error rate, deployment failures,
Nakama disconnects, room creation failures, PostgreSQL saturation, R2 errors,
and missing telemetry.

## Verification

`npm run providers:check` validates the production variable shape without
printing secrets. It does not prove provider ownership or network access.
The deployed provider check has passed, and the Theme 03 player, creator, and
operator surfaces respond through wildcard HTTPS. Railway's origin-side
wildcard certificate is still polling authorization, so Cloudflare currently
terminates public wildcard TLS and connects to Railway in Full mode.
Backup restore, private-play authorization, WebSocket continuity under failure,
and sustained load remain required before private beta.
