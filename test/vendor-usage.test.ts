import assert from "node:assert/strict";
import test from "node:test";
import type { Pool } from "pg";
import { DashboardService } from "../apps/api/src/dashboard.js";
import {
  PlayInviteSigner,
  PostgresHostingAuthorization,
} from "../apps/api/src/hosting-auth.js";
import {
  DEFAULT_VENDOR_RATES,
  VendorUsageService,
  allocateCosts,
  dnsQueryWindow,
  edgeHostGroup,
  egressOverageCost,
  estimatedRequestCount,
  mergeVendorRates,
  r2Cost,
  r2OperationClass,
  railwayCost,
  railwayPlanFee,
  sumDailyEgress,
  supabaseCost,
  supabasePlanMonthlyUsd,
  type VendorQueryable,
  type VendorUsage,
  type VendorUsageReport,
} from "../apps/api/src/vendor-usage.js";
import { renderOperatorPage } from "../apps/web/src/operator-page.js";

const GB = 1024 ** 3;
const adminId = "11111111-1111-4111-8111-111111111111";
const projectId = "22222222-2222-4222-8222-222222222222";
const orgId = "33333333-3333-4333-8333-333333333333";

type Query = { sql: string; params: unknown[] };

function fakePool(respond: (sql: string, params: unknown[]) => unknown[]) {
  const queries: Query[] = [];
  const pool = {
    async query(sql: string, params: unknown[] = []) {
      queries.push({ sql, params });
      const rows = respond(sql, params);
      return { rows, rowCount: rows.length };
    },
  } as unknown as Pool;
  return { pool, queries };
}

const close = (actual: number, expected: number, message?: string) =>
  assert.ok(Math.abs(actual - expected) < 1e-6, message ?? `${actual} !== ${expected}`);

/* ------------------------- operator play invite ------------------------ */

function hostingWith(options: { admin: boolean; playable: boolean }) {
  const { pool, queries } = fakePool((sql) => {
    if (sql.includes("platform_role = 'admin'")) return options.admin ? [{ "?column?": 1 }] : [];
    if (sql.includes("FROM projects")) {
      return options.playable ? [{ organization_id: orgId, state: "private" }] : [];
    }
    return [];
  });
  const signer = new PlayInviteSigner(Buffer.alloc(32, 7));
  return { hosting: new PostgresHostingAuthorization(pool, signer), queries, signer };
}

test("an admin gets a short-lived invite to a private game and it is audited", async () => {
  const { hosting, queries, signer } = hostingWith({ admin: true, playable: true });
  const before = Math.floor(Date.now() / 1000);
  const invite = await hosting.createOperatorInvite(adminId, projectId);

  const payload = signer.verify(invite.token);
  assert.equal(payload.projectId, projectId);
  assert.ok(invite.expiresAt - before <= 15 * 60 + 2, "invite lasts at most 15 minutes");
  assert.ok(invite.expiresAt - before >= 14 * 60);

  const inserted = queries.find((query) => query.sql.includes("INSERT INTO play_invites"));
  assert.ok(inserted, "the invite is stored so it can be checked and revoked");
  assert.equal(inserted.params[1], projectId);
  assert.equal(inserted.params[2], adminId);

  const audit = queries.find((query) => query.sql.includes("INSERT INTO audit_records"));
  assert.ok(audit, "opening a game is written to the audit log");
  assert.deepEqual(
    [audit.params[0], audit.params[1], audit.params[2], audit.params[3]],
    [adminId, orgId, projectId, "project.operator_play_opened"],
  );
});

test("a non-admin cannot mint an operator invite", async () => {
  const { hosting, queries } = hostingWith({ admin: false, playable: true });
  await assert.rejects(hosting.createOperatorInvite(adminId, projectId), /admin required/);
  assert.equal(queries.some((query) => query.sql.includes("INSERT")), false);
});

