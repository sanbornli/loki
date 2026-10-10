import type { ProjectState } from "../../../packages/protocol/src/index.js";
import { isMasterTestAccount } from "./master-account.js";

export const PLAN_IDS = ["free", "loki", "pro"] as const;
export type PlanId = (typeof PLAN_IDS)[number];

export const PLAN_STATUSES = ["active", "past_due", "canceled"] as const;
export type PlanStatus = (typeof PLAN_STATUSES)[number];

export const PRICE_KEYS = [
  "loki_monthly",
  "loki_annual",
  "pro_monthly",
  "pro_annual",
] as const;
export type PriceKey = (typeof PRICE_KEYS)[number];

export interface PlanLimits {
  /** Stored projects, including inactive ones. */
  games: number | null;
  /** Playable projects. Inactive projects do not count. */
  playLinks: number | null;
  /** Retained build bytes across the account. Null means no cap. */
  storedBytes: number | null;
  simultaneousRooms: number | null;
  maxPlayersPerRoom: number;
  serverAuthority: boolean;
  publicCatalog: boolean;
}

/**
 * Nakama accepts concurrentRoomQuota only through 100. Loki and Loki Pro
 * have no product room cap, so they use that runtime ceiling.
 */
export const NAKAMA_ROOM_QUOTA_CAP = 100;

export const PLAYABLE_PROJECT_STATES = ["private", "unlisted", "published"] as const;

/** Releases kept for each game. The active release is kept even when it is older. */
export const KEPT_RELEASES = 3;

const MIB = 1024 * 1024;
const GIB = 1024 * 1024 * 1024;

export const PLANS: Record<PlanId, PlanLimits> = {
  free: {
    games: 2,
    playLinks: 1,
    storedBytes: 100 * MIB,
    simultaneousRooms: 2,
    maxPlayersPerRoom: 4,
    serverAuthority: false,
    publicCatalog: false,
  },
  loki: {
    games: 20,
    playLinks: 20,
    storedBytes: 500 * MIB,
    simultaneousRooms: null,
    maxPlayersPerRoom: 8,
    serverAuthority: true,
    publicCatalog: true,
  },
  pro: {
    games: null,
    playLinks: null,
    storedBytes: 2 * GIB,
    simultaneousRooms: null,
    maxPlayersPerRoom: 16,
    serverAuthority: true,
    publicCatalog: true,
  },
};

/** Creator-facing state changes. Suspension stays an operator action. */
export const PROJECT_TRANSITIONS: Record<ProjectState, readonly ProjectState[]> = {
  draft: ["private"],
  private: ["unlisted", "inactive", "review_requested"],
  unlisted: ["private", "inactive", "review_requested"],
  inactive: ["unlisted"],
  review_requested: ["private", "inactive"],
  published: ["unlisted", "inactive", "suspended"],
  suspended: ["private"],
};

export const INACTIVE_DEPLOY_MESSAGE =
  "This game is inactive. Reactivate it from the dashboard before deploying.";

export interface BillingRecord {
  plan: PlanId;
  status: PlanStatus;
  periodEnd?: string;
}

export function isPlanId(value: unknown): value is PlanId {
  return value === "free" || value === "loki" || value === "pro";
}

export function isPlanStatus(value: unknown): value is PlanStatus {
  return value === "active" || value === "past_due" || value === "canceled";
}

export function isPriceKey(value: unknown): value is PriceKey {
  return (
    value === "loki_monthly" ||
    value === "loki_annual" ||
    value === "pro_monthly" ||
    value === "pro_annual"
  );
}

export function effectivePlan(record: BillingRecord, now = Date.now()): PlanId {
  if (record.plan === "free" || record.status === "active") return record.plan;
  if (record.periodEnd && Date.parse(record.periodEnd) > now) return record.plan;
  return "free";
}

/** The master test account keeps Pro entitlements even when the stored plan is free. */
export function entitledPlan(
  email: string | undefined | null,
  record: BillingRecord,
  now = Date.now(),
): PlanId {
  if (isMasterTestAccount(email)) return "pro";
  return effectivePlan(record, now);
}

export function limitsFor(plan: PlanId): PlanLimits {
  return PLANS[plan];
}

export function roomQuotaForPlan(plan: PlanId): number {
  return PLANS[plan].simultaneousRooms ?? NAKAMA_ROOM_QUOTA_CAP;
}

/** The first deploy is public on every plan. Public here means the link is playable. */
export function activationState(_plan: PlanId): "unlisted" {
  return "unlisted";
}

export function storedGameLimitMessage(plan: PlanId): string {
  if (plan === "free") {
    return "Free allows 2 stored games. Delete a game before creating another.";
  }
  const cap = PLANS[plan].games;
  return cap === null
    ? "plan game limit reached"
    : `This plan allows ${cap} stored games. Delete a game before creating another.`;
}

export function activeGameLimitMessage(plan: PlanId, activeName?: string): string {
  const deactivate = activeName
    ? `Deactivate ${activeName} first.`
    : "Deactivate another game first.";
  if (plan === "free") return `Free allows 1 active game. ${deactivate}`;
  const cap = PLANS[plan].playLinks;
  return cap === null
    ? "plan play link limit reached"
    : `This plan allows ${cap} active games. ${deactivate}`;
}

export function formatByteCap(bytes: number): string {
  if (bytes % GIB === 0) return `${bytes / GIB} GiB`;
  if (bytes % MIB === 0) return `${bytes / MIB} MiB`;
  return `${bytes} bytes`;
}

export function storedBytesLimitMessage(plan: PlanId): string {
  const cap = PLANS[plan].storedBytes;
  const size = cap === null ? "unlimited" : formatByteCap(cap);
  if (plan === "free") return `Free allows ${size} of stored builds.`;
  return `This plan allows ${size} of stored builds.`;
}

export function consumesPlayLink(from: string, to: string): boolean {
  const playable = (state: string) =>
    (PLAYABLE_PROJECT_STATES as readonly string[]).includes(state);
  return playable(to) && !playable(from);
}

export function assertWithinCap(
  count: number,
  cap: number | null,
  message: string,
): void {
  if (cap !== null && count >= cap) throw new Error(message);
}

export function assertPublicCatalog(plan: PlanId): void {
  if (!PLANS[plan].publicCatalog) {
    throw new Error("public catalog requires Loki or Loki Pro");
  }
}

export function assertServerAuthority(plan: PlanId): void {
  if (!PLANS[plan].serverAuthority) {
    throw new Error("server authority requires Loki or Loki Pro");
  }
}

export function assertRoomSize(plan: PlanId, maxPlayers: number): void {
  const cap = PLANS[plan].maxPlayersPerRoom;
  if (maxPlayers > cap) {
    throw new Error(`this plan allows ${cap} players per room`);
  }
}

export function applyPlanToTenantConfig<
  T extends {
    maxPlayers: number;
    authority: "host" | "server";
    concurrentRoomQuota?: number;
  },
>(config: T, plan: PlanId): T {
  if (config.authority === "server") assertServerAuthority(plan);
  return {
    ...config,
    maxPlayers: Math.min(config.maxPlayers, PLANS[plan].maxPlayersPerRoom),
    concurrentRoomQuota: roomQuotaForPlan(plan),
  };
}
