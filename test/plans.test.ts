import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { BillingService } from "../apps/api/src/billing.js";
import { MASTER_TEST_ACCOUNT_EMAIL } from "../apps/api/src/master-account.js";
import { PlatformService } from "../apps/api/src/platform.js";
import { applyPlanToTenantConfig, effectivePlan } from "../apps/api/src/plans.js";
import { renderCreatorPage } from "../apps/web/src/creator-page.js";

const hostManifest = {
  multiplayer: { enabled: true as const, authority: "host" as const, maxPlayers: 8 },
};

test("effective plan keeps paid access through the current period", () => {
  const future = new Date(Date.now() + 60_000).toISOString();
  const past = new Date(Date.now() - 60_000).toISOString();
  assert.equal(effectivePlan({ plan: "pro", status: "past_due", periodEnd: future }), "pro");
  assert.equal(effectivePlan({ plan: "loki", status: "canceled", periodEnd: future }), "loki");
  assert.equal(effectivePlan({ plan: "pro", status: "canceled", periodEnd: past }), "free");
  assert.equal(effectivePlan({ plan: "loki", status: "active" }), "loki");
});

test("the master test account keeps Pro entitlements on a stored free plan", () => {
  const platform = new PlatformService();
  const master = platform.registerCreator(MASTER_TEST_ACCOUNT_EMAIL, "Master");
  assert.equal(master.account.plan, "pro");
  assert.equal(master.account.limits.serverAuthority, true);
  assert.equal(master.account.limits.games, null);
  platform.createProject(master.account.id, master.organization.id, {
    name: "First",
    slug: "master-first",
  });
  const second = platform.createOrganization(master.account.id, {
    name: "Second",
    slug: "master-second",
  });
  const project = platform.createProject(master.account.id, second.id, {
    name: "Second",
    slug: "master-second-game",
  });
  platform.assertManifestAllowed(project.id, {
    multiplayer: { enabled: true, authority: "server", maxPlayers: 16 },
  });
  const activated = platform.setActiveDeployment(
    master.account.id,
    project.id,
    crypto.randomUUID(),
  );
  assert.equal(activated.state, "unlisted");
});

test("free plan limits follow the owning account across organizations", () => {
  const platform = new PlatformService();
  const creator = platform.registerCreator("owner@example.test", "Studio");
  assert.equal(creator.account.plan, "free");
  assert.equal(creator.account.limits.maxPlayersPerRoom, 4);
  platform.createProject(creator.account.id, creator.organization.id, {
    name: "First",
    slug: "first-game",
  });
  const second = platform.createOrganization(creator.account.id, {
    name: "Second",
    slug: "second-studio",
  });
  assert.throws(
    () => platform.createProject(creator.account.id, second.id, {
      name: "Second",
      slug: "second-game",
    }),
    /plan game limit reached/,
  );
  platform.assignPlan(creator.account.id, "loki");
  platform.createProject(creator.account.id, second.id, {
    name: "Second",
    slug: "second-game",
  });
});

test("downgrade blocks new play links and public listing without removing games", () => {
  const platform = new PlatformService();
  const creator = platform.registerCreator("owner@example.test", "Studio");
  platform.assignPlan(creator.account.id, "pro");
  const first = platform.createProject(creator.account.id, creator.organization.id, {
    name: "First",
    slug: "first-game",
  });
  const second = platform.createProject(creator.account.id, creator.organization.id, {
    name: "Second",
    slug: "second-game",
  });
  platform.transitionProject(creator.account.id, first.id, "private");
  platform.transitionProject(creator.account.id, second.id, "private");
  platform.assignPlan(creator.account.id, "free");
  assert.equal(platform.getProject(creator.account.id, first.id).state, "private");
  platform.transitionProject(creator.account.id, second.id, "draft");
  assert.throws(
    () => platform.transitionProject(creator.account.id, second.id, "private"),
    /plan play link limit reached/,
  );
  assert.throws(
    () => platform.transitionProject(creator.account.id, first.id, "unlisted"),
    /public catalog requires Loki or Loki Pro/,
  );
  platform.assignPlan(creator.account.id, "loki");
  platform.transitionProject(creator.account.id, second.id, "private");
  platform.transitionProject(creator.account.id, first.id, "unlisted");
});