test("suspended, disabled, or unreleased games stay unopenable for admins", async () => {
  const { hosting, queries } = hostingWith({ admin: true, playable: false });
  await assert.rejects(hosting.createOperatorInvite(adminId, projectId), /play unavailable/);
  assert.equal(queries.some((query) => query.sql.includes("INSERT")), false);
  const lookup = queries.find((query) => query.sql.includes("FROM projects"))!;
  assert.match(lookup.sql, /state <> 'suspended'/);
  assert.match(lookup.sql, /projects\.play_disabled_at IS NULL/);
  assert.match(lookup.sql, /platform_controls\.play_disabled_at IS NULL/);
});

test("the operator page opens games through an invite", () => {
  const page = renderOperatorPage({
    apiOrigin: "https://api.lokiplay.test",
    supabaseUrl: "https://auth.lokiplay.test",
    supabaseAnonKey: "public",
  });
  assert.match(page, /\/play-invite/);
  assert.match(page, /\?invite=/);
  assert.match(page, /\/v1\/operator\/vendor-usage/);
  assert.match(page, /\/v1\/operator\/costs/);
  assert.match(page, /id="plan-list"/);
  assert.match(page, /Vendor usage/);
  assert.match(page, /Cost analytics/);
  assert.match(page, /By game/);
  assert.match(page, /By creator/);
  assert.doesNotMatch(page, /open\.href = playLink/);
});

/* ---------------------------- vendor pricing --------------------------- */

test("Railway cost is priced per measurement and split by service", () => {
  const names = new Map([["svc-api", "api"], ["svc-nakama", "nakama"]]);
  const cost = railwayCost(
    [
      { measurement: "CPU_USAGE", value: 60_000, serviceId: "svc-api" },
      { measurement: "MEMORY_USAGE_GB", value: 30_000, serviceId: "svc-nakama" },
      { measurement: "NETWORK_TX_GB", value: 10, serviceId: "svc-api" },
      { measurement: "DISK_USAGE_GB", value: 99, serviceId: "svc-api" },
    ],
    names,
    DEFAULT_VENDOR_RATES.railway,
  );
  close(cost.total, 60_000 * 0.000463 + 30_000 * 0.000231 + 10 * 0.05);
  close(cost.byService.get("api")!, 60_000 * 0.000463 + 10 * 0.05);
  close(cost.byService.get("nakama")!, 30_000 * 0.000231);
});

test("R2 operations are classed and free allowances are respected", () => {
  assert.equal(r2OperationClass("PutObject"), "A");
  assert.equal(r2OperationClass("ListObjectsV2"), "A");
  assert.equal(r2OperationClass("GetObject"), "B");
  assert.equal(r2OperationClass("HeadObject"), "B");
  assert.equal(r2OperationClass("DeleteObject"), "free");

  const rates = DEFAULT_VENDOR_RATES.cloudflare;
  const inside = r2Cost(5 * GB, 500_000, 5_000_000, rates);
  assert.equal(inside.total, 0);
  const over = r2Cost(15 * GB, 2_000_000, 5_000_000, rates);
  close(over.storage, 5 * 0.015);
  close(over.classA, 4.5);
  close(over.classB, 0);
});

test("Supabase cost covers database overage per project and active users", () => {
  const cost = supabaseCost([9 * GB, 1 * GB], 100_100, DEFAULT_VENDOR_RATES.supabase);
  close(cost.database, 0.125);
  close(cost.users, 100 * 0.00325);
  close(cost.total, 0.125 + 100 * 0.00325);
});

test("rate overrides replace only valid numbers", () => {
  const rates = mergeVendorRates({
    railway: { networkPerGb: 0.1, cpuPerVcpuMinute: "free", memoryPerGbMinute: -1 },
    unknown: { anything: 1 },
  });
  assert.equal(rates.railway.networkPerGb, 0.1);
  assert.equal(rates.railway.cpuPerVcpuMinute, DEFAULT_VENDOR_RATES.railway.cpuPerVcpuMinute);
  assert.equal(rates.railway.memoryPerGbMinute, DEFAULT_VENDOR_RATES.railway.memoryPerGbMinute);
  assert.equal(DEFAULT_VENDOR_RATES.railway.networkPerGb, 0.05, "defaults are not mutated");
});

