# Backend support integration

The CLI authorization and deployment-deduplication modules are wired into
`server.ts` and `main.ts`. GitHub connection persistence and authenticated
connection-start/status routes are wired; callback, webhook verification, and
Actions artifact ingestion still require GitHub App credentials.

## CLI device authorization

Construct `PostgresCliDeviceAuthorizationService` with the shared `pg.Pool`, a
32-byte AES-256-GCM key loaded from secret storage, and the public HTTPS
verification URI. Keep that key separate from the database. Rotating it requires
allowing existing device grants to expire first.

The existing routes already match `begin()` and `poll()`:

- `POST /v1/cli/device` calls `begin()` and returns `201`.
- `GET /v1/cli/device/:deviceCode` calls `poll()`, returning `202` while pending
  and `200 { "accessToken": "..." }` once. A second completed poll fails because
  consumption is atomic and one-time.

Add the browser-side approval route:

- `POST /v1/cli/device/approve`, authenticated with
  `authenticateCreator`.
- Body: `{ "userCode": "..." }`.
- The verified bearer token, actor ID, and token expiry are passed to
  `approve()` by the server; return `204`.

The service stores only AES-GCM ciphertext, IV, and authentication tag. The
production adapter accepts Supabase's one-hour creator token lifetime. Do not
log codes or tokens.

## Deployment deduplication

The API exposes an authorized preflight lookup at:

`GET /v1/projects/:projectId/deployments/by-hash/:contentHash`.

The upload service also enforces deduplication after credential consumption.
It treats `UNIQUE (project_id, content_hash)` as authoritative for races,
deletes any losing artifact, returns the winning release, and activates only
when the requested release is not already active.

## GitHub App connections

Implemented authenticated routes:

- `POST /v1/projects/:projectId/github/connect` calls
  `beginConnection(actorId, projectId)` and returns the GitHub App installation
  URL when `LOKI_GITHUB_APP_SLUG` is configured.
- `GET /v1/projects/:projectId/github/connection` calls
  `getConnection(actorId, projectId)`.
- `GET /v1/projects/:projectId/github/actions-configuration` calls
  `actionsDeploymentConfiguration(actorId, projectId)`.

Remaining adapter routes:

- The GitHub callback validates the callback, selects/configures a repository,
  then calls `completeConnection(state, configuration)`.

- `POST /v1/github/webhooks` must first verify GitHub's webhook signature
  against the exact raw request bytes.
- Pass `X-GitHub-Delivery`, `X-GitHub-Event`, installation ID, repository ID,
  and those raw bytes to `recordWebhookDelivery`.
- Return `202` only when `accepted` is true. Return `200` for duplicate delivery
  IDs without processing them again.
- After processing, call `completeWebhookDelivery`.

Loki must never run `buildCommand`. GitHub Actions checks out `branch`, runs the
command in `rootDirectory`, and uploads only `outputDirectory` as
`artifactName`. Loki ingests that finished browser artifact through the normal
deployment validation/storage path. Webhook signature verification, GitHub App
JWT generation, installation-token exchange, workflow dispatch, artifact
download, and deployment-credential minting remain adapter responsibilities.
