import { createHash } from "node:crypto";
import { z } from "zod";

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
        tickRate: z.number().int().min(1).max(10),
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
    tickRate: z.number().int().min(1).max(10),
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
]);

export const ProtocolHelloSchema = z
  .object({
    protocolVersion: z.literal(PROTOCOL_VERSION),
    minimumProtocolVersion: z.literal(PROTOCOL_VERSION),
    capabilities: z.array(CapabilitySchema),
    limits: z.object({
      maxPlayersPerRoom: z.number().int().min(1).max(16),
      maxMessageBytes: z.number().int().positive(),
      maxChatBytes: z.number().int().positive(),
      messagesPerSecond: z.number().int().positive(),
    }),
  })
  .strict();

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
    state: z.unknown(),
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
  }),
  z.object({
    ...EnvelopeBase,
    type: z.literal("state"),
    hostId: z.string().uuid(),
    state: z.unknown(),
  }),
  z.object({
    ...EnvelopeBase,
    type: z.literal("action"),
    senderId: z.string().min(1).max(128),
    payload: z.unknown(),
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
  }),
]);

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
export type ProtocolHello = z.infer<typeof ProtocolHelloSchema>;
export type Presence = z.infer<typeof PresenceSchema>;
export type ClientEnvelope = z.infer<typeof ClientEnvelopeSchema>;
export type ServerEnvelope = z.infer<typeof ServerEnvelopeSchema>;
export type PlayerSessionClaims = z.infer<typeof PlayerSessionClaimsSchema>;

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
