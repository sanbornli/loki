# Loki

Loki's TypeScript foundation and browser Layer 1 implementation, including the
completed Phase 0 prototypes.

## Run

```sh
npm install
npm run check
```

`npm run check` type-checks the monorepo, runs protocol, control-plane,
deployment, sandbox-hosting, SDK, CLI, and Phase 0 tests, then refreshes the
machine-readable Phase 0 report.

CLI development commands:

```sh
npm run lokiplay -- init ./my-game
npm run lokiplay -- validate ./my-game
```

To run the real Nakama/PostgreSQL integration after installing Docker Desktop:

```sh
npm run validate:nakama
npm run evaluate
npm run nakama:down
```

The integration authenticates sixteen users across two projects and verifies
server-only tenant provisioning, forged-project rejection, isolated room
admission and state, stale-update rejection, host migration, and tenant-scoped
matchmaking. It also exercises an eight-player room at approximately ten state
updates per second. Passing evidence is written to
`artifacts/nakama-integration.json` and incorporated into the main evaluation.

The decision record is in `PHASE_ZERO_DECISIONS.md`.

## Layout

- `apps/api` — creator/project lifecycle, Ed25519 player sessions, one-use
  deployment credentials, audit records, ZIP scanning, immutable releases, and
  HTTP API.
- `apps/web` — private player shell and immutable game asset delivery with
  iframe, CSP, permissions-policy, and origin isolation.
- `packages/protocol` — versioned manifests, room messages, session claims,
  canonical JSON, and state hashes.
- `packages/sdk-js` — Nakama-independent JavaScript game SDK.
- `packages/cli` — `lokiplay init`, `validate`, `deploy`, and `status`.
- `packages/ui-web` — room, player, invite, and chat overlay component.
- `packages/mcp` and `packages/agent-instructions` — agent-facing integration
  resources, validation tools, and canonical project guidance.
- `apps/api/migrations` — PostgreSQL account, organization, project,
  credential, audit, and deployment schema.
- `src/prototypes.ts` — shared infrastructure stand-in, room state machine,
  browser sandbox policy, isolated rules runner, adapter, extraction spike, and
  WebAssembly module.
- `src/evaluate.ts` — repeatable Phase 0 evaluation and go/no-go evidence.
- `test/phase-zero.test.ts` — tenant, room, sandbox, client, replay, failure,
  extraction, and WebAssembly tests.
- `test/nakama.integration.ts` — live Nakama authentication, room, migration,
  and matchmaking isolation suite.
- `clients/` — protocol-independent JavaScript, Swift, Kotlin, and Unity
  client spikes.
- `infra/compose.yaml` — local Nakama and PostgreSQL deployment.
- `infra/nakama/modules/loki.js` — server-only tenant mapping and authoritative
  generic-room module.

The implementation is intentionally prototype quality. A passing local test
does not override the explicit deployment and security gates in the decision
record.
