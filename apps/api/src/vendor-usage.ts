/**
 * Operator view of what each infrastructure vendor is charging us, plus an
 * allocation of that cost to games and creators.
 *
 * Every adapter fails soft: a missing token or a vendor outage marks that one
 * vendor as unavailable instead of failing the whole report. Prices are list
 * prices kept in {@link DEFAULT_VENDOR_RATES} and can be overridden with
 * LOKI_VENDOR_RATES_JSON, so the dollar figures are estimates until they are
 * reconciled with each vendor's invoice.
 */

export type VendorId = "railway" | "cloudflare" | "cloudflare-edge" | "supabase" | "nakama";

export interface VendorRates {
  railway: {
    fixedMonthlyUsd: number;
    cpuPerVcpuMinute: number;
    memoryPerGbMinute: number;
    networkPerGb: number;
  };
  cloudflare: {
    fixedMonthlyUsd: number;
    r2StoragePerGbMonth: number;
    r2FreeStorageGb: number;
    r2ClassAPerMillion: number;
    r2FreeClassA: number;
    r2ClassBPerMillion: number;
    r2FreeClassB: number;
    /** Proxied bandwidth. 0 because the standard Cloudflare plans include it. */
    cdnPerGb: number;
    /** Authoritative DNS queries. 0 because the standard plans include them. */
    dnsPerMillionQueries: number;
  };
  supabase: {
    /** Charged once per configured Supabase project. */
    fixedMonthlyUsdPerProject: number;
    includedDatabaseGb: number;
    databasePerGb: number;
    includedMonthlyActiveUsers: number;
    perMonthlyActiveUser: number;
    /** Uncached egress allowance. Defaults to the Pro plan; override for Free (5). */
    includedEgressGb: number;
    egressPerGb: number;
    includedCachedEgressGb: number;
    cachedEgressPerGb: number;
  };
}

export const DEFAULT_VENDOR_RATES: VendorRates = {
  railway: {
    fixedMonthlyUsd: 0,
    cpuPerVcpuMinute: 0.000463,
    memoryPerGbMinute: 0.000231,
    networkPerGb: 0.05,
  },
  cloudflare: {
    fixedMonthlyUsd: 0,
    r2StoragePerGbMonth: 0.015,
    r2FreeStorageGb: 10,
    r2ClassAPerMillion: 4.5,
    r2FreeClassA: 1_000_000,
    r2ClassBPerMillion: 0.36,
    r2FreeClassB: 10_000_000,
    cdnPerGb: 0,
    dnsPerMillionQueries: 0,
  },
  supabase: {
    fixedMonthlyUsdPerProject: 0,
    includedDatabaseGb: 8,
    databasePerGb: 0.125,
    includedMonthlyActiveUsers: 100_000,
    perMonthlyActiveUser: 0.00325,
    includedEgressGb: 250,
    egressPerGb: 0.09,
    includedCachedEgressGb: 250,
    cachedEgressPerGb: 0.03,
  },
};

export function mergeVendorRates(
  overrides: unknown,
  base: VendorRates = DEFAULT_VENDOR_RATES,
): VendorRates {
  const merged = structuredClone(base) as VendorRates;
  if (!overrides || typeof overrides !== "object") return merged;
  for (const vendor of Object.keys(merged) as (keyof VendorRates)[]) {
    const incoming = (overrides as Record<string, unknown>)[vendor];
    if (!incoming || typeof incoming !== "object") continue;
    const target = merged[vendor] as Record<string, number>;
    for (const key of Object.keys(target)) {
      const value = (incoming as Record<string, unknown>)[key];
      if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
        target[key] = value;
      }
    }
  }
  return merged;
}

/** Subscription the account is on, separate from month-to-date usage. */
export interface ProviderPlan {
  id: "railway" | "cloudflare" | "supabase" | "nakama";
  provider: string;
  /** Plan name, or null when the vendor did not report one. */
  plan: string | null;
  /** Monthly subscription fee. Null when the fee is unknown. */
  monthlyUsd: number | null;
  message: string;
}

export interface VendorUsage {
  generatedAt: string;
  periodStart: string;
  periodEnd: string;
  vendors: VendorUsageReport[];
  /** One row per provider. Nakama has no subscription of its own. */
  plans: ProviderPlan[];
  /** Sum of the plan fees that were read. Missing fees are left out. */
  planTotalUsd: number;
  /** False when any plan fee could not be read. */
  plansComplete: boolean;
  /** Usage that is missing from the dollar totals. */
  gaps: string[];
}

export interface VendorUsageReport {
  vendor: VendorId;
  name: string;
  status: "ok" | "not_configured" | "error";
  /** Why the vendor is unavailable, or a note about how figures were derived. */
  message: string;
  /** Where the figures come from, shown so the operator knows how to verify. */
  source: string;
  lines: VendorUsageLine[];
  /** Month-to-date estimated cost. Null when the vendor could not be read. */
  costUsd: number | null;
  /** Per-service split, when the vendor reports one. */
  breakdown: { label: string; costUsd: number }[];
}

export interface VendorUsageLine {
  label: string;
  /** Null when the vendor cannot report this figure. */
  used: number | null;
  unit: string;
  /** Allowance included in the plan. Null when the vendor has no allowance. */
  included: number | null;
  costUsd: number | null;
}

export interface VendorQueryable {
  query<Row = Record<string, unknown>>(
    sql: string,
  ): Promise<{ rows: Row[] }>;
}

export interface VendorUsageConfig {
  railway?: { token: string; projectId: string };
  cloudflare?: {
    token: string;
    accountId: string;
    bucket: string;
    /** Zone id and name (lokiplay.cc). Required for proxied traffic and DNS. */
    zoneId?: string;
    zoneName?: string;
  };
  /**
   * Account token used only to read the organization plan. The Management API
   * does not return egress bytes, so this does not load egress.
   */
  supabaseUsage?: {
    token: string;
    sources: { orgSlug: string; projectRef?: string; label: string }[];
  };
  nakama?: { origin: string; username: string; password: string };
  /** Platform database; also read for auth sign-in counts. */
  platformDatabase?: VendorQueryable;
  /** Nakama's own database, used for its size. */
  nakamaDatabase?: VendorQueryable;
  rates?: VendorRates;
  fetch?: typeof fetch;
  now?: () => Date;
}

