import { createHash } from "node:crypto";
import { z } from "zod";

export const MAX_TICK_RATE = 30;
// Host snapshot publish ceiling. Independent of MAX_TICK_RATE, which bounds
// the server-authority room loop.
export const MAX_REALTIME_SNAPSHOT_HZ = 100;
export const MAX_REALTIME_IN_FLIGHT_SNAPSHOTS = 25;

// A pinned WebAssembly step module for a `"server"`-authority room. The
// module ABI is one export, `step`; it may import nothing (no WASI, clocks,
// randomness, or host functions). `sha256` pins the exact bytes the
// validator accepted and the worker fleet will fetch by hash, so a room
// never silently runs a different build than the one that passed the
// upload-boundary checks.
export const StepModuleDescriptorSchema = z
  .object({
    abiVersion: z.literal(1),
    modulePath: z
      .string()
      .regex(/^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9._/-]+\.wasm$/),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();

export const ProjectStateSchema = z.enum([
  "draft",
  "private",
  "unlisted",
  "inactive",
  "review_requested",
  "published",
  "suspended",
]);

export const GameManifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    name: z.string().trim().min(1).max(80),
    entrypoint: z
      .string()
      .regex(/^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9._/-]+\.html$/),
    multiplayer: z
      .object({
        enabled: z.boolean(),
        authority: z.enum(["host", "server"]),
        maxPlayers: z.number().int().min(1).max(16),
        tickRate: z.number().int().min(1).max(MAX_TICK_RATE),
        // Present if and only if authority is "server". tickRate stays the isolate's tick.
        step: StepModuleDescriptorSchema.optional(),
      })
      .strict()
      .refine(
        (value) => value.authority !== "server" || value.step !== undefined,
        "server authority requires a pinned step module descriptor",
      )
      .refine(
        (value) => value.authority === "server" || value.step === undefined,
        "step is only valid together with server authority",
      )
      .optional(),
    networkAllowlist: z.array(z.string().url()).max(10).default([]),
  })
  .strict();

export const RoomVisibilitySchema = z.enum([
  "private",
  "unlisted",
  "matchmaking",
  "public",
]);

export const CreateRoomVisibilitySchema = z.enum([
  "private",
  "unlisted",
  "public",
]);

export const ModeLabelSchema = z
  .string()
  .regex(/^[A-Za-z0-9][A-Za-z0-9._ -]{0,31}$/);

export const RoomConfigSchema = z
  .object({
    roomKey: z.string().regex(/^[a-z0-9-]{1,64}$/),
    visibility: RoomVisibilitySchema,
    maxPlayers: z.number().int().min(1).max(16),
    teamSize: z.number().int().min(1).max(16).optional(),
    tickRate: z.number().int().min(1).max(MAX_TICK_RATE),
  })
  .strict()
  .refine(
    (value) => !value.teamSize || value.maxPlayers % value.teamSize === 0,
    "teamSize must divide maxPlayers",
  );

export const PROTOCOL_VERSION = 1 as const;

export const ErrorCodeSchema = z.enum([
  "UNAUTHORIZED",
  "FORBIDDEN",
  "TENANT_MISMATCH",
  "PROJECT_SUSPENDED",
  "ROOM_NOT_FOUND",
  "ROOM_FULL",
  "INVITE_INVALID",
  "INVITE_EXPIRED",
  "STALE_VERSION",
  "HOST_REQUIRED",
  "RATE_LIMITED",
  "QUOTA_EXCEEDED",
  "INVALID_MESSAGE",
  "UNSUPPORTED_VERSION",
  "SERVICE_UNAVAILABLE",
]);

export const CapabilitySchema = z.enum([
  "rooms",
  "invites",
  "matchmaking",
  "host_migration",
  "reconnect",
  "presence",
  "chat",
  "private_leaderboards",
  "synchronized_rooms",
  "realtime_rooms",
  "public_room_browser",
  "realtime_webrtc",
]);

export const ActionIdSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{8,128}$/);

