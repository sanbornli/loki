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
  games: number | null;
  playLinks: number | null;
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

export const PLANS: Record<PlanId, PlanLimits> = {
  free: {
    games: 1,
    playLinks: 1,
    simultaneousRooms: 2,
    maxPlayersPerRoom: 4,
    serverAuthority: false,
    publicCatalog: false,
  },
  loki: {
    games: 20,
    playLinks: 20,
    simultaneousRooms: null,
    maxPlayersPerRoom: 8,
    serverAuthority: true,
    publicCatalog: true,
  },
  pro: {
    games: null,
    playLinks: null,
    simultaneousRooms: null,
    maxPlayersPerRoom: 16,
    serverAuthority: true,
    publicCatalog: true,
  },
};

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

export function activationState(plan: PlanId): "private" | "unlisted" {
  return PLANS[plan].publicCatalog ? "unlisted" : "private";
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