const GB = 1024 ** 3;
const roundCents = (value: number): number => Math.round(value * 100) / 100;
const roundTo = (value: number, places: number): number => {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
};
const REQUEST_TIMEOUT_MS = 10_000;

const describe = (error: unknown): string =>
  error instanceof Error ? error.message : "request failed";

const notConfigured = (
  vendor: VendorId,
  name: string,
  source: string,
  message: string,
): VendorUsageReport => ({
  vendor,
  name,
  status: "not_configured",
  message,
  source,
  lines: [],
  costUsd: null,
  breakdown: [],
});

const failed = (
  vendor: VendorId,
  name: string,
  source: string,
  error: unknown,
): VendorUsageReport => ({
  vendor,
  name,
  status: "error",
  message: describe(error),
  source,
  lines: [],
  costUsd: null,
  breakdown: [],
});

/* ------------------------------ Railway ------------------------------ */

const RAILWAY_ENDPOINT = "https://backboard.railway.com/graphql/v2";
const RAILWAY_USER_AGENT = "loki-operator";

/** Published subscription fees. The fee is a credit against usage, not an extra charge. */
const RAILWAY_PLANS: Record<string, { label: string; monthlyUsd: number; includedUsageUsd: number }> = {
  FREE: { label: "Free", monthlyUsd: 0, includedUsageUsd: 1 },
  HOBBY: { label: "Hobby", monthlyUsd: 5, includedUsageUsd: 5 },
  PRO: { label: "Pro", monthlyUsd: 20, includedUsageUsd: 20 },
};

export function railwayPlanFee(plan: string): number | null {
  return RAILWAY_PLANS[plan]?.monthlyUsd ?? null;
}

export interface RailwayUsageRow {
  measurement: string;
  value: number;
  serviceId?: string;
}

export function railwayCost(
  rows: RailwayUsageRow[],
  names: Map<string, string>,
  rates: VendorRates["railway"],
): { total: number; byService: Map<string, number>; totals: Record<string, number> } {
  const byService = new Map<string, number>();
  const totals: Record<string, number> = {
    CPU_USAGE: 0,
    MEMORY_USAGE_GB: 0,
    NETWORK_TX_GB: 0,
  };
  let total = 0;
  for (const row of rows) {
    const rate =
      row.measurement === "CPU_USAGE"
        ? rates.cpuPerVcpuMinute
        : row.measurement === "MEMORY_USAGE_GB"
          ? rates.memoryPerGbMinute
          : row.measurement === "NETWORK_TX_GB"
            ? rates.networkPerGb
            : undefined;
    if (rate === undefined || !Number.isFinite(row.value)) continue;
    const cost = row.value * rate;
    totals[row.measurement] = (totals[row.measurement] ?? 0) + row.value;
    total += cost;
    const name = (row.serviceId && names.get(row.serviceId)) || "Other services";
    byService.set(name, (byService.get(name) ?? 0) + cost);
  }
  return { total: total + rates.fixedMonthlyUsd, byService, totals };
}

