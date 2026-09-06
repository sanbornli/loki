# Loki architecture decisions

## MVP control plane

- TypeScript services use Supabase Auth and Supabase PostgreSQL for platform
  identity and control-plane data.
- Authentication is injected at the HTTP boundary; game and deployment
  services receive trusted actor IDs rather than parsing provider-specific
  objects.
- PostgreSQL migrations are the production persistence contract. In-memory
  repositories are used only by local tests.
- Player sessions are Loki-issued, Ed25519-signed, project-scoped, and expire
  within 15 minutes.
- Deployment credentials are random, hashed at rest, project-scoped, expire
  after 10 minutes, and can be consumed once.
- Audit records are append-only and organization-scoped.

## Browser Layer 1

- Creators upload finished ZIP builds; Loki never executes uploaded backends.
- Archives are preflighted for traversal, symlinks, encryption, expansion
  limits, entry count, prohibited files, secrets, localhost assumptions,
  dynamic code, and undeclared network origins.
- Accepted releases are immutable. `R2ArtifactStore` targets Cloudflare R2;
  tests use the same interface with an in-memory store.
- Games run on a separate origin in an iframe without `allow-same-origin`.
  Game responses receive restrictive CSP and permissions headers.

## Multiplayer

- Nakama is private infrastructure behind Loki's versioned protocol.
- Nakama uses a second, dedicated Supabase PostgreSQL project and runs on
  Railway. It never shares the platform/authentication database.
- Nakama derives project membership from server-only storage.
- MVP state is host-authoritative while Nakama controls room admission,
  membership, sequencing, snapshots, and host migration.
- Creator-authored server rules remain post-MVP.

## Selected production providers

- One Supabase project for Auth and platform PostgreSQL data
- A second Supabase project for isolated Nakama PostgreSQL data
- Railway for API, web, workers, Nakama compute, infrastructure logs, metrics,
  deployment events, and alerts
- Cloudflare R2, CDN, DNS, wildcard game origins, and Turnstile
- Sentry for frontend/API errors, application traces and logs, uptime, and
  release correlation

Neon and Grafana Cloud are deferred. A separate database supplier is not needed
while Supabase can provide a second isolated project, and Railway plus Sentry
cover the MVP observability requirements without a third monitoring system.

The production root domain is `lokiplay.cc`. Railway serves
`api.lokiplay.cc`, `play.lokiplay.cc`, and isolated per-project origins under
`*.lokiplay.cc`; Cloudflare owns DNS and edge proxying. Provider values are
stored only as Railway secrets.

## Release history and source control

- GitHub remains the source-version system; Loki does not duplicate Git.
- Every deployment is an immutable release with content hash, actor,
  compatibility findings, activation history, and optional repository, branch,
  commit, and automation provenance.
- CLI/dashboard upload is the first supported path.
- A least-privilege GitHub App later adds opt-in branch deployments and pull
  request previews. Auto-deployment is never required.
