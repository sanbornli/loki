# Loki simulation worker

Implements the "Simulation fleet" step of `.cursor/plans/turn_then_server_auth_344defe4.plan.md`:
a Go process, deployed in the same Singapore region as Nakama, that steps
one fuel-metered WebAssembly isolate per live `authority: "server"` match
and tears it down when the room ends.

For this prototype the worker is also its own orchestrator — Nakama
(`infra/nakama/modules/loki.js`, see `placeServerAuthorityMatch`,
`stepServerAuthorityMatch`, `teardownServerAuthorityMatch`) talks to it
directly over `LOKI_WORKER_ORCHESTRATOR_URL`. A pool spanning many worker
processes, with an orchestrator that picks a worker per match, is future
work for when a single machine cannot hold every live server-authority
match.

## HTTP surface

- `POST /matches` — `{ matchId, tickRate, stepModule: { abiVersion, modulePath, sha256 } }`.
  Fetches and validates the step module by hash (if not already cached),
  instantiates a fresh isolate, and returns `{ workerUrl }`. Idempotent for
  a match that is already placed.
- `POST /matches/{id}/tick` — `{ tick, inputs }`. Runs exactly one `step()`
  call in that match's isolate and returns `{ simulationTick, state }`.
- `POST /matches/{id}/teardown` — closes and forgets the match's isolate.
- `GET /health` — `{ ok, matches }`.

## The step ABI (v1)

A step module must import nothing and export exactly one function:

```
step(inputLen uint32, stateLen uint32) uint32
```

The worker writes `inputLen` bytes of the tick's canonical JSON inputs at
memory offset `0`, and `stateLen` bytes of the previous state's canonical
JSON at offset `524288` (512 KiB in), before calling `step`. The module
reads both, computes the next state, writes its own canonical JSON back
into the state region (up to 512 KiB), and returns the number of bytes it
wrote. See `isolate.go` for the exact offsets and `validate.go` for the
structural check (no imports, exactly one function export named `step`)
that runs before a fetched module is ever instantiated — the same rule
already enforced at upload time by `apps/api/src/step-module.ts`.

## Fuel, time, and memory budgets

wazero has no per-instruction fuel counter (unlike wasmtime). Per match,
this worker instead bounds:

- **Fuel**: every guest function call, including recursive ones, spends one
  unit (`LOKI_WORKER_FUEL_PER_TICK`, default 1,000,000). Exhausting it
  cancels the tick.
- **Time**: each `step()` call runs under a `context.WithTimeout` (default
  20ms, `LOKI_WORKER_TICK_TIMEOUT_MS`), and the isolate's `wazero.Runtime`
  is built with `WithCloseOnContextDone(true)` so a timeout actually aborts
  a single-function spin loop.
- **Memory**: `WithMemoryLimitPages` (default 48 pages / 3 MiB,
  `LOKI_WORKER_MEMORY_LIMIT_PAGES`) caps how far the module's memory can
  grow, regardless of what the module itself declares as its max.
- **Lifetime steps**: a coarse call-count cap (default 10,000,000,
  `LOKI_WORKER_MAX_STEPS`) so a match cannot run forever even if every
  individual tick stays inside its fuel and time budgets.

Every match gets its own `wazero.Runtime` (never shared), so a match that
hits its timeout or memory limit and gets torn down can never affect a
neighboring match's isolate.

## Crash recovery

An isolate keeps its `lastState`/`lastTick` after a failed tick rather than
resetting; a transient failure (one slow tick, one trap) just means that
tick did not advance, and the next `/matches/{id}/tick` call tries again
against the same last-good state. `loki.js` counts consecutive tick
failures per room and ends the room (rather than falling back to a player
host) once `SERVER_AUTHORITY_MAX_CONSECUTIVE_FAILURES` is exceeded. A
`/matches` call for a match ID that already has an isolate is a no-op, so a
retried placement after a worker restart does not create a second isolate.

## Environment variables

| Variable | Purpose | Default |
| --- | --- | --- |
| `LOKI_WORKER_PUBLIC_URL` | URL Nakama uses to reach this worker (required) | — |
| `LOKI_WORKER_MODULE_BASE_URL` | Base URL to fetch step modules by hash from (`{base}/{sha256}`) | — |
| `LOKI_WORKER_LISTEN_ADDR` | HTTP listen address | `:8090` |
| `LOKI_WORKER_TICK_TIMEOUT_MS` | Per-tick time budget | `20` |
| `LOKI_WORKER_MEMORY_LIMIT_PAGES` | Per-isolate memory page limit (64 KiB/page) | `48` |
| `LOKI_WORKER_MAX_STEPS` | Per-isolate lifetime step count backstop | `10000000` |
| `LOKI_WORKER_IDLE_TIMEOUT_SECONDS` | Idle-reaper threshold for isolates never explicitly torn down | `600` |

## Building

```sh
go build ./...
go vet ./...
go test ./...
```

All three are compiler- and test-verified (`go1.22`+); no changes were
needed to make them pass.

## Deploying

`Dockerfile` and `railway.json` build and run this worker as its own Railway
service, on private networking beside `nakama`, per
[`docs/PROVIDERS.md`](/Users/sanborn/Desktop/loki/docs/PROVIDERS.md)'s
"Simulation worker (server authority)" section. In production,
`LOKI_WORKER_MODULE_BASE_URL` points at
`https://api.lokiplay.cc/v1/step-modules` — the unauthenticated,
content-addressed route in `apps/api/src/server.ts` that serves whatever
`apps/api/src/step-module.ts` accepted at upload time.

## Local end-to-end smoke

Verified manually against a real `apps/api` server (in-memory stores) and this
worker, both built from source, with no stub in between:

1. `deployZip` a zip containing `infra/worker/testdata/step_echo.wasm` as a
   `"server"`-authority manifest's step module; the API validates it and
   stores it by sha256.
2. Start `apps/api`'s HTTP server; `GET /v1/step-modules/{sha256}` returns
   those exact bytes.
3. Start this worker with `LOKI_WORKER_MODULE_BASE_URL` pointed at that API.
4. `POST /matches` places a match; the worker fetches the module by hash,
   verifies the digest, and instantiates it.
5. `POST /matches/{id}/tick` steps it once; the echo module's output matches
   the input exactly.
6. `POST /matches/{id}/teardown` closes the isolate; `/health` reports zero
   matches; a further tick on that match ID 404s.

This exercises every hop in the plan's "Simulation fleet" and "Upload
boundary" sections except the actual Nakama `nk.httpRequest` calls, which
`test/loki-server-authority.test.ts` already covers against a fake `nk`.