async function railwayReport(
  config: NonNullable<VendorUsageConfig["railway"]>,
  rates: VendorRates["railway"],
  start: Date,
  end: Date,
  fetchImpl: typeof fetch,
): Promise<VendorUsageReport> {
  const source = "Railway GraphQL API (usage, month to date)";
  const response = await fetchImpl(RAILWAY_ENDPOINT, {
    method: "POST",
    headers: {
      authorization: `Bearer ${config.token}`,
      "content-type": "application/json",
      "user-agent": RAILWAY_USER_AGENT,
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    body: JSON.stringify({
      query: `query Usage($projectId: String!, $start: DateTime!, $end: DateTime!) {
        usage(
          projectId: $projectId
          startDate: $start
          endDate: $end
          measurements: [CPU_USAGE, MEMORY_USAGE_GB, NETWORK_TX_GB]
          groupBy: [SERVICE_ID]
        ) { measurement value tags { serviceId } }
        project(id: $projectId) {
          services { edges { node { id name } } }
        }
      }`,
      variables: {
        projectId: config.projectId,
        start: start.toISOString(),
        end: end.toISOString(),
      },
    }),
  });
  if (!response.ok) throw new Error(`Railway returned HTTP ${response.status}`);
  const body = (await response.json()) as {
    data?: {
      usage?: {
        measurement: string;
        value: number;
        tags?: { serviceId?: string | null };
      }[];
      project?: { services?: { edges?: { node: { id: string; name: string } }[] } };
    };
    errors?: { message?: string }[];
  };
  if (body.errors?.length) {
    throw new Error(body.errors[0]?.message ?? "Railway rejected the query");
  }
  const names = new Map<string, string>();
  for (const edge of body.data?.project?.services?.edges ?? []) {
    names.set(edge.node.id, edge.node.name);
  }
  const rows: RailwayUsageRow[] = (body.data?.usage ?? []).map((row) => ({
    measurement: row.measurement,
    value: Number(row.value),
    serviceId: row.tags?.serviceId ?? undefined,
  }));
  const cost = railwayCost(rows, names, rates);
  return {
    vendor: "railway",
    name: "Railway",
    status: "ok",
    message:
      "Estimated from usage at list prices. Compare with Railway's usage page before relying on it.",
    source,
    lines: [
      {
        label: "CPU",
        used: roundTo((cost.totals.CPU_USAGE ?? 0) / 60, 2),
        unit: "vCPU-hours",
        included: null,
        costUsd: roundCents((cost.totals.CPU_USAGE ?? 0) * rates.cpuPerVcpuMinute),
      },
      {
        label: "Memory",
        used: roundTo((cost.totals.MEMORY_USAGE_GB ?? 0) / 60, 2),
        unit: "GB-hours",
        included: null,
        costUsd: roundCents((cost.totals.MEMORY_USAGE_GB ?? 0) * rates.memoryPerGbMinute),
      },
      {
        label: "Network egress",
        used: roundTo(cost.totals.NETWORK_TX_GB ?? 0, 3),
        unit: "GB",
        included: null,
        costUsd: roundCents((cost.totals.NETWORK_TX_GB ?? 0) * rates.networkPerGb),
      },
    ],
    costUsd: roundCents(cost.total),
    breakdown: [...cost.byService.entries()]
      .map(([label, costUsd]) => ({ label, costUsd: roundCents(costUsd) }))
      .sort((a, b) => b.costUsd - a.costUsd),
  };
}

/* ----------------------------- Cloudflare ---------------------------- */

const CLOUDFLARE_GRAPHQL = "https://api.cloudflare.com/client/v4/graphql";

/** R2 bills by operation class. Deletes and aborts are free. */
export function r2OperationClass(action: string): "A" | "B" | "free" {
  if (/^(Delete|Abort)/i.test(action)) return "free";
  if (/^(Get|Head|UsageSummary)/i.test(action)) return "B";
  return "A";
}

export function r2Cost(
  storageBytes: number,
  classA: number,
  classB: number,
  rates: VendorRates["cloudflare"],
): { storage: number; classA: number; classB: number; total: number } {
  const storage =
    Math.max(0, storageBytes / GB - rates.r2FreeStorageGb) * rates.r2StoragePerGbMonth;
  const a = (Math.max(0, classA - rates.r2FreeClassA) / 1_000_000) * rates.r2ClassAPerMillion;
  const b = (Math.max(0, classB - rates.r2FreeClassB) / 1_000_000) * rates.r2ClassBPerMillion;
  return { storage, classA: a, classB: b, total: storage + a + b + rates.fixedMonthlyUsd };
}

async function cloudflareReport(
  config: NonNullable<VendorUsageConfig["cloudflare"]>,
  rates: VendorRates["cloudflare"],
  start: Date,
  end: Date,
  fetchImpl: typeof fetch,
): Promise<VendorUsageReport> {
  const source = "Cloudflare GraphQL Analytics API (R2 storage and operations)";
  const response = await fetchImpl(CLOUDFLARE_GRAPHQL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${config.token}`,
      "content-type": "application/json",
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    body: JSON.stringify({
      query: `query R2($accountTag: String!, $bucket: String!, $start: Time!, $end: Time!) {
        viewer {
          accounts(filter: { accountTag: $accountTag }) {
            storage: r2StorageAdaptiveGroups(
              limit: 1
              filter: { bucketName: $bucket, datetime_geq: $start, datetime_leq: $end }
              orderBy: [datetime_DESC]
            ) { max { payloadSize metadataSize objectCount } }
            operations: r2OperationsAdaptiveGroups(
              limit: 1000
              filter: { bucketName: $bucket, datetime_geq: $start, datetime_leq: $end }
            ) { sum { requests } dimensions { actionType } }
          }
        }
      }`,
      variables: {
        accountTag: config.accountId,
        bucket: config.bucket,
        start: start.toISOString(),
        end: end.toISOString(),
      },
    }),
  });
  if (!response.ok) throw new Error(`Cloudflare returned HTTP ${response.status}`);
  const body = (await response.json()) as {
    data?: {
      viewer?: {
        accounts?: {
          storage?: {
            max?: { payloadSize?: number; metadataSize?: number; objectCount?: number };
          }[];
          operations?: {
            sum?: { requests?: number };
            dimensions?: { actionType?: string };
          }[];
        }[];
      };
    };
    errors?: { message?: string }[];
  };
  if (body.errors?.length) {
    throw new Error(body.errors[0]?.message ?? "Cloudflare rejected the query");
  }
  const account = body.data?.viewer?.accounts?.[0];
  if (!account) throw new Error("Cloudflare returned no data for this account");
  const stored = account.storage?.[0]?.max;
  const storageBytes = Number(stored?.payloadSize ?? 0) + Number(stored?.metadataSize ?? 0);
  let classA = 0;
  let classB = 0;
  for (const row of account.operations ?? []) {
    const requests = Number(row.sum?.requests ?? 0);
    const kind = r2OperationClass(row.dimensions?.actionType ?? "");
    if (kind === "A") classA += requests;
    else if (kind === "B") classB += requests;
  }
  const cost = r2Cost(storageBytes, classA, classB, rates);
  return {
    vendor: "cloudflare",
    name: "Cloudflare R2",
    status: "ok",
    message: "Stored objects and operations for the game bucket, estimated at list prices.",
    source,
    lines: [
      {
        label: "Stored data",
        used: roundTo(storageBytes / GB, 3),
        unit: "GB",
        included: rates.r2FreeStorageGb,
        costUsd: roundCents(cost.storage),
      },
      {
        label: "Class A operations (writes, lists)",
        used: classA,
        unit: "requests",
        included: rates.r2FreeClassA,
        costUsd: roundCents(cost.classA),
      },
      {
        label: "Class B operations (reads)",
        used: classB,
        unit: "requests",
        included: rates.r2FreeClassB,
        costUsd: roundCents(cost.classB),
      },
    ],
    costUsd: roundCents(cost.total),
    breakdown: [],
  };
}

/** Which proxied hostname a request belongs to. The zone apex is Pages, so it is not queried. */
export type EdgeHostGroup = "play" | "api" | "games";

export function edgeHostGroup(host: string, zone: string): EdgeHostGroup {
  const name = host.toLowerCase().replace(/\.$/, "");
  const root = zone.toLowerCase().replace(/^\./, "");
  if (name === `play.${root}`) return "play";
  if (name === `api.${root}`) return "api";
  return "games";
}

/**
 * Adaptive groups are sampled. `count` is the sample, and `sampleInterval`
 * is how many real requests each sample stands for. Bytes in `sum` are
 * already scaled by Cloudflare.
 */
export function estimatedRequestCount(count: number, sampleInterval?: number): number {
  const interval =
    typeof sampleInterval === "number" && sampleInterval > 0 ? sampleInterval : 1;
  return count * interval;
}

/** Zone DNS analytics on the free plan accepts at most 30 days. */
export function dnsQueryWindow(
  start: Date,
  end: Date,
  maxDays = 30,
): { start: string; end: string; clamped: boolean } {
  const maxMs = maxDays * 24 * 60 * 60 * 1000;
  const from = end.getTime() - start.getTime() > maxMs ? new Date(end.getTime() - maxMs) : start;
  const day = (date: Date): string => date.toISOString().slice(0, 10);
  return { start: day(from), end: day(end), clamped: from.getTime() !== start.getTime() };
}

export function edgeBandwidthCost(bytes: number, perGb: number): number {
  return (bytes / GB) * perGb;
}

export function dnsQueryCost(queries: number, perMillion: number): number {
  return (queries / 1_000_000) * perMillion;
}

interface EdgeTraffic {
  bytes: number;
  requests: number;
}

async function cloudflareEdgeReport(
  config: NonNullable<VendorUsageConfig["cloudflare"]>,
  rates: VendorRates["cloudflare"],
  start: Date,
  end: Date,
  fetchImpl: typeof fetch,
): Promise<VendorUsageReport> {
  const source = "Cloudflare GraphQL Analytics API (proxied HTTP and DNS)";
  if (!config.zoneId || !config.zoneName) {
    return notConfigured(
      "cloudflare-edge",
      "Cloudflare edge",
      source,
      "Set LOKI_CLOUDFLARE_ZONE_ID. The token also needs Zone Analytics: Read.",
    );
  }
  const dns = dnsQueryWindow(start, end);
  const response = await fetchImpl(CLOUDFLARE_GRAPHQL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${config.token}`,
      "content-type": "application/json",
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    body: JSON.stringify({
      query: `query Edge($zoneTag: String!, $start: Time!, $end: Time!, $hostLike: String!, $dnsStart: String!, $dnsEnd: String!) {
        viewer {
          zones(filter: { zoneTag: $zoneTag }) {
            httpRequestsAdaptiveGroups(
              limit: 1000
              filter: {
                datetime_geq: $start
                datetime_leq: $end
                requestSource: "eyeball"
                clientRequestHTTPHost_like: $hostLike
              }
            ) {
              count
              avg { sampleInterval }
              sum { edgeResponseBytes }
              dimensions { clientRequestHTTPHost }
            }
            dnsAnalyticsAdaptiveGroups(
              limit: 1
              filter: { date_geq: $dnsStart, date_leq: $dnsEnd }
            ) { count }
          }
        }
      }`,
      variables: {
        zoneTag: config.zoneId,
        start: start.toISOString(),
        end: end.toISOString(),
        hostLike: `%.${config.zoneName.replace(/^\./, "")}`,
        dnsStart: dns.start,
        dnsEnd: dns.end,
      },
    }),
  });
  if (!response.ok) throw new Error(`Cloudflare returned HTTP ${response.status}`);
  const body = (await response.json()) as {
    data?: {
      viewer?: {
        zones?: {
          httpRequestsAdaptiveGroups?: {
            count?: number;
            avg?: { sampleInterval?: number };
            sum?: { edgeResponseBytes?: number };
            dimensions?: { clientRequestHTTPHost?: string };
          }[];
          dnsAnalyticsAdaptiveGroups?: { count?: number }[];
        }[];
      };
    };
    errors?: { message?: string }[];
  };
  if (body.errors?.length) {
    throw new Error(body.errors[0]?.message ?? "Cloudflare rejected the query");
  }
  const zone = body.data?.viewer?.zones?.[0];
  if (!zone) throw new Error("Cloudflare returned no data for this zone");
  const traffic = new Map<EdgeHostGroup, EdgeTraffic>([
    ["play", { bytes: 0, requests: 0 }],
    ["api", { bytes: 0, requests: 0 }],
    ["games", { bytes: 0, requests: 0 }],
  ]);
  for (const row of zone.httpRequestsAdaptiveGroups ?? []) {
    const group = edgeHostGroup(row.dimensions?.clientRequestHTTPHost ?? "", config.zoneName);
    const entry = traffic.get(group)!;
    entry.bytes += Number(row.sum?.edgeResponseBytes ?? 0);
    entry.requests += estimatedRequestCount(Number(row.count ?? 0), row.avg?.sampleInterval);
  }
  const queries = (zone.dnsAnalyticsAdaptiveGroups ?? []).reduce(
    (sum, row) => sum + Number(row.count ?? 0),
    0,
  );
  const labels: Record<EdgeHostGroup, string> = {
    play: "Play",
    api: "API",
    games: "Game origins",
  };
  const lines: VendorUsageLine[] = [];
  let total = 0;
  for (const group of ["play", "games", "api"] as const) {
    const entry = traffic.get(group)!;
    const bandwidthCost = edgeBandwidthCost(entry.bytes, rates.cdnPerGb);
    total += bandwidthCost;
    lines.push(
      {
        label: `${labels[group]} bandwidth`,
        used: roundTo(entry.bytes / GB, 3),
        unit: "GB",
        included: null,
        costUsd: roundCents(bandwidthCost),
      },
      {
        label: `${labels[group]} requests`,
        used: Math.round(entry.requests),
        unit: "requests",
        included: null,
        costUsd: null,
      },
    );
  }
  const queryCost = dnsQueryCost(queries, rates.dnsPerMillionQueries);
  total += queryCost;
  lines.push({
    label: "DNS queries",
    used: queries,
    unit: "queries",
    included: null,
    costUsd: roundCents(queryCost),
  });
  return {
    vendor: "cloudflare-edge",
    name: "Cloudflare edge",
    status: "ok",
    message:
      `Proxied traffic for *.${config.zoneName.replace(/^\./, "")}, which is play, the API, and each game. The marketing site is not included. Bandwidth and DNS are included on the standard Cloudflare plans, so their price is $0 until cdnPerGb or dnsPerMillionQueries is set.${dns.clamped ? " DNS covers the last 30 days, which is as far back as the plan allows." : ""}`,
    source,
    lines,
    costUsd: roundCents(total),
    breakdown: [],
  };
}