export const ActionRejectionOutcomeSchema = z.enum(["rejected", "invalid"]);

export const ProtocolLimitsSchema = z
  .object({
    maxPlayersPerRoom: z.number().int().min(1).max(16),
    maxMessageBytes: z.number().int().positive(),
    maxChatBytes: z.number().int().positive(),
    messagesPerSecond: z.number().int().positive(),
    maxRealtimeSnapshotHz: z.number().int().positive().optional(),
    maxRealtimeInputHz: z.number().int().positive().optional(),
    maxRealtimeInFlightSnapshots: z.number().int().positive().optional(),
  })
  .passthrough();

export const RuntimeCapabilityBlockSchema = z
  .object({
    synchronized_rooms: z.boolean().optional(),
    realtime_rooms: z.boolean().optional(),
    public_room_browser: z.boolean().optional(),
    // Whether this runtime relays WebRTC signaling for realtime rooms. A
    // client should only attempt host-star negotiation when this is true;
    // a runtime that omits or sets this false silently ignores signaling
    // opcodes and every realtime message stays on the Nakama WebSocket.
    realtime_webrtc: z.boolean().optional(),
    // Server rooms advance simulationTick once per Nakama tickRate. The
    // viewer clock must use that period, not the game's local simulationHz.
    authority: z.enum(["host", "server"]).optional(),
    tickRate: z.number().int().min(1).max(30).optional(),
    realtimeProtocolVersion: z.number().int().positive().optional(),
    limits: ProtocolLimitsSchema.optional(),
    minimumProtocolVersion: z.number().int().positive().optional(),
  })
  .passthrough();

export const ProtocolHelloSchema = z
  .object({
    protocolVersion: z.literal(PROTOCOL_VERSION),
    minimumProtocolVersion: z.literal(PROTOCOL_VERSION),
    capabilities: z.array(z.string().min(1)),
    limits: ProtocolLimitsSchema,
  })
  .passthrough();

export const ActionSenderIdSchema = z.string().min(1).max(128);

export const PresenceSchema = z
  .object({
    playerId: z.string().min(1).max(128),
    sessionId: z.string().min(1).max(128),
    joinedAt: z.number().int().nonnegative(),
    team: z.number().int().nonnegative().optional(),
    host: z.boolean(),
  })
  .strict();

const EnvelopeBase = {
  protocolVersion: z.literal(1),
  roomId: z.string().min(1).max(256),
  sequence: z.number().int().nonnegative(),
};

// A game-owned, bounded label shown next to a score. Loki never infers this
// from the authenticated player id; a game that has none falls back to
// showing the (opaque) playerId itself.
export const LeaderboardDisplayNameSchema = z.string().trim().min(1).max(32);

export const LeaderboardRecordSchema = z.object({
  playerId: z.string().min(1).max(128),
  displayName: LeaderboardDisplayNameSchema.optional(),
  score: z.number().int(),
  subscore: z.number().int(),
  rank: z.number().int().positive(),
});

export const ClientEnvelopeSchema = z.discriminatedUnion("type", [
  z.object({
    ...EnvelopeBase,
    type: z.literal("action"),
    payload: z.unknown(),
    actionId: ActionIdSchema.optional(),
  }),
  z.object({
    ...EnvelopeBase,
    type: z.literal("event"),
    payload: z.unknown(),
    reliable: z.boolean().default(true),
  }),
  z.object({
    ...EnvelopeBase,
    type: z.literal("host_state"),
    expectedVersion: z.number().int().nonnegative(),
    expectedStateVersion: z.number().int().nonnegative().optional(),
    actionId: ActionIdSchema.optional(),
    senderId: ActionSenderIdSchema.optional(),
    state: z.unknown(),
  }),
  z.object({
    ...EnvelopeBase,
    type: z.literal("action_reject"),
    actionId: ActionIdSchema,
    senderId: ActionSenderIdSchema.optional(),
    outcome: ActionRejectionOutcomeSchema,
    message: z.string().min(1).max(200),
  }),
  z.object({
    ...EnvelopeBase,
    type: z.literal("snapshot_request"),
  }),
  z.object({
    ...EnvelopeBase,
    type: z.literal("chat"),
    channel: z.enum(["lobby", "match"]),
    text: z.string().trim().min(1).max(500),
  }),
  z.object({
    ...EnvelopeBase,
    type: z.literal("score_submit"),
    leaderboardId: z.string().regex(/^[a-z0-9-]{1,64}$/),
    score: z.number().int(),
    subscore: z.number().int().default(0),
    displayName: z.string().trim().min(1).max(32).optional(),
  }),
]);