/* ------------------------------ vendor reads --------------------------- */

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

function vendorFetch(options: { cloudflareStatus?: number } = {}) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const impl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    if (url.includes("railway.com")) {
      return jsonResponse({
        data: {
          usage: [
            { measurement: "CPU_USAGE", value: 600, tags: { serviceId: "s1" } },
            { measurement: "MEMORY_USAGE_GB", value: 1200, tags: { serviceId: "s2" } },
            { measurement: "NETWORK_TX_GB", value: 4, tags: { serviceId: "s1" } },
          ],
          project: {
            services: {
              edges: [
                { node: { id: "s1", name: "api" } },
                { node: { id: "s2", name: "nakama" } },
              ],
            },
            workspace: { plan: "HOBBY", customer: { currentUsage: 3.25 } },
          },
        },
      });
    }
    if (url.includes("cloudflare.com")) {
      if (options.cloudflareStatus) return jsonResponse({}, options.cloudflareStatus);
      if (url.includes("/zones/")) {
        return jsonResponse({
          result: { plan: { name: "Free Website", price: 0, currency: "USD", legacy_id: "free" } },
        });
      }
      const query = typeof init?.body === "string" ? init.body : "";
      if (query.includes("httpRequestsAdaptiveGroups")) {
        return jsonResponse({
          data: {
            viewer: {
              zones: [
                {
                  httpRequestsAdaptiveGroups: [
                    {
                      count: 10,
                      avg: { sampleInterval: 100 },
                      sum: { edgeResponseBytes: 2 * GB },
                      dimensions: { clientRequestHTTPHost: "play.lokiplay.cc" },
                    },
                    {
                      count: 4,
                      avg: { sampleInterval: 50 },
                      sum: { edgeResponseBytes: 1 * GB },
                      dimensions: { clientRequestHTTPHost: "abc.lokiplay.cc" },
                    },
                    {
                      count: 1,
                      avg: { sampleInterval: 1 },
                      sum: { edgeResponseBytes: 0.5 * GB },
                      dimensions: { clientRequestHTTPHost: "api.lokiplay.cc" },
                    },
                  ],
                  dnsAnalyticsAdaptiveGroups: [{ count: 2_000_000 }],
                },
              ],
            },
          },
        });
      }
      return jsonResponse({
        data: {
          viewer: {
            accounts: [
              {
                storage: [{ max: { payloadSize: 12 * GB, metadataSize: 0, objectCount: 10 } }],
                operations: [
                  { sum: { requests: 1_500_000 }, dimensions: { actionType: "PutObject" } },
                  { sum: { requests: 20_000_000 }, dimensions: { actionType: "GetObject" } },
                  { sum: { requests: 999 }, dimensions: { actionType: "DeleteObject" } },
                ],
              },
            ],
          },
        },
      });
    }
    if (url.endsWith("/v2/console/authenticate")) return jsonResponse({ token: "console-token" });
    if (url.endsWith("/v2/console/status")) {
      return jsonResponse({
        nodes: [
          { name: "a", session_count: 5, presence_count: 7, match_count: 2 },
          { name: "b", session_count: 1, presence_count: 1, match_count: 0 },
        ],
      });
    }
    return jsonResponse({}, 404);
  }) as typeof fetch;
  return { impl, calls };
}

const database = (bytes: number, users?: number): VendorQueryable => ({
  async query(sql: string) {
    if (sql.includes("pg_database_size")) return { rows: [{ bytes: String(bytes) }] };
    if (sql.includes("auth.users")) {
      if (users === undefined) throw new Error("permission denied for schema auth");
      return { rows: [{ count: String(users) }] };
    }
    return { rows: [] };
  },
} as VendorQueryable);