/* ------------------------------ Supabase ----------------------------- */

export function sumDailyEgress(
  usages: { metric?: string; usage?: number }[],
): { egressBytes: number; cachedBytes: number } {
  let egressBytes = 0;
  let cachedBytes = 0;
  for (const row of usages) {
    const usage = Number(row.usage ?? 0);
    if (!Number.isFinite(usage) || usage < 0) continue;
    if (row.metric === "EGRESS") egressBytes += usage;
    else if (row.metric === "CACHED_EGRESS") cachedBytes += usage;
  }
  return { egressBytes, cachedBytes };
}

/** Bytes above the included gigabytes, priced per gigabyte. */
export function egressOverageCost(bytes: number, includedGb: number, perGb: number): number {
  return Math.max(0, bytes / GB - includedGb) * perGb;
}

export function supabaseCost(
  databaseBytes: number[],
  monthlyActiveUsers: number | undefined,
  rates: VendorRates["supabase"],
): { database: number; users: number; total: number } {
  const database = databaseBytes.reduce(
    (sum, bytes) =>
      sum + Math.max(0, bytes / GB - rates.includedDatabaseGb) * rates.databasePerGb,
    0,
  );
  const users =
    Math.max(0, (monthlyActiveUsers ?? 0) - rates.includedMonthlyActiveUsers) *
    rates.perMonthlyActiveUser;
  return {
    database,
    users,
    total: database + users + rates.fixedMonthlyUsdPerProject * databaseBytes.length,
  };
}