export const ServerEnvelopeSchema = z.discriminatedUnion("type", [
  z.object({
    ...EnvelopeBase,
    type: z.literal("snapshot"),
    hostId: z.union([z.string().uuid(), z.literal("")]),
    state: z.unknown(),
    stateVersion: z.number().int().nonnegative().optional(),
    actionId: ActionIdSchema.optional(),
    senderId: ActionSenderIdSchema.optional(),
    members: z.array(PresenceSchema).optional(),
    membersComplete: z.boolean().optional(),
    membershipRevision: z.number().int().nonnegative().optional(),
    capabilities: RuntimeCapabilityBlockSchema.optional(),
  }),
  z.object({
    ...EnvelopeBase,
    type: z.literal("state"),
    hostId: z.union([z.string().uuid(), z.literal("")]),
    state: z.unknown(),
    stateVersion: z.number().int().nonnegative().optional(),
    actionId: ActionIdSchema.optional(),
    senderId: ActionSenderIdSchema.optional(),
  }),
  z.object({
    ...EnvelopeBase,
    type: z.literal("action"),
    senderId: z.string().min(1).max(128),
    payload: z.unknown(),
    actionId: ActionIdSchema.optional(),
  }),
  z.object({
    ...EnvelopeBase,
    type: z.literal("event"),
    senderId: z.string().min(1).max(128),
    reliable: z.boolean(),
    payload: z.unknown(),
  }),
  z.object({
    ...EnvelopeBase,
    type: z.literal("presence"),
    joins: z.array(PresenceSchema),
    leaves: z.array(PresenceSchema),
    members: z.array(PresenceSchema),
    membersComplete: z.boolean().optional(),
    membershipRevision: z.number().int().nonnegative().optional(),
  }),
  z.object({
    ...EnvelopeBase,
    type: z.literal("host_changed"),
    previousHostId: z.string().min(1).max(128).optional(),
    hostId: z.string().min(1).max(128),
    stateVersion: z.number().int().nonnegative(),
  }),
  z.object({
    ...EnvelopeBase,
    type: z.literal("chat"),
    channel: z.enum(["lobby", "match"]),
    messageId: z.string().min(1).max(128),
    senderId: z.string().min(1).max(128),
    text: z.string().min(1).max(500),
    sentAt: z.number().int().nonnegative(),
  }),
  z.object({
    ...EnvelopeBase,
    type: z.literal("leaderboard"),
    leaderboardId: z.string().regex(/^[a-z0-9-]{1,64}$/),
    records: z.array(LeaderboardRecordSchema),
  }),
  z.object({
    ...EnvelopeBase,
    type: z.literal("room_closed"),
    reason: z.enum(["empty", "suspended", "shutdown", "quota"]),
  }),
  z.object({
    ...EnvelopeBase,
    type: z.literal("error"),
    code: ErrorCodeSchema,
    message: z.string().max(200),
    retryAfterMs: z.number().int().positive().optional(),
    actionId: ActionIdSchema.optional(),
    senderId: ActionSenderIdSchema.optional(),
    actionOutcome: ActionRejectionOutcomeSchema.optional(),
  }),
]);

// Protocol v2 is a dedicated realtime data plane used only by RealtimeRoom.
// It never reinterprets v1 fields, opcodes, or envelope semantics above; v1
// clients and rooms are unaffected by anything below this point.
export const REALTIME_PROTOCOL_VERSION = 2 as const;

