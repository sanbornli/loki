import { createHash } from "node:crypto";
import { z } from "zod";

export const MAX_TICK_RATE = 30;

export const ProjectStateSchema = z.enum([
  "draft",
  "private",
  "unlisted",
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
        authority: z.literal("host"),
        maxPlayers: z.number().int().min(1).max(16),
        tickRate: z.number().int().min(1).max(MAX_TICK_RATE),
      })
      .optional(),
    networkAllowlist: z.array(z.string().url()).max(10).default([]),
  })
  .strict();

export const RoomConfigSchema = z
  .object({
    roomKey: z.string().regex(/^[a-z0-9-]{1,64}$/),
    visibility: z.enum(["private", "unlisted", "matchmaking"]),
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
  }),
]);

export const ServerEnvelopeSchema = z.discriminatedUnion("type", [
  z.object({
    ...EnvelopeBase,
    type: z.literal("snapshot"),
    hostId: z.string().uuid(),
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
    hostId: z.string().uuid(),
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
    records: z.array(
      z.object({
        playerId: z.string().min(1).max(128),
        score: z.number().int(),
        subscore: z.number().int(),
        rank: z.number().int().positive(),
      }),
    ),
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
} as const;

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
    type: z.literal("realtime_sync_request"),
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
    hostId: z.string().min(1).max(128),
    authorityEpoch: z.number().int().nonnegative(),
    roundSequence: z.number().int().nonnegative(),
    simulationTick: RealtimeTickSchema,
    runtimeSnapshotSequence: z.number().int().nonnegative(),
    processedInputCursors: z.record(z.string(), z.number().int().nonnegative()).default({}),
    hostSendTime: z.number().int().nonnegative(),
    serverTime: z.number().int().nonnegative(),
    state: z.unknown(),
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
  }),
]);

export type RealtimeDelivery = z.infer<typeof RealtimeDeliverySchema>;
export type RealtimeRetainedInput = z.infer<typeof RealtimeRetainedInputSchema>;
export type RealtimeClientEnvelope = z.infer<typeof RealtimeClientEnvelopeSchema>;
export type RealtimeServerEnvelope = z.infer<typeof RealtimeServerEnvelopeSchema>;

export const DEFAULT_REALTIME_LIMITS = {
  maxRealtimeSnapshotHz: MAX_TICK_RATE,
  maxRealtimeInputHz: 20,
  maxRealtimeInFlightSnapshots: 8,
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

export type ProjectState = z.infer<typeof ProjectStateSchema>;
export type GameManifest = z.infer<typeof GameManifestSchema>;
export type RoomConfig = z.infer<typeof RoomConfigSchema>;
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
