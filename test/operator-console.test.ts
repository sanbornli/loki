import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type { Pool } from "pg";
import { DashboardService } from "../apps/api/src/dashboard.js";
import { renderCreatorPage } from "../apps/web/src/creator-page.js";
import { isDocsRoute, llmsTxt, renderDocsPage } from "../apps/web/src/docs-page.js";
import { renderMarketingPage } from "../apps/web/src/marketing-page.js";
import {
  SUSPENSION_REASONS,
  renderOperatorPage,
} from "../apps/web/src/operator-page.js";
import {
  WEB_ONLY_MESSAGE,
  detectUnsupportedProject,
} from "../packages/cli/src/index.js";

const config = {
  apiOrigin: "https://api.lokiplay.test",
  supabaseUrl: "https://auth.lokiplay.test",
  supabaseAnonKey: "public",
};

const NOTICE =
  "Loki hosts finished web JavaScript games. Support for Unity, Godot, iOS, and Android are coming soon.";

type Query = { sql: string; params: unknown[] };

function fakePool(
  respond: (sql: string, params: unknown[]) => unknown[],
): { pool: Pool; queries: Query[] } {
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

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const currentWindow = () => new Date(Math.floor(Date.now() / THIRTY_DAYS_MS) * THIRTY_DAYS_MS);

test("operator console has Games and Limits pages in the creator shell", () => {
  const page = renderOperatorPage(config);
  assert.match(page, /class="dashboard-shell"/);
  assert.match(page, /data-nav-target="nav-games"/);
  assert.match(page, /data-nav-target="nav-limits"/);
  assert.equal((page.match(/data-nav-target=/g) ?? []).length, 2);
  assert.match(page, /Operator console/);
  assert.match(page, /Audit events/);
  assert.match(page, /\/v1\/operator\/usage/);
  assert.match(page, /\/suspension/);
  assert.match(page, /role", "meter"/);
  assert.match(page, /meter-bar/);
  assert.match(page, /data-filter="hosted"/);
  assert.match(page, /data-filter="listed"/);
  assert.match(page, /\/play\/" \+ encodeURIComponent\(organization\.slug\)/);
  assert.doesNotMatch(page, /\/state"/);
});

test("operator suspension offers fixed reasons", () => {
  assert.deepEqual([...SUSPENSION_REASONS], [
    "Violates the Terms of Service",
    "Violates the Acceptable Use Policy",
    "Illegal content",
    "Malware, phishing, or mining",
    "Intellectual property complaint",
  ]);
  const page = renderOperatorPage(config);
  for (const reason of SUSPENSION_REASONS) {
    assert.ok(page.includes(JSON.stringify(reason)), reason);
  }
});

test("operator usage compares meters and plan caps against limits", async () => {
  const accountId = "11111111-1111-4111-8111-111111111111";
  const projectId = "22222222-2222-4222-8222-222222222222";
  const staleWindow = new Date(currentWindow().getTime() - THIRTY_DAYS_MS);
  const { pool } = fakePool((sql) => {
    if (sql.includes("SELECT platform_role")) return [{ platform_role: "admin" }];
    if (sql.includes("FROM usage_meters")) {
      return [
        {
          scope_type: "project",
          scope_id: projectId,
          metric: "player_sessions",
          period_start: currentWindow(),
          quantity: "90000",
          hard_limit: "100000",
          scope_label: "Chess",
        },
        {
          scope_type: "project",
          scope_id: projectId,
          metric: "guest_sessions",
          period_start: staleWindow,
          quantity: "99999",
          hard_limit: "100000",
          scope_label: "Chess",
        },
        {
          scope_type: "account",
          scope_id: accountId,
          metric: "stored_bytes",
          period_start: currentWindow(),
          quantity: "1000",
          hard_limit: null,
          scope_label: "creator@example.com",
        },
      ];
    }
    if (sql.includes("COUNT(projects.id)")) {
      return [
        {
          id: accountId,
          email: "creator@example.com",
          plan: "free",
          plan_status: "active",
          plan_period_end: null,
          games: 1,
          play_links: 1,
        },
      ];
    }
    return [];
  });

  const usage = await new DashboardService(pool).operatorUsage(accountId);
  const find = (metric: string) => usage.meters.find((meter) => meter.metric === metric);

  assert.equal(find("guest_sessions"), undefined, "an expired window is not current usage");
  assert.deepEqual(
    { used: find("player_sessions")?.used, limit: find("player_sessions")?.limit },
    { used: 90000, limit: 100000 },
  );
  assert.equal(find("player_sessions")?.scopeLabel, "Chess");
  assert.equal(find("stored_bytes")?.limit, null);
  assert.deepEqual(
    { used: find("plan_games")?.used, limit: find("plan_games")?.limit },
    { used: 1, limit: 2 },
  );
  assert.deepEqual(
    usage.meters.map((meter) => meter.metric),
    ["plan_play_links", "player_sessions", "plan_games", "stored_bytes"],
    "meters closest to their limit come first and unlimited ones last",
  );
});

test("operator usage requires an admin", async () => {
  const { pool } = fakePool((sql) =>
    sql.includes("SELECT platform_role") ? [{ platform_role: "creator" }] : [],
  );
  await assert.rejects(
    new DashboardService(pool).operatorUsage("33333333-3333-4333-8333-333333333333"),
    /admin required/,
  );
});

test("a suspended project carries its reason to the creator overview", async () => {
  const accountId = "11111111-1111-4111-8111-111111111111";
  const orgId = "44444444-4444-4444-8444-444444444444";
  const now = new Date();
  const project = (state: string, reason: string | null) => ({
    id: state === "suspended"
      ? "55555555-5555-4555-8555-555555555555"
      : "66666666-6666-4666-8666-666666666666",
    organization_id: orgId,
    name: state,
    slug: state,
    state,
    active_deployment_id: null,
    play_disabled_reason: reason,
    created_at: now,
    updated_at: now,
    deployment_count: 0,
    latest_deployment_id: null,
  });
  const { pool } = fakePool((sql) => {
    if (sql.includes("FROM accounts WHERE id")) {
      return [{
        id: accountId,
        email: "creator@example.com",
        platform_role: "creator",
        created_at: now,
        plan: "free",
        plan_status: "active",
        plan_period_end: null,
        stripe_customer_id: null,
      }];
    }
    if (sql.includes("FROM organization_members") && sql.includes("organizations.*")) return [];
    if (sql.includes("FROM projects")) {
      return [
        project("suspended", "Illegal content"),
        // A stale reason must not leak once the project is no longer suspended.
        project("private", "Illegal content"),
      ];
    }
    return [];
  });
  const overview = await new DashboardService(pool).creatorOverview(accountId);
  const suspended = overview.projects.find((item) => item.state === "suspended");
  const restored = overview.projects.find((item) => item.state === "private");
  assert.equal(suspended?.suspensionReason, "Illegal content");
  assert.equal(restored?.suspensionReason, undefined);
  assert.equal("suspensionReason" in (restored ?? {}), false);
});

test("creator dashboard shows the suspension reason on the game", () => {
  const page = renderCreatorPage(config);
  assert.match(page, /project\.state === "suspended"/);
  assert.match(page, /Suspended by Loki\. Reason: /);
  assert.match(page, /project\.suspensionReason/);
});

test("every entry point says Loki is web JavaScript for now", async () => {
  const home = renderMarketingPage(config);
  assert.match(home, /class="platform-note">/);
  assert.ok(home.includes(NOTICE));

  const product = renderMarketingPage(config, "/product");
  assert.match(product, /id="platforms"/);
  assert.match(product, /Built for web JavaScript games today\./);
  assert.ok(product.includes(NOTICE));
  assert.ok(
    product.indexOf('id="agents"') < product.indexOf('id="platforms"') &&
      product.indexOf('id="platforms"') < product.indexOf('id="start-title"'),
    "platforms sits after Agents and before Get started",
  );
  assert.match(product, /href="\/product#platforms"/);

  assert.match(renderMarketingPage(config, "/sdk"), /Support for Unity, Godot, iOS, and Android are coming soon\./);
  assert.ok(renderDocsPage(config, "/").includes(NOTICE));
  assert.equal(renderCreatorPage(config).includes(NOTICE), false);
  assert.ok(llmsTxt.includes(NOTICE.replace("Loki hosts finished web JavaScript games.", "Loki hosts finished web JavaScript games only.")));

  const cli = JSON.parse(
    await (await import("node:fs/promises")).readFile(
      new URL("../packages/cli/package.json", import.meta.url),
      "utf8",
    ),
  ) as { description: string };
  assert.ok(cli.description.includes(NOTICE));
});

test("the native docs page is gone", () => {
  assert.equal(isDocsRoute("/native"), false);
  const docs = renderDocsPage(config, "/");
  assert.doesNotMatch(docs, /href="\/native"/);
  assert.doesNotMatch(llmsTxt, /Native Swift\/Kotlin\/Unity/);
});

test("the CLI recognises Unity, Godot, iOS, and Android project folders", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "loki-engine-"));
  try {
    const make = async (name: string, files: string[], directories: string[] = []) => {
      const dir = path.join(root, name);
      await mkdir(dir, { recursive: true });
      for (const directory of directories) await mkdir(path.join(dir, directory));
      for (const file of files) await writeFile(path.join(dir, file), "");
      return dir;
    };
    assert.equal(await detectUnsupportedProject(await make("unity", [], ["Assets", "ProjectSettings"])), "Unity");
    assert.equal(await detectUnsupportedProject(await make("godot", ["project.godot"])), "Godot");
    assert.equal(await detectUnsupportedProject(await make("swift", ["Package.swift"])), "iOS");
    assert.equal(await detectUnsupportedProject(await make("xcode", [], ["Game.xcodeproj"])), "iOS");
    assert.equal(await detectUnsupportedProject(await make("android", ["build.gradle.kts"])), "Android");
    // A web game that merely has an Assets folder is still a web game.
    assert.equal(
      await detectUnsupportedProject(await make("web", ["index.html", "game.json"], ["Assets"])),
      undefined,
    );
    assert.equal(await detectUnsupportedProject(path.join(root, "missing")), undefined);
    assert.match(WEB_ONLY_MESSAGE, /Unity, Godot, iOS, and Android are coming soon/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