async function supabaseReport(
  config: VendorUsageConfig,
  rates: VendorRates["supabase"],
): Promise<VendorUsageReport> {
  const source = "Supabase databases (pg_database_size and auth.users, queried directly)";
  const platform = config.platformDatabase;
  if (!platform) {
    return notConfigured("supabase", "Supabase", source, "No platform database is connected.");
  }
  const size = async (database: VendorQueryable): Promise<number> => {
    const result = await database.query<{ bytes: string | number }>(
      "SELECT pg_database_size(current_database())::bigint AS bytes",
    );
    return Number(result.rows[0]?.bytes ?? 0);
  };
  const platformBytes = await size(platform);
  let nakamaBytes: number | undefined;
  let nakamaNote = "";
  if (config.nakamaDatabase) {
    try {
      nakamaBytes = await size(config.nakamaDatabase);
    } catch (error) {
      nakamaNote = ` Nakama database unreadable: ${describe(error)}.`;
    }
  }
  let monthlyActiveUsers: number | undefined;
  try {
    const result = await platform.query<{ count: string | number }>(
      "SELECT COUNT(*)::bigint AS count FROM auth.users WHERE last_sign_in_at > now() - interval '30 days'",
    );
    monthlyActiveUsers = Number(result.rows[0]?.count ?? 0);
  } catch {
    monthlyActiveUsers = undefined;
  }
  const databases = [platformBytes, ...(nakamaBytes === undefined ? [] : [nakamaBytes])];
  const cost = supabaseCost(databases, monthlyActiveUsers, rates);
  const lines: VendorUsageLine[] = [
    {
      label: "Platform database",
      used: roundTo(platformBytes / GB, 3),
      unit: "GB",
      included: rates.includedDatabaseGb,
      costUsd: roundCents(
        Math.max(0, platformBytes / GB - rates.includedDatabaseGb) * rates.databasePerGb,
      ),
    },
  ];
  if (nakamaBytes !== undefined) {
    lines.push({
      label: "Nakama database",
      used: roundTo(nakamaBytes / GB, 3),
      unit: "GB",
      included: rates.includedDatabaseGb,
      costUsd: roundCents(
        Math.max(0, nakamaBytes / GB - rates.includedDatabaseGb) * rates.databasePerGb,
      ),
    });
  }
  if (monthlyActiveUsers !== undefined) {
    lines.push({
      label: "Active users (signed in, last 30 days)",
      used: monthlyActiveUsers,
      unit: "users",
      included: rates.includedMonthlyActiveUsers,
      costUsd: roundCents(cost.users),
    });
  }
  lines.push({
    label: "Egress",
    used: null,
    unit: "GB",
    included: null,
    costUsd: null,
  });
  return {
    vendor: "supabase",
    name: "Supabase",
    status: "ok",
    message:
      `Database size and sign-ins are read from the databases.${nakamaNote} ${SUPABASE_EGRESS_NOTE}`.trim(),
    source,
    lines,
    costUsd: roundCents(cost.total),
    breakdown: [],
  };
}

/**
 * The dashboard usage route rejects an account token. The Management API
 * has no egress-byte endpoint yet. When it does, read those bytes here
 * with a token that has analytics read, and price them with
 * {@link sumDailyEgress} and {@link egressOverageCost}.
 */
const SUPABASE_EGRESS_NOTE =
  "Egress bytes are not available from an account token. The Management API does not return them yet.";

const SUPABASE_API = "https://api.supabase.com";

/** Organization subscription. Compute for each project is billed on top. */
const SUPABASE_PLANS: Record<string, { label: string; monthlyUsd: number | null }> = {
  free: { label: "Free", monthlyUsd: 0 },
  pro: { label: "Pro", monthlyUsd: 25 },
  team: { label: "Team", monthlyUsd: 599 },
  enterprise: { label: "Enterprise", monthlyUsd: null },
};

