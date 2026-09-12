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