// Opcodes 10-16 remain reserved for protocol-v1 envelopes (see EnvelopeBase
// consumers above). Realtime traffic uses a disjoint opcode range so a
// runtime can require protocolVersion 1 on 10-16 and protocolVersion 2 on
// these three without any overlap.
export const REALTIME_OPCODES = {
  input: 17,
  snapshot: 18,
  sync: 19,
  effect: 20,
  guestReport: 21,
} as const;

export const RealtimeOperationSchema = z.enum([
  "realtime_input",
  "realtime_snapshot",
  "realtime_effect",
  "realtime_sync_request",
  "realtime_guest_report",
]);

export const RealtimeDeliverySchema = z.enum(["latest", "ordered"]);

export const RealtimeInputSequenceSchema = z.number().int().nonnegative();
export const RealtimeTickSchema = z.number().int().nonnegative();

const RealtimeEnvelopeBase = {
  protocolVersion: z.literal(REALTIME_PROTOCOL_VERSION),
  roomId: z.string().min(1).max(256),
  sequence: z.number().int().nonnegative(),
};

export const RealtimeRetainedInputSchema = z
  .object({
    playerId: z.string().min(1).max(128),
    inputSequence: RealtimeInputSequenceSchema,
    targetTick: RealtimeTickSchema,
    delivery: RealtimeDeliverySchema,
    payload: z.unknown(),
  })
  .strict();

// A stable, host-confirmed event id (e.g. a collision) that guests can use
// to dedupe speculative local effects (particles/audio) against the
// authoritative outcome, without Loki knowing anything about what the
// event represents. effectId is assigned by the runtime, not the host, so
// it stays unique across host migrations even if the new host's own
// sequence counters restart from zero.
export const RealtimeRetainedEffectSchema = z
  .object({
    effectId: z.string().min(1).max(128),
    simulationTick: RealtimeTickSchema,
    serverTime: z.number().int().nonnegative(),
    payload: z.unknown(),
  })
  .strict();

export const RealtimeClientEnvelopeSchema = z.discriminatedUnion("type", [
  z.object({
    ...RealtimeEnvelopeBase,
    type: z.literal("realtime_input"),
    roundSequence: z.number().int().nonnegative(),
    inputSequence: RealtimeInputSequenceSchema,
    targetTick: RealtimeTickSchema,
    delivery: RealtimeDeliverySchema,
    clientSendTime: z.number().int().nonnegative(),
    payload: z.unknown(),
  }),
  z.object({
    ...RealtimeEnvelopeBase,
    type: z.literal("realtime_snapshot"),
    authorityEpoch: z.number().int().nonnegative(),
    roundSequence: z.number().int().nonnegative(),
    simulationTick: RealtimeTickSchema,
    hostSnapshotSequence: z.number().int().nonnegative(),
    hostSendTime: z.number().int().nonnegative(),
    processedInputCursors: z.record(z.string(), z.number().int().nonnegative()).default({}),
    state: z.unknown(),
  }),
  z.object({
    ...RealtimeEnvelopeBase,
    type: z.literal("realtime_effect"),
    authorityEpoch: z.number().int().nonnegative(),
    roundSequence: z.number().int().nonnegative(),
    simulationTick: RealtimeTickSchema,
    payload: z.unknown(),
  }),
  z.object({
    ...RealtimeEnvelopeBase,
    type: z.literal("realtime_sync_request"),
  }),
  // A guest's own bounded, low-frequency measurement of transport health
  // (arrival cadence, jitter, missing sequence numbers, how often it had to
  // extrapolate past the newest snapshot), routed only to the current host
  // so a host-side adaptive rate controller can react to the worst-placed
  // guest instead of only its own send/ack cadence. Loki never learns
  // anything about game state from this; it is transport telemetry only.
  z.object({
    ...RealtimeEnvelopeBase,
    type: z.literal("realtime_guest_report"),
    roundSequence: z.number().int().nonnegative(),
    effectiveSnapshotHz: z.number().nonnegative().optional(),
    arrivalJitterMs: z.number().nonnegative().optional(),
    sequenceGaps: z.number().int().nonnegative(),
    extrapolatedFrameRatio: z.number().min(0).max(1),
    latestAuthoritativeTick: RealtimeTickSchema.optional(),
  }),
]);