export function supabasePlanMonthlyUsd(plan: string): number | null {
  const known = SUPABASE_PLANS[plan.trim().toLowerCase()];
  return known ? known.monthlyUsd : null;
}

/* ------------------------------- Nakama ------------------------------ */

async function nakamaReport(
  config: NonNullable<VendorUsageConfig["nakama"]>,
  fetchImpl: typeof fetch,
): Promise<VendorUsageReport> {
  const source = "Nakama console API (/v2/console/status)";
  const base = config.origin.replace(/\/$/, "");
  const login = await fetchImpl(`${base}/v2/console/authenticate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    body: JSON.stringify({ username: config.username, password: config.password }),
  });
  if (!login.ok) throw new Error(`Nakama console sign-in returned HTTP ${login.status}`);
  const { token } = (await login.json()) as { token?: string };
  if (!token) throw new Error("Nakama console returned no token");
  const response = await fetchImpl(`${base}/v2/console/status`, {
    headers: { authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Nakama status returned HTTP ${response.status}`);
  const body = (await response.json()) as {
    nodes?: {
      name?: string;
      session_count?: number;
      presence_count?: number;
      match_count?: number;
    }[];
  };
  const nodes = body.nodes ?? [];
  const sum = (key: "session_count" | "presence_count" | "match_count"): number =>
    nodes.reduce((total, node) => total + Number(node[key] ?? 0), 0);
  return {
    vendor: "nakama",
    name: "Nakama",
    status: "ok",
    message:
      "Live load right now. Nakama's cost is its Railway service plus its Supabase database, counted under those vendors.",
    source,
    lines: [
      { label: "Connected sessions", used: sum("session_count"), unit: "sessions", included: null, costUsd: null },
      { label: "Presences", used: sum("presence_count"), unit: "presences", included: null, costUsd: null },
      { label: "Active matches", used: sum("match_count"), unit: "matches", included: null, costUsd: null },
    ],
    costUsd: null,
    breakdown: [],
  };
}

/* ------------------------------- Plans ------------------------------- */

const unavailablePlan = (
  id: ProviderPlan["id"],
  provider: string,
  message: string,
): ProviderPlan => ({ id, provider, plan: null, monthlyUsd: null, message });