test("free activation stays private and room size follows the plan", () => {
  const platform = new PlatformService();
  const creator = platform.registerCreator("owner@example.test", "Studio");
  const project = platform.createProject(creator.account.id, creator.organization.id, {
    name: "Draft",
    slug: "draft-game",
  });
  const activated = platform.setActiveDeployment(
    creator.account.id,
    project.id,
    crypto.randomUUID(),
  );
  assert.equal(activated.state, "private");
  assert.throws(
    () => platform.assertManifestAllowed(project.id, hostManifest),
    /this plan allows 4 players per room/,
  );
  assert.throws(
    () => platform.assertManifestAllowed(project.id, {
      multiplayer: { enabled: true, authority: "server", maxPlayers: 4 },
    }),
    /server authority requires Loki or Loki Pro/,
  );
  assert.equal(platform.projectRuntimeLimits(project.id).simultaneousRooms, 2);

  platform.assignPlan(creator.account.id, "loki");
  platform.assertManifestAllowed(project.id, hostManifest);
  assert.throws(
    () => platform.assertManifestAllowed(project.id, {
      multiplayer: { enabled: true, authority: "host", maxPlayers: 16 },
    }),
    /this plan allows 8 players per room/,
  );
  assert.equal(platform.projectRuntimeLimits(project.id).simultaneousRooms, 100);

  platform.assignPlan(creator.account.id, "pro");
  platform.assertManifestAllowed(project.id, {
    multiplayer: { enabled: true, authority: "server", maxPlayers: 16 },
  });
  assert.deepEqual(
    applyPlanToTenantConfig({
      maxPlayers: 16,
      tickRate: 10,
      authority: "host" as const,
      stepModule: null,
    }, "free"),
    {
      maxPlayers: 4,
      tickRate: 10,
      authority: "host",
      stepModule: null,
      concurrentRoomQuota: 2,
    },
  );
});

test("stripe webhook sets the account plan from the subscription price", async () => {
  const platform = new PlatformService();
  const creator = platform.registerCreator("owner@example.test", "Studio");
  const project = platform.createProject(creator.account.id, creator.organization.id, {
    name: "Only",
    slug: "only-game",
  });
  const secret = "whsec_test_secret_value";
  const billing = new BillingService({
    secretKey: "sk_test_secret_value",
    webhookSecret: secret,
    creatorOrigin: "https://app.lokiplay.test",
    prices: {
      loki_monthly: "price_loki_month",
      loki_annual: "price_loki_year",
      pro_monthly: "price_pro_month",
      pro_annual: "price_pro_year",
    },
  }, platform);
  const periodEnd = Math.floor(Date.now() / 1000) + 3_600;
  const payload = Buffer.from(JSON.stringify({
    type: "customer.subscription.updated",
    data: {
      object: {
        id: "sub_123",
        customer: "cus_123",
        status: "active",
        current_period_end: periodEnd,
        metadata: { account_id: creator.account.id },
        items: { data: [{ price: { id: "price_pro_month" } }] },
      },
    },
  }));
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = createHmac("sha256", secret)
    .update(`${timestamp}.${payload.toString("utf8")}`)
    .digest("hex");
  await billing.handleWebhook(payload, `t=${timestamp},v1=${signature}`);
  assert.equal(platform.projectRuntimeLimits(project.id).plan, "pro");
  assert.equal(platform.projectRuntimeLimits(project.id).maxPlayersPerRoom, 16);
  platform.createProject(creator.account.id, creator.organization.id, {
    name: "Another",
    slug: "another-game",
  });

  const calls: string[] = [];
  const checkout = new BillingService({
    secretKey: "sk_test_secret_value",
    webhookSecret: secret,
    creatorOrigin: "https://app.lokiplay.test",
    prices: {
      loki_monthly: "price_loki_month",
      loki_annual: "price_loki_year",
      pro_monthly: "price_pro_month",
      pro_annual: "price_pro_year",
    },
    fetch: async (input, init) => {
      calls.push(String(input));
      assert.match(String(init?.body), /price_loki_year/);
      assert.match(String(init?.body), /cus_123/);
      return new Response(JSON.stringify({ url: "https://checkout.stripe.test/session" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  }, platform);
  const session = await checkout.createCheckout(creator.account.id, "loki_annual");
  assert.equal(session.url, "https://checkout.stripe.test/session");
  assert.match(calls[0] ?? "", /checkout\/sessions/);
});

test("creator dashboard shows the account plan and billing actions", () => {
  const page = renderCreatorPage({
    apiOrigin: "https://api.lokiplay.test",
    supabaseUrl: "https://auth.lokiplay.test",
    supabaseAnonKey: "public",
  });
  assert.match(page, /id="account-plan"/);
  assert.match(page, /id="plan-card"/);
  assert.match(page, /Loki Pro \$15\/month, billed annually/);
  assert.match(page, /\/v1\/billing\/checkout/);
  assert.match(page, /\/v1\/billing\/portal/);
  assert.match(page, /Continue with Google/);
  assert.match(page, /Continue with GitHub/);
  assert.match(page, /grant_type=pkce/);
  assert.match(page, /x-loki-terms-version/);
});