const fixedNow = () => new Date("2026-10-07T08:00:00Z");

test("vendor usage reads every vendor and prices it", async () => {
  const { impl, calls } = vendorFetch();
  const service = new VendorUsageService({
    railway: { token: "rw", projectId: "p" },
    cloudflare: { token: "cf", accountId: "acct", bucket: "games" },
    nakama: { origin: "http://nakama.internal:7351", username: "admin", password: "secret-secret" },
    platformDatabase: database(2 * GB, 40),
    nakamaDatabase: database(1 * GB),
    fetch: impl,
    now: fixedNow,
  });
  const usage = await service.usage();
  const by = (id: string) => usage.vendors.find((vendor) => vendor.vendor === id)!;

  assert.equal(usage.periodStart, "2026-10-01T00:00:00.000Z");
  assert.deepEqual(
    usage.vendors.map((vendor) => vendor.status),
    ["ok", "ok", "not_configured", "ok", "ok"],
  );
  assert.equal(by("cloudflare-edge").status, "not_configured");

  assert.ok(Math.abs(by("railway").costUsd! - (600 * 0.000463 + 1200 * 0.000231 + 4 * 0.05)) <= 0.005 + 1e-9, "rounded to cents");
  assert.deepEqual(
    by("railway").breakdown.map((entry) => entry.label).sort(),
    ["api", "nakama"],
  );

  const r2 = by("cloudflare");
  assert.equal(r2.lines[0]!.used, 12);
  assert.equal(r2.lines[0]!.included, 10);
  assert.equal(r2.lines[1]!.used, 1_500_000, "writes count as class A");
  assert.equal(r2.lines[2]!.used, 20_000_000, "reads count as class B; deletes are free");
  close(r2.costUsd!, 2 * 0.015 + 0.5 * 4.5 + 10 * 0.36, "storage + class A + class B over allowance");

  const supabase = by("supabase");
  assert.deepEqual(supabase.lines.map((line) => line.label.split(" ")[0]), ["Platform", "Nakama", "Active", "Egress"]);
  assert.equal(supabase.lines.find((line) => line.label === "Egress")!.used, null);
  assert.match(supabase.message, /not available from an account token/);
  assert.equal(supabase.costUsd, 0, "inside the included database and user allowances");
  assert.equal(calls.some((call) => call.url.includes("/platform/")), false);

  const plan = (id: string) => usage.plans.find((entry) => entry.id === id)!;
  assert.equal(plan("railway").plan, "Hobby");
  assert.equal(plan("railway").monthlyUsd, 5);
  assert.match(plan("railway").message, /\$3\.25/);
  assert.equal(plan("cloudflare").monthlyUsd, null, "no zone id on this fixture");
  assert.equal(plan("supabase").monthlyUsd, null);
  assert.equal(plan("nakama").monthlyUsd, 0);
  assert.equal(usage.planTotalUsd, 5);
  assert.equal(usage.plansComplete, false);
  assert.deepEqual(usage.gaps, ["Supabase egress"]);

  assert.deepEqual(by("nakama").lines.map((line) => line.used), [6, 8, 2]);
  assert.equal(by("nakama").costUsd, null);

  const railwayCall = calls.find((call) => call.url.includes("railway.com"))!;
  assert.equal(
    (railwayCall.init?.headers as Record<string, string>).authorization,
    "Bearer rw",
  );

  const callCount = calls.length;
  await service.usage();
  assert.equal(calls.length, callCount, "a repeat read inside five minutes is cached");
  await service.usage(true);
  assert.ok(calls.length > callCount, "refresh bypasses the cache");
});