async function railwayProviderPlan(
  config: VendorUsageConfig["railway"],
  fetchImpl: typeof fetch,
): Promise<ProviderPlan> {
  if (!config) {
    return unavailablePlan(
      "railway",
      "Railway",
      "Set LOKI_RAILWAY_API_TOKEN and LOKI_RAILWAY_PROJECT_ID.",
    );
  }
  try {
    const response = await fetchImpl(RAILWAY_ENDPOINT, {
      method: "POST",
      headers: {
        authorization: `Bearer ${config.token}`,
        "content-type": "application/json",
        "user-agent": RAILWAY_USER_AGENT,
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      body: JSON.stringify({
        query: `query Plan($projectId: String!) {
          project(id: $projectId) {
            workspace { plan customer { currentUsage } }
          }
        }`,
        variables: { projectId: config.projectId },
      }),
    });
    if (!response.ok) throw new Error(`Railway returned HTTP ${response.status}`);
    const body = (await response.json()) as {
      data?: {
        project?: {
          workspace?: { plan?: string; customer?: { currentUsage?: number } };
        };
      };
      errors?: { message?: string }[];
    };
    if (body.errors?.length) {
      throw new Error(body.errors[0]?.message ?? "Railway rejected the plan query");
    }
    const workspace = body.data?.project?.workspace;
    const code = workspace?.plan ?? "";
    const known = RAILWAY_PLANS[code];
    const usage = workspace?.customer?.currentUsage;
    const usageNote =
      typeof usage === "number" && Number.isFinite(usage)
        ? ` Railway reports $${roundCents(usage).toFixed(2)} of usage this period.`
        : "";
    if (!known) {
      return {
        id: "railway",
        provider: "Railway",
        plan: code || null,
        monthlyUsd: null,
        message: `Railway returned ${code || "no plan"}, which has no published monthly fee.${usageNote}`,
      };
    }
    return {
      id: "railway",
      provider: "Railway",
      plan: known.label,
      monthlyUsd: known.monthlyUsd,
      message:
        `${known.label} is $${known.monthlyUsd} per month and includes $${known.includedUsageUsd} of usage. Railway charges the greater of that fee and usage, so the fee is not added to the usage estimate.${usageNote}`,
    };
  } catch (error) {
    return unavailablePlan("railway", "Railway", describe(error));
  }
}

async function cloudflareProviderPlan(
  config: VendorUsageConfig["cloudflare"],
  fetchImpl: typeof fetch,
): Promise<ProviderPlan> {
  if (!config?.token || !config.zoneId) {
    return unavailablePlan(
      "cloudflare",
      "Cloudflare",
      "Set LOKI_CLOUDFLARE_API_TOKEN and LOKI_CLOUDFLARE_ZONE_ID to read the zone plan.",
    );
  }
  try {
    const response = await fetchImpl(
      `https://api.cloudflare.com/client/v4/zones/${encodeURIComponent(config.zoneId)}`,
      {
        headers: { authorization: `Bearer ${config.token}`, accept: "application/json" },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      },
    );
    if (!response.ok) throw new Error(`Cloudflare returned HTTP ${response.status}`);
    const body = (await response.json()) as {
      result?: { plan?: { name?: string; price?: number; currency?: string } };
    };
    const plan = body.result?.plan;
    const name = typeof plan?.name === "string" ? plan.name.trim() : "";
    if (!name) throw new Error("Cloudflare returned no zone plan");
    const currency = (plan?.currency || "USD").toUpperCase();
    const price = plan?.price;
    if (typeof price !== "number" || !Number.isFinite(price) || price < 0 || currency !== "USD") {
      return {
        id: "cloudflare",
        provider: "Cloudflare",
        plan: name,
        monthlyUsd: null,
        message: `${name} has no USD monthly price in the zone response. R2 has no monthly subscription.`,
      };
    }
    return {
      id: "cloudflare",
      provider: "Cloudflare",
      plan: name,
      monthlyUsd: price,
      message: `${name} is $${price} per month for the zone. R2 has no monthly subscription; storage and operations are usage.`,
    };
  } catch (error) {
    return unavailablePlan("cloudflare", "Cloudflare", describe(error));
  }
}

async function supabaseProviderPlan(
  config: VendorUsageConfig,
  fetchImpl: typeof fetch,
): Promise<ProviderPlan> {
  const usage = config.supabaseUsage;
  if (!usage?.token || usage.sources.length === 0) {
    return unavailablePlan(
      "supabase",
      "Supabase",
      "The organization plan needs an account token (GET /v1/organizations/{slug}). That token still cannot read egress bytes.",
    );
  }
  const slugs = [...new Set(usage.sources.map((entry) => entry.orgSlug))];
  try {
    const plans = await Promise.all(
      slugs.map(async (slug) => {
        const response = await fetchImpl(
          `${SUPABASE_API}/v1/organizations/${encodeURIComponent(slug)}`,
          {
            headers: { authorization: `Bearer ${usage.token}`, accept: "application/json" },
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
          },
        );
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const body = (await response.json()) as { plan?: string };
        const code = typeof body.plan === "string" ? body.plan.trim().toLowerCase() : "";
        const known = SUPABASE_PLANS[code];
        if (!known) throw new Error(`unrecognized plan ${code || "response"}`);
        return known;
      }),
    );
    const monthlyUsd = plans.every((plan) => plan.monthlyUsd !== null)
      ? plans.reduce((sum, plan) => sum + (plan.monthlyUsd ?? 0), 0)
      : null;
    const label = [...new Set(plans.map((plan) => plan.label))].join(", ");
    const paid = plans.some((plan) => plan.label === "Pro" || plan.label === "Team");
    const message = monthlyUsd === null
      ? `${label} pricing is custom, so it is left out of the total.`
      : paid
        ? `${label} is $${monthlyUsd} per month for the organization. Compute for each project is billed on top and is not included.`
        : `${label} is $${monthlyUsd} per month.`;
    return { id: "supabase", provider: "Supabase", plan: label, monthlyUsd, message };
  } catch (error) {
    return unavailablePlan("supabase", "Supabase", describe(error));
  }
}

function nakamaProviderPlan(): ProviderPlan {
  return {
    id: "nakama",
    provider: "Nakama",
    plan: "No separate plan",
    monthlyUsd: 0,
    message:
      "Nakama has no subscription of its own. Its cost is the Railway service and the Supabase database.",
  };
}

/* ------------------------------ Service ------------------------------ */

const CACHE_MS = 5 * 60 * 1000;

export class VendorUsageService {
  #cache?: { at: number; value: VendorUsage };

  constructor(readonly config: VendorUsageConfig) {}

  async usage(refresh = false): Promise<VendorUsage> {
    const now = (this.config.now ?? (() => new Date()))();
    if (!refresh && this.#cache && now.getTime() - this.#cache.at < CACHE_MS) {
      return this.#cache.value;
    }
    const rates = this.config.rates ?? DEFAULT_VENDOR_RATES;
    const fetchImpl = this.config.fetch ?? fetch;
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const attempt = async (
      vendor: VendorId,
      name: string,
      source: string,
      configured: boolean,
      hint: string,
      run: () => Promise<VendorUsageReport>,
    ): Promise<VendorUsageReport> => {
      if (!configured) return notConfigured(vendor, name, source, hint);
      try {
        return await run();
      } catch (error) {
        return failed(vendor, name, source, error);
      }
    };
    const { railway, cloudflare, nakama } = this.config;
    const [vendors, plans] = await Promise.all([
      Promise.all([
      attempt(
        "railway",
        "Railway",
        "Railway GraphQL API",
        Boolean(railway),
        "Set LOKI_RAILWAY_API_TOKEN and LOKI_RAILWAY_PROJECT_ID on the API service.",
        () => railwayReport(railway!, rates.railway, start, now, fetchImpl),
      ),
      attempt(
        "cloudflare",
        "Cloudflare R2",
        "Cloudflare GraphQL Analytics API",
        Boolean(cloudflare),
        "Set LOKI_CLOUDFLARE_API_TOKEN (Account Analytics: Read) on the API service.",
        () => cloudflareReport(cloudflare!, rates.cloudflare, start, now, fetchImpl),
      ),
      attempt(
        "cloudflare-edge",
        "Cloudflare edge",
        "Cloudflare GraphQL Analytics API (proxied HTTP and DNS)",
        Boolean(cloudflare?.zoneId && cloudflare.zoneName),
        "Set LOKI_CLOUDFLARE_ZONE_ID. The token also needs Zone Analytics: Read.",
        () => cloudflareEdgeReport(cloudflare!, rates.cloudflare, start, now, fetchImpl),
      ),
      attempt(
        "supabase",
        "Supabase",
        "Supabase databases",
        Boolean(this.config.platformDatabase),
        "No platform database is connected.",
        () => supabaseReport(this.config, rates.supabase),
      ),
      attempt(
        "nakama",
        "Nakama",
        "Nakama console API",
        Boolean(nakama),
        "Set LOKI_NAKAMA_CONSOLE_ORIGIN, NAKAMA_CONSOLE_USERNAME and NAKAMA_CONSOLE_PASSWORD on the API service.",
        () => nakamaReport(nakama!, fetchImpl),
      ),
      ]),
      Promise.all([
        railwayProviderPlan(railway, fetchImpl),
        cloudflareProviderPlan(cloudflare, fetchImpl),
        supabaseProviderPlan(this.config, fetchImpl),
        Promise.resolve(nakamaProviderPlan()),
      ]),
    ]);
    const value: VendorUsage = {
      generatedAt: now.toISOString(),
      periodStart: start.toISOString(),
      periodEnd: now.toISOString(),
      vendors,
      plans,
      planTotalUsd: roundCents(plans.reduce((sum, plan) => sum + (plan.monthlyUsd ?? 0), 0)),
      plansComplete: plans.every((plan) => plan.monthlyUsd !== null),
      gaps: ["Supabase egress"],
    };
    this.#cache = { at: now.getTime(), value };
    return value;
  }
}

/* --------------------------- Cost analytics -------------------------- */

export interface CostProjectRow {
  projectId: string;
  name: string;
  organizationName: string;
  ownerId: string | null;
  ownerEmail: string | null;
  /** Total bytes ever uploaded. Releases are immutable, so they stay stored. */
  storedBytes: number;
  /** Player and guest sessions in the current 30-day window. */
  sessions: number;
}

export interface GameCost {
  projectId: string;
  name: string;
  organizationName: string;
  ownerEmail: string | null;
  storedBytes: number;
  sessions: number;
  storageCostUsd: number;
  runtimeCostUsd: number;
  costUsd: number;
}

export interface CreatorCost {
  accountId: string;
  email: string;
  games: number;
  storedBytes: number;
  sessions: number;
  costUsd: number;
}

export interface CostAnalytics {
  generatedAt: string;
  periodStart: string;
  /** False when a vendor could not be read, so totals are a floor. */
  complete: boolean;
  missingVendors: string[];
  totalCostUsd: number;
  storageCostUsd: number;
  runtimeCostUsd: number;
  /** Cost that could not be assigned to any game (nothing to weight by). */
  unallocatedUsd: number;
  totals: {
    games: number;
    creators: number;
    sessions: number;
    costPerGameUsd: number | null;
    costPerCreatorUsd: number | null;
    costPerSessionUsd: number | null;
  };
  games: GameCost[];
  creators: CreatorCost[];
  method: string;
}

const COST_METHOD =
  "Storage cost (Cloudflare R2) is shared by bytes uploaded. Runtime cost (Railway, Supabase, and Cloudflare proxied traffic and DNS) is shared by player and guest sessions in the current 30-day window. Creators are charged for the games they own. Figures are estimates.";

export function allocateCosts(
  usage: VendorUsage,
  projects: CostProjectRow[],
): CostAnalytics {
  const cost = (vendor: VendorId): number =>
    usage.vendors.find((report) => report.vendor === vendor)?.costUsd ?? 0;
  const storagePool = cost("cloudflare");
  const runtimePool = cost("railway") + cost("supabase") + cost("cloudflare-edge");
  const missingVendors = [
    ...usage.vendors
      .filter((report) => report.vendor !== "nakama" && report.status !== "ok")
      .map((report) => report.name),
    ...(usage.gaps ?? []),
  ];

  const totalBytes = projects.reduce((sum, row) => sum + row.storedBytes, 0);
  const totalSessions = projects.reduce((sum, row) => sum + row.sessions, 0);

  const games: GameCost[] = projects.map((row) => {
    const storageCostUsd = totalBytes > 0 ? (storagePool * row.storedBytes) / totalBytes : 0;
    const runtimeCostUsd = totalSessions > 0 ? (runtimePool * row.sessions) / totalSessions : 0;
    return {
      projectId: row.projectId,
      name: row.name,
      organizationName: row.organizationName,
      ownerEmail: row.ownerEmail,
      storedBytes: row.storedBytes,
      sessions: row.sessions,
      storageCostUsd: roundTo(storageCostUsd, 4),
      runtimeCostUsd: roundTo(runtimeCostUsd, 4),
      costUsd: roundTo(storageCostUsd + runtimeCostUsd, 4),
    };
  });
  games.sort((a, b) => b.costUsd - a.costUsd || a.name.localeCompare(b.name));

  const byCreator = new Map<string, CreatorCost>();
  for (const row of projects) {
    if (!row.ownerId) continue;
    const game = games.find((entry) => entry.projectId === row.projectId)!;
    const entry =
      byCreator.get(row.ownerId) ??
      {
        accountId: row.ownerId,
        email: row.ownerEmail ?? row.ownerId,
        games: 0,
        storedBytes: 0,
        sessions: 0,
        costUsd: 0,
      };
    entry.games += 1;
    entry.storedBytes += row.storedBytes;
    entry.sessions += row.sessions;
    entry.costUsd += game.costUsd;
    byCreator.set(row.ownerId, entry);
  }
  const creators = [...byCreator.values()]
    .map((entry) => ({ ...entry, costUsd: roundTo(entry.costUsd, 4) }))
    .sort((a, b) => b.costUsd - a.costUsd || a.email.localeCompare(b.email));

  const allocated = games.reduce((sum, game) => sum + game.costUsd, 0);
  const total = storagePool + runtimePool;
  return {
    generatedAt: usage.generatedAt,
    periodStart: usage.periodStart,
    complete: missingVendors.length === 0,
    missingVendors,
    totalCostUsd: roundCents(total),
    storageCostUsd: roundCents(storagePool),
    runtimeCostUsd: roundCents(runtimePool),
    unallocatedUsd: roundCents(Math.max(0, total - allocated)),
    totals: {
      games: projects.length,
      creators: creators.length,
      sessions: totalSessions,
      costPerGameUsd: projects.length ? roundTo(total / projects.length, 4) : null,
      costPerCreatorUsd: creators.length ? roundTo(total / creators.length, 4) : null,
      costPerSessionUsd: totalSessions ? roundTo(runtimePool / totalSessions, 6) : null,
    },
    games,
    creators,
    method: COST_METHOD,
  };
}

export interface VendorCostOperations {
  vendorUsage(actorId: string, refresh?: boolean): Promise<VendorUsage>;
  costAnalytics(actorId: string): Promise<CostAnalytics>;
}