export const RealtimeServerEnvelopeSchema = z.discriminatedUnion("type", [
  z.object({
    ...RealtimeEnvelopeBase,
    type: z.literal("realtime_input"),
    senderId: z.string().min(1).max(128),
    roundSequence: z.number().int().nonnegative(),
    inputSequence: RealtimeInputSequenceSchema,
    targetTick: RealtimeTickSchema,
    delivery: RealtimeDeliverySchema,
    clientSendTime: z.number().int().nonnegative(),
    serverReceiveTime: z.number().int().nonnegative(),
    payload: z.unknown(),
  }),
  z.object({
    ...RealtimeEnvelopeBase,
    type: z.literal("realtime_snapshot"),
    hostId: z.string().max(128),
    authorityEpoch: z.number().int().nonnegative(),
    roundSequence: z.number().int().nonnegative(),
    simulationTick: RealtimeTickSchema,
    runtimeSnapshotSequence: z.number().int().nonnegative(),
    // Echoes the host's own submission id, so the host can correlate this
    // broadcast (its accepted-echo) against the specific pending
    // publishSnapshot() call it released capacity for, instead of only
    // decrementing a generic in-flight counter.
    hostSnapshotSequence: z.number().int().nonnegative().optional(),
    processedInputCursors: z.record(z.string(), z.number().int().nonnegative()).default({}),
    hostSendTime: z.number().int().nonnegative(),
    serverTime: z.number().int().nonnegative(),
    state: z.unknown(),
  }),
  z.object({
    ...RealtimeEnvelopeBase,
    type: z.literal("realtime_effect"),
    hostId: z.string().min(1).max(128),
    authorityEpoch: z.number().int().nonnegative(),
    roundSequence: z.number().int().nonnegative(),
    simulationTick: RealtimeTickSchema,
    effectId: z.string().min(1).max(128),
    serverTime: z.number().int().nonnegative(),
    payload: z.unknown(),
  }),
  z.object({
    ...RealtimeEnvelopeBase,
    type: z.literal("realtime_sync_response"),
    hostId: z.string().min(1).max(128).optional(),
    authorityEpoch: z.number().int().nonnegative(),
    roundSequence: z.number().int().nonnegative(),
    simulationTick: RealtimeTickSchema.optional(),
    runtimeSnapshotSequence: z.number().int().nonnegative().optional(),
    state: z.unknown().optional(),
    retainedInputs: z.array(RealtimeRetainedInputSchema).default([]),
    retainedEffects: z.array(RealtimeRetainedEffectSchema).default([]),
    members: z.array(PresenceSchema),
    membersComplete: z.boolean().optional(),
    membershipRevision: z.number().int().nonnegative().optional(),
    serverTime: z.number().int().nonnegative(),
  }),
  z.object({
    ...RealtimeEnvelopeBase,
    type: z.literal("error"),
    code: ErrorCodeSchema,
    message: z.string().max(200),
    retryAfterMs: z.number().int().positive().optional(),
    // Which realtime operation this error responds to, and (for
    // realtime_snapshot) the specific hostSnapshotSequence it was
    // submitted with, so a client can release the exact pending
    // submission it tracked instead of guessing from a generic counter.
    operation: RealtimeOperationSchema.optional(),
    hostSnapshotSequence: z.number().int().nonnegative().optional(),
  }),
  // Routed only to the current host: one guest's bounded transport-health
  // report (see the client-side realtime_guest_report envelope above).
  z.object({
    ...RealtimeEnvelopeBase,
    type: z.literal("realtime_guest_report"),
    senderId: z.string().min(1).max(128),
    roundSequence: z.number().int().nonnegative(),
    effectiveSnapshotHz: z.number().nonnegative().optional(),
    arrivalJitterMs: z.number().nonnegative().optional(),
    sequenceGaps: z.number().int().nonnegative(),
    extrapolatedFrameRatio: z.number().min(0).max(1),
    latestAuthoritativeTick: RealtimeTickSchema.optional(),
  }),
]);

