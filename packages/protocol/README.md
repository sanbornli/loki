# @lokiplay/protocol

Shared Loki schemas and TypeScript types for manifests, rooms, messages, and
player session claims, plus canonical JSON and state hashing utilities.

```sh
npm install @lokiplay/protocol
```

Schemas are exported as Zod schemas with corresponding inferred TypeScript
types.

Protocol version 1 is accepted only by version-1 clients and servers. Clients
must reject a `minimumProtocolVersion` they do not support and must ignore
capabilities they did not negotiate. Additive optional fields are compatible;
changing required fields, meanings, opcodes, or error codes requires a new
protocol version.

Rooms are host-authoritative. Loki validates tenancy, membership, sequencing,
quotas, and host ownership, but it cannot prove that the elected host simulated
gameplay honestly. This contract is intended for casual and unranked games and
must not be used as a ranked anti-cheat boundary.

Canonical JSON and synchronized-room numbers must be finite safe integers.
`quantize` and `dequantize` convert fractional values into that integer
contract. Snapshot and presence envelopes may include `membersComplete` and
`membershipRevision`. An omitted or empty `members` list is incomplete, not a
leave; `membersComplete: true` is required before an empty roster means
everyone left. `membershipRevision` increases for a real leave or a new member,
not for a recovered interruption. Host interruption uses a short authority
grace before migration and a longer membership grace before the player is
removed.

## Protocol v1 vs protocol v2 (realtime)

Protocol version 1 (`PROTOCOL_VERSION`) covers room lifecycle, presence,
chat, leaderboards, and `SynchronizedRoom`'s transactional action/host_state
traffic on opcodes 10-16. It is unchanged by realtime support: `tickRate`,
`host_state`, and every existing v1 field keep their current meaning, and
`ClientEnvelopeSchema`/`ServerEnvelopeSchema` remain closed unions.

Protocol version 2 (`REALTIME_PROTOCOL_VERSION`) is a dedicated data plane
for `RealtimeRoom`: continuous input streaming, host-authoritative snapshots,
and sync-on-migration, carried on opcodes 17-19 (`REALTIME_OPCODES`) via
`RealtimeClientEnvelopeSchema`/`RealtimeServerEnvelopeSchema`. It is JavaScript-only
in this release. A runtime accepts protocol version 2 only on opcodes 17-19
and continues to require protocol version 1 on opcodes 10-16 in the same
room; the two families never overlap and a v2 message is only ever routed to
sessions that advertised `realtime_rooms` support during join, because older
clients parse every delivered envelope with the closed v1 schema.

Realtime traffic uses two independent fences instead of the single global
`sequence` used for v1 delivery ordering:

- `authorityEpoch` (runtime-owned): increments on host migration; rejects
  snapshots from a superseded host.
- `roundSequence` (host-owned, via `beginRound()`): increments only through
  an explicit round reset; rejects stale-round inputs/snapshots (e.g. late
  echoes after a restart).

Capabilities advertise the realtime contract additively: `realtime_rooms`,
`realtimeProtocolVersion: 2`, and passthrough limits `maxRealtimeSnapshotHz`
(25), `maxRealtimeInputHz` (20), and `maxRealtimeInFlightSnapshots` (8). A
client must treat a missing `realtime_rooms` capability as "unsupported" and
must not fall back to sending v2 envelopes.