test("one failing or unconfigured vendor does not break the report", async () => {
  const { impl } = vendorFetch({ cloudflareStatus: 500 });
  const usage = await new VendorUsageService({
    cloudflare: { token: "cf", accountId: "acct", bucket: "games" },
    nakama: { origin: "http://nakama.internal:7351", username: "admin", password: "secret-secret" },
    platformDatabase: database(GB, undefined),
    fetch: impl,
    now: fixedNow,
  }).usage();
  const by = (id: string) => usage.vendors.find((vendor) => vendor.vendor === id)!;

  assert.equal(by("railway").status, "not_configured");
  assert.match(by("railway").message, /LOKI_RAILWAY_API_TOKEN/);
  assert.equal(by("railway").costUsd, null);
  assert.equal(by("cloudflare").status, "error");
  assert.match(by("cloudflare").message, /HTTP 500/);
  assert.equal(by("supabase").status, "ok", "sign-in counts are optional");
  assert.equal(by("supabase").lines.length, 2, "database size plus the unavailable egress line");
  assert.equal(by("nakama").status, "ok");
  assert.equal(by("cloudflare-edge").status, "not_configured");
});

test("proxied traffic is grouped by host and DNS queries are counted", async () => {
  assert.equal(edgeHostGroup("play.lokiplay.cc", "lokiplay.cc"), "play");
  assert.equal(edgeHostGroup("api.lokiplay.cc.", "lokiplay.cc"), "api");
  assert.equal(edgeHostGroup("abc.lokiplay.cc", "lokiplay.cc"), "games");
  assert.equal(estimatedRequestCount(10, 100), 1000);
  assert.equal(estimatedRequestCount(10), 10);
  assert.equal(
    dnsQueryWindow(new Date("2026-08-01T00:00:00Z"), new Date("2026-10-07T00:00:00Z")).clamped,
    true,
  );

  const { impl, calls } = vendorFetch();
  const usage = await new VendorUsageService({
    cloudflare: {
      token: "cf",
      accountId: "acct",
      bucket: "games",
      zoneId: "zone",
      zoneName: "lokiplay.cc",
    },
    fetch: impl,
    now: fixedNow,
  }).usage();
  const edge = usage.vendors.find((vendor) => vendor.vendor === "cloudflare-edge")!;
  assert.equal(edge.status, "ok");
  const line = (label: string) => edge.lines.find((entry) => entry.label === label)!;
  assert.equal(line("Play bandwidth").used, 2);
  assert.equal(line("Play requests").used, 1000);
  assert.equal(line("Game origins bandwidth").used, 1);
  assert.equal(line("Game origins requests").used, 200);
  assert.equal(line("API bandwidth").used, 0.5);
  assert.equal(line("API requests").used, 1);
  assert.equal(line("DNS queries").used, 2_000_000);
  assert.equal(edge.costUsd, 0, "bandwidth and DNS are included until a rate is set");
  const zonePlan = usage.plans.find((entry) => entry.id === "cloudflare")!;
  assert.equal(zonePlan.plan, "Free Website");
  assert.equal(zonePlan.monthlyUsd, 0);
  assert.match(edge.message, /marketing site is not included/);
  const edgeCall = calls.find((call) => String(call.init?.body ?? "").includes("httpRequestsAdaptiveGroups"))!;
  assert.match(String(edgeCall.init?.body), /%\.lokiplay\.cc/);
});