// Additive, capability-gated WebRTC signaling. These are a *separate*
// closed union from RealtimeClientEnvelopeSchema/RealtimeServerEnvelopeSchema
// above: a runtime or client that does not recognize these types must never
// have them routed through the realtime data-plane parser (that union would
// throw on an unrecognized discriminant). Opcodes 22-24 are dedicated to
// this signaling plane and never overlap 10-16 (v1) or 17-21 (v2 data).
export const REALTIME_SIGNAL_OPCODES = {
  offer: 22,
  answer: 23,
  ice: 24,
} as const;

const RealtimeSignalEnvelopeBase = {
  protocolVersion: z.literal(REALTIME_PROTOCOL_VERSION),
  roomId: z.string().min(1).max(256),
  sequence: z.number().int().nonnegative(),
  // The authority epoch this negotiation belongs to, so a signal describing
  // a since-migrated host cannot be misapplied after the fact.
  authorityEpoch: z.number().int().nonnegative(),
};

export const RealtimeSignalClientEnvelopeSchema = z.discriminatedUnion("type", [
  z.object({
    ...RealtimeSignalEnvelopeBase,
    type: z.literal("webrtc_offer"),
    toId: z.string().min(1).max(128),
    sdp: z.string().min(1).max(8_192),
  }),
  z.object({
    ...RealtimeSignalEnvelopeBase,
    type: z.literal("webrtc_answer"),
    toId: z.string().min(1).max(128),
    sdp: z.string().min(1).max(8_192),
  }),
  z.object({
    ...RealtimeSignalEnvelopeBase,
    type: z.literal("webrtc_ice"),
    toId: z.string().min(1).max(128),
    candidate: z.string().min(1).max(2_048),
    sdpMid: z.string().max(64).optional(),
    sdpMLineIndex: z.number().int().nonnegative().optional(),
  }),
]);

export const RealtimeSignalServerEnvelopeSchema = z.discriminatedUnion("type", [
  z.object({
    ...RealtimeSignalEnvelopeBase,
    type: z.literal("webrtc_offer"),
    fromId: z.string().min(1).max(128),
    sdp: z.string().min(1).max(8_192),
  }),
  z.object({
    ...RealtimeSignalEnvelopeBase,
    type: z.literal("webrtc_answer"),
    fromId: z.string().min(1).max(128),
    sdp: z.string().min(1).max(8_192),
  }),
  z.object({
    ...RealtimeSignalEnvelopeBase,
    type: z.literal("webrtc_ice"),
    fromId: z.string().min(1).max(128),
    candidate: z.string().min(1).max(2_048),
    sdpMid: z.string().max(64).optional(),
    sdpMLineIndex: z.number().int().nonnegative().optional(),
  }),
  // Told to the sender when the target is not currently a webrtc-capable
  // room member (left, reconnecting, or never advertised support); the
  // caller should stop negotiating and stay on the WebSocket for that peer.
  z.object({
    ...RealtimeSignalEnvelopeBase,
    type: z.literal("webrtc_unavailable"),
    toId: z.string().min(1).max(128),
  }),
]);

export type RealtimeSignalClientEnvelope = z.infer<typeof RealtimeSignalClientEnvelopeSchema>;
export type RealtimeSignalServerEnvelope = z.infer<typeof RealtimeSignalServerEnvelopeSchema>;

// Room-independent leaderboard access (loki_leaderboard_submit /
// loki_leaderboard_list): usable from a title screen or post-game menu
// without an active room. The in-room `score_submit` / `leaderboard`
// envelopes above remain supported unchanged.
export const LeaderboardListInputSchema = z
  .object({
    leaderboardId: z.string().regex(/^[a-z0-9-]{1,64}$/),
    limit: z.number().int().min(1).max(100).default(20),
    cursor: z.string().min(1).max(4_096).optional(),
  })
  .strict();

export const LeaderboardListResultSchema = z
  .object({
    leaderboardId: z.string().regex(/^[a-z0-9-]{1,64}$/),
    records: z.array(LeaderboardRecordSchema),
    nextCursor: z.string().min(1).max(4_096).optional(),
  })
  .strict();

export const LeaderboardSubmitInputSchema = z
  .object({
    leaderboardId: z.string().regex(/^[a-z0-9-]{1,64}$/),
    score: z.number().int(),
    subscore: z.number().int().default(0),
    displayName: LeaderboardDisplayNameSchema.optional(),
  })
  .strict();

export const LeaderboardSubmitResultSchema = z
  .object({
    record: LeaderboardRecordSchema,
  })
  .strict();

export type LeaderboardRecord = z.infer<typeof LeaderboardRecordSchema>;
export type LeaderboardListInput = z.infer<typeof LeaderboardListInputSchema>;
export type LeaderboardListResult = z.infer<typeof LeaderboardListResultSchema>;
export type LeaderboardSubmitInput = z.infer<typeof LeaderboardSubmitInputSchema>;
export type LeaderboardSubmitResult = z.infer<typeof LeaderboardSubmitResultSchema>;

export type RealtimeOperation = z.infer<typeof RealtimeOperationSchema>;
export type RealtimeDelivery = z.infer<typeof RealtimeDeliverySchema>;
export type RealtimeRetainedInput = z.infer<typeof RealtimeRetainedInputSchema>;
export type RealtimeRetainedEffect = z.infer<typeof RealtimeRetainedEffectSchema>;
export type RealtimeClientEnvelope = z.infer<typeof RealtimeClientEnvelopeSchema>;
export type RealtimeServerEnvelope = z.infer<typeof RealtimeServerEnvelopeSchema>;

export const DEFAULT_REALTIME_LIMITS = {
  maxRealtimeSnapshotHz: MAX_REALTIME_SNAPSHOT_HZ,
  maxRealtimeInputHz: 20,
  maxRealtimeInFlightSnapshots: MAX_REALTIME_IN_FLIGHT_SNAPSHOTS,
} as const;

export const PlayerSessionClaimsSchema = z
  .object({
    issuer: z.literal("lokiplay"),
    audience: z.literal("lokiplay-game"),
    subject: z.string().uuid(),
    projectId: z.string().uuid(),
    organizationId: z.string().uuid(),
    guest: z.boolean(),
    issuedAt: z.number().int(),
    expiresAt: z.number().int(),
    nonce: z.string().uuid(),
  })
  .strict();

export const CreateRoomOptionsSchema = z
  .object({
    visibility: CreateRoomVisibilitySchema.optional(),
    modeLabel: ModeLabelSchema.optional(),
  })
  .strict()
  .refine(
    (value) => value.modeLabel === undefined || value.visibility === "public",
    "modeLabel is only valid for public rooms",
  );

export const PublicRoomSummarySchema = z
  .object({
    roomId: z.string().min(1).max(256),
    playerCount: z.number().int().min(1).max(16),
    maxPlayers: z.number().int().min(1).max(16),
    joinable: z.boolean(),
    modeLabel: ModeLabelSchema.optional(),
  })
  .strict();

export const ListPublicRoomsInputSchema = z
  .object({
    limit: z.number().int().min(1).max(50).default(50),
  })
  .strict();

export type StepModuleDescriptor = z.infer<typeof StepModuleDescriptorSchema>;

export const ListPublicRoomsResultSchema = z
  .object({
    rooms: z.array(PublicRoomSummarySchema).max(50),
  })
  .strict();

export const JoinPublicRoomInputSchema = z
  .object({
    roomId: z.string().min(1).max(256),
  })
  .strict();