test("supabase egress stays unread and the organization plan is priced from the Management API", async () => {
  assert.equal(railwayPlanFee("HOBBY"), 5);
  assert.equal(railwayPlanFee("PRO"), 20);
  assert.equal(railwayPlanFee("ENTERPRISE"), null);
  assert.equal(supabasePlanMonthlyUsd("pro"), 25);
  assert.equal(supabasePlanMonthlyUsd("team"), 599);
  assert.equal(supabasePlanMonthlyUsd("enterprise"), null);
  assert.deepEqual(
    sumDailyEgress([
      { metric: "EGRESS", usage: 10 },
      { metric: "EGRESS", usage: 5 },
      { metric: "CACHED_EGRESS", usage: 2 },
      { metric: "DATABASE_SIZE", usage: 999 },
      { metric: "EGRESS", usage: -1 },
    ]),
    { egressBytes: 15, cachedBytes: 2 },
  );
  close(egressOverageCost(260 * GB, 250, 0.09), 0.9);
  close(egressOverageCost(1 * GB, 250, 0.03), 0);

  const calls: string[] = [];
  const impl = (async (input: string | URL | Request) => {
    const url = String(input);
    calls.push(url);
    if (url.includes("/platform/")) throw new Error("dashboard usage API must not be called");
    if (url.includes("/v1/organizations/")) return jsonResponse({ plan: "pro" });
    return jsonResponse({}, 404);
  }) as typeof fetch;
  const usage = await new VendorUsageService({
    platformDatabase: database(GB, 1),
    supabaseUsage: {
      token: "sbp-token-token-token",
      sources: [
        { orgSlug: "loki", projectRef: "platform-ref", label: "Platform" },
        { orgSlug: "loki", projectRef: "nakama-ref", label: "Nakama" },
      ],
    },
    fetch: impl,
    now: fixedNow,
  }).usage();
  const supabase = usage.vendors.find((vendor) => vendor.vendor === "supabase")!;
  const egress = supabase.lines.find((line) => line.label === "Egress")!;
  assert.equal(egress.used, null);
  assert.equal(egress.costUsd, null);
  assert.equal(calls.some((url) => url.includes("/platform/")), false);
  assert.equal(calls.filter((url) => url.includes("/v1/organizations/loki")).length, 1);
  const plan = usage.plans.find((entry) => entry.id === "supabase")!;
  assert.equal(plan.plan, "Pro");
  assert.equal(plan.monthlyUsd, 25, "the subscription is per organization, not per project");
  assert.match(plan.message, /Compute for each project/);
});

test("a vendor GraphQL error is reported, not thrown", async () => {
  const impl = (async () =>
    jsonResponse({ errors: [{ message: "Not Authorized" }] })) as unknown as typeof fetch;
  const usage = await new VendorUsageService({
    railway: { token: "bad", projectId: "p" },
    fetch: impl,
    now: fixedNow,
  }).usage();
  const railway = usage.vendors.find((vendor) => vendor.vendor === "railway")!;
  assert.equal(railway.status, "error");
  assert.equal(railway.message, "Not Authorized");
});

/* --------------------------- cost allocation --------------------------- */

const report = (
  vendor: VendorUsageReport["vendor"],
  costUsd: number | null,
  status: VendorUsageReport["status"] = "ok",
): VendorUsageReport => ({
  vendor,
  name: vendor,
  status,
  message: "",
  source: "",
  lines: [],
  costUsd,
  breakdown: [],
});

  const usageOf = (...vendors: VendorUsageReport[]): VendorUsage => ({
  generatedAt: "2026-10-07T08:00:00.000Z",
  periodStart: "2026-10-01T00:00:00.000Z",
  periodEnd: "2026-10-07T08:00:00.000Z",
  vendors,
  plans: [],
  planTotalUsd: 0,
  plansComplete: true,
  gaps: [],
});

const gameRow = (
  id: string,
  ownerId: string | null,
  storedBytes: number,
  sessions: number,
) => ({
  projectId: id,
  name: `Game ${id}`,
  organizationName: "Studio",
  ownerId,
  ownerEmail: ownerId ? `${ownerId}@example.com` : null,
  storedBytes,
  sessions,
});