export type ProjectState = z.infer<typeof ProjectStateSchema>;
export type GameManifest = z.infer<typeof GameManifestSchema>;
export type RoomConfig = z.infer<typeof RoomConfigSchema>;
export type RoomVisibility = z.infer<typeof RoomVisibilitySchema>;
export type CreateRoomVisibility = z.infer<typeof CreateRoomVisibilitySchema>;
export type CreateRoomOptions = z.infer<typeof CreateRoomOptionsSchema>;
export type PublicRoomSummary = z.infer<typeof PublicRoomSummarySchema>;
export type ListPublicRoomsInput = z.infer<typeof ListPublicRoomsInputSchema>;
export type ListPublicRoomsResult = z.infer<typeof ListPublicRoomsResultSchema>;
export type JoinPublicRoomInput = z.infer<typeof JoinPublicRoomInputSchema>;
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;
export type Capability = z.infer<typeof CapabilitySchema>;
export type ActionId = z.infer<typeof ActionIdSchema>;
export type ActionRejectionOutcome = z.infer<typeof ActionRejectionOutcomeSchema>;
export type ProtocolLimits = z.infer<typeof ProtocolLimitsSchema>;
export type RuntimeCapabilityBlock = z.infer<typeof RuntimeCapabilityBlockSchema>;
export type ProtocolHello = z.infer<typeof ProtocolHelloSchema>;
export type Presence = z.infer<typeof PresenceSchema>;
export type ClientEnvelope = z.infer<typeof ClientEnvelopeSchema>;
export type ServerEnvelope = z.infer<typeof ServerEnvelopeSchema>;
export type PlayerSessionClaims = z.infer<typeof PlayerSessionClaimsSchema>;

export function actionIdentityKey(senderId: string, actionId: string): string {
  return `${senderId}\u001f${actionId}`;
}

export const DEFAULT_RUNTIME_CAPABILITIES = {
  synchronized_rooms: true,
  realtime_rooms: true,
  public_room_browser: true,
  realtime_webrtc: true,
  realtimeProtocolVersion: REALTIME_PROTOCOL_VERSION,
  minimumProtocolVersion: PROTOCOL_VERSION,
  limits: {
    maxPlayersPerRoom: 16,
    maxMessageBytes: 16_384,
    maxChatBytes: 500,
    messagesPerSecond: 20,
    ...DEFAULT_REALTIME_LIMITS,
  },
} as const;

export const MembershipStatusSchema = z.enum(["synchronizing", "ready"]);
export type MembershipStatus = z.infer<typeof MembershipStatusSchema>;

export function snapshotMembersAreComplete(input: {
  members?: unknown;
  membersComplete?: boolean;
}): boolean {
  if (input.membersComplete === true) return true;
  if (input.membersComplete === false) return false;
  return Array.isArray(input.members) && input.members.length > 0;
}

export function quantize(value: number, scale: number): number {
  if (!Number.isFinite(value)) {
    throw new Error("quantize requires a finite value");
  }
  if (!Number.isSafeInteger(scale) || scale <= 0) {
    throw new Error("quantize requires a positive safe-integer scale");
  }
  const quantized = Math.round(value * scale);
  if (!Number.isSafeInteger(quantized)) {
    throw new Error("quantized value is not a finite safe integer");
  }
  return quantized;
}

export function dequantize(value: number, scale: number): number {
  if (!Number.isSafeInteger(value)) {
    throw new Error("dequantize requires a finite safe integer");
  }
  if (!Number.isSafeInteger(scale) || scale <= 0) {
    throw new Error("dequantize requires a positive safe-integer scale");
  }
  return value / scale;
}

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value) || !Number.isSafeInteger(value)) {
      throw new Error("protocol numbers must be finite safe integers");
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (typeof value === "object") {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`)
      .join(",")}}`;
  }
  throw new Error("value is not JSON-compatible");
}

export function stateHash(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

export * from "./hosted-sdk.js";