test("storage cost follows bytes and runtime cost follows sessions", () => {
  const analytics = allocateCosts(
    usageOf(report("cloudflare", 10), report("railway", 20), report("supabase", 10), report("nakama", null)),
    [gameRow("a", "x", 300, 30), gameRow("b", "y", 100, 10), gameRow("c", "x", 0, 0)],
  );
  const game = (id: string) => analytics.games.find((entry) => entry.projectId === id)!;

  assert.equal(analytics.totalCostUsd, 40);
  assert.equal(analytics.storageCostUsd, 10);
  assert.equal(analytics.runtimeCostUsd, 30);
  close(game("a").storageCostUsd, 7.5);
  close(game("a").runtimeCostUsd, 22.5);
  close(game("b").costUsd, 10);
  assert.equal(game("c").costUsd, 0);
  assert.deepEqual(analytics.games.map((entry) => entry.projectId), ["a", "b", "c"]);

  assert.equal(analytics.unallocatedUsd, 0);
  assert.equal(analytics.complete, true, "an unread Nakama does not make the total partial");
  assert.equal(analytics.totals.games, 3);
  assert.equal(analytics.totals.creators, 2);
  assert.ok(Math.abs(analytics.totals.costPerGameUsd! - 40 / 3) < 1e-3);
  close(analytics.totals.costPerCreatorUsd!, 20);
  close(analytics.totals.costPerSessionUsd!, 30 / 40);

  const creator = (id: string) => analytics.creators.find((entry) => entry.accountId === id)!;
  assert.equal(creator("x").games, 2);
  close(creator("x").costUsd, 30);
  close(creator("y").costUsd, 10);
  assert.equal(analytics.creators[0]!.accountId, "x");
});

test("cost nobody can be charged for is reported as unallocated", () => {
  const analytics = allocateCosts(
    usageOf(report("cloudflare", 4), report("railway", 6), report("supabase", 0)),
    [gameRow("a", "x", 0, 0)],
  );
  assert.equal(analytics.unallocatedUsd, 10);
  assert.equal(analytics.totals.costPerSessionUsd, null);
});

test("totals are flagged as a minimum when a vendor could not be read", () => {
  const analytics = allocateCosts(
    usageOf(report("cloudflare", 5), report("railway", null, "not_configured"), report("supabase", 0)),
    [gameRow("a", "x", 10, 10)],
  );
  assert.equal(analytics.complete, false);
  assert.deepEqual(analytics.missingVendors, ["railway"]);
  assert.equal(analytics.totalCostUsd, 5);
});

test("operator costs read projects and meters for an admin only", async () => {
  const { impl } = vendorFetch();
  const vendors = new VendorUsageService({
    railway: { token: "rw", projectId: "p" },
    platformDatabase: database(GB, 1),
    fetch: impl,
    now: fixedNow,
  });
  const { pool, queries } = fakePool((sql) => {
    if (sql.includes("SELECT platform_role")) return [{ platform_role: "admin" }];
    if (sql.includes("FROM projects")) {
      return [
        {
          project_id: projectId,
          name: "Chess",
          organization_name: "Studio",
          owner_id: adminId,
          owner_email: "owner@example.com",
          stored_bytes: "2048",
          sessions: "10",
        },
      ];
    }
    return [];
  });
  const costs = await new DashboardService(pool, vendors).operatorCosts(adminId);
  assert.equal(costs.games[0]!.name, "Chess");
  assert.equal(costs.games[0]!.sessions, 10);
  assert.equal(costs.games[0]!.storedBytes, 2048);
  assert.ok(costs.games[0]!.runtimeCostUsd > 0);
  const projectQuery = queries.find((query) => query.sql.includes("FROM projects"))!;
  assert.match(projectQuery.sql, /scope_type = 'project'/);

  const denied = fakePool((sql) =>
    sql.includes("SELECT platform_role") ? [{ platform_role: "creator" }] : [],
  );
  await assert.rejects(
    new DashboardService(denied.pool, vendors).operatorCosts(adminId),
    /admin required/,
  );
  await assert.rejects(
    new DashboardService(denied.pool, vendors).operatorVendorUsage(adminId),
    /admin required/,
  );
});
