import assert from "node:assert/strict";
import test from "node:test";
import type { Pool } from "pg";
import { PostgresCliDeviceAuthorizationService } from "../apps/api/src/cli-device-auth.js";
import { loadProviderEnvironment } from "../apps/api/src/config.js";
import {
  EmailNotifier,
  describeEvent,
  gameCreatedEmail,
  welcomeEmail,
  type OperatorEvent,
  type OperatorNotifier,
  type UserEmail,
} from "../apps/api/src/notifications.js";
import { PostgresPlatformService } from "../apps/api/src/postgres.js";
import { SessionTokenService } from "../apps/api/src/tokens.js";

type Query = { sql: string; params: unknown[] };

function fakePool(respond: (sql: string, params: unknown[]) => unknown[]): {
  pool: Pool;
  queries: Query[];
} {
  const queries: Query[] = [];
  const run = async (sql: string, params: unknown[] = []) => {
    queries.push({ sql, params });
    const rows = respond(sql, params);
    return { rows, rowCount: rows.length };
  };
  const pool = {
    query: run,
    async connect() {
      return { query: run, release() {} };
    },
  } as unknown as Pool;
  return { pool, queries };
}

function recorder(): {
  notifier: OperatorNotifier;
  events: OperatorEvent[];
  userEmails: UserEmail[];
} {
  const events: OperatorEvent[] = [];
  const userEmails: UserEmail[] = [];
  return {
    notifier: {
      notify: (event) => events.push(event),
      notifyUser: (email) => userEmails.push(email),
    },
    events,
    userEmails,
  };
}

const tokens = {} as SessionTokenService;
const legal = { terms: "1", privacy: "1", aup: "1" };

test("a new account is welcomed and a new game gets install instructions", () => {
  const welcome = welcomeEmail();
  assert.equal(welcome.subject, "Welcome to Loki!");
  assert.match(welcome.text, /^Welcome to Loki!\n\nYour account is ready\. Sign in and create your first game at app\.lokiplay\.cc\./);
  assert.match(welcome.text, /visit lokiplay\.cc or reach out to contact@lokiplay\.cc\.$/);

  const created = gameCreatedEmail("Tanks\n<script>");
  assert.equal(created.subject, "Congrats! You just created Tanksscript.");
  assert.match(created.text, /^Congrats! You just created Tanksscript\./);
  assert.match(created.text, /1\. Visit your game page on the Creator dashboard \(app\.lokiplay\.cc\)\./);
  assert.match(created.text, /4\. Wait for the installation to be run by your agent, authenticate using your Loki account when prompted\./);
  assert.match(created.text, /visit https:\/\/lokiplay\.cc or reach out to contact@lokiplay\.cc\.$/);
  assert.doesNotMatch(created.text, /\n<script>/);
});

test("messages name the person and strip anything that could mention or link", () => {
  assert.equal(
    describeEvent({ type: "account.created", email: "a@b.co" }),
    "New Loki account: a@b.co",
  );
  assert.equal(
    describeEvent({ type: "cli.first_login", email: "a@b.co" }),
    "First CLI login: a@b.co signed in to the Loki CLI",
  );
  assert.equal(
    describeEvent({
      type: "game.first_deployed",
      email: "a@b.co",
      projectName: "<!channel> Tanks",
    }),
    'First deploy: a@b.co put "!channel Tanks" live',
  );
});

const emailOptions = {
  apiKey: "re_test_key_0123456789",
  from: "Loki <notify@lokiplay.cc>",
  to: "sanborn.li.hk@gmail.com",
};

test("each event is one plain email to the operator through Resend", async () => {
  const calls: { url: string; headers: Record<string, string>; body: Record<string, unknown> }[] = [];
  const notifier = new EmailNotifier({
    ...emailOptions,
    fetch: (async (url: string, init: RequestInit) => {
      calls.push({
        url,
        headers: init.headers as Record<string, string>,
        body: JSON.parse(String(init.body)),
      });
      return new Response("{}");
    }) as unknown as typeof fetch,
  });
  await notifier.send({ type: "account.created", email: "a@b.co" });
  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.url, "https://api.resend.com/emails");
  assert.equal(calls[0]!.headers.authorization, `Bearer ${emailOptions.apiKey}`);
  assert.deepEqual(calls[0]!.body, {
    from: "Loki <notify@lokiplay.cc>",
    to: ["sanborn.li.hk@gmail.com"],
    subject: "New Loki account: a@b.co",
    text: "New Loki account: a@b.co",
  });
  await notifier.deliver({
    to: "new@example.com",
    subject: "Welcome to Loki!",
    text: "Welcome to Loki!",
    replyTo: "contact@lokiplay.cc",
  });
  assert.deepEqual(calls[1]!.body, {
    from: "Loki <notify@lokiplay.cc>",
    to: ["new@example.com"],
    subject: "Welcome to Loki!",
    text: "Welcome to Loki!",
    reply_to: "contact@lokiplay.cc",
  });
});

test("a failing email is logged without the key and never throws", async () => {
  const logs: string[] = [];
  const down = new EmailNotifier({
    ...emailOptions,
    fetch: (async () => {
      throw new Error(`connect failed with ${emailOptions.apiKey}`);
    }) as unknown as typeof fetch,
    log: (message) => logs.push(message),
  });
  await down.send({ type: "account.created", email: "a@b.co" });
  const rejected = new EmailNotifier({
    ...emailOptions,
    fetch: (async () => new Response("no", { status: 403 })) as unknown as typeof fetch,
    log: (message) => logs.push(message),
  });
  await rejected.send({ type: "account.created", email: "a@b.co" });
  assert.equal(logs.length, 2);
  assert.ok(logs.every((message) => !message.includes(emailOptions.apiKey)));
  assert.doesNotThrow(() => down.notify({ type: "account.created", email: "a@b.co" }));
});

test("operator email needs the key, sender, and recipient together", () => {
  assert.throws(() => new EmailNotifier({ ...emailOptions, to: "" }), /to address/);
  assert.throws(
    () => loadProviderEnvironment({ LOKI_RESEND_API_KEY: emailOptions.apiKey }),
    /LOKI_NOTIFY_EMAIL_FROM is required/,
  );
  const environment = loadProviderEnvironment({
    LOKI_RESEND_API_KEY: emailOptions.apiKey,
    LOKI_NOTIFY_EMAIL_FROM: emailOptions.from,
    LOKI_NOTIFY_EMAIL_TO: emailOptions.to,
  });
  assert.equal(environment.LOKI_NOTIFY_EMAIL_TO, "sanborn.li.hk@gmail.com");
  assert.doesNotThrow(() => loadProviderEnvironment({}));
});

const accountRow = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "new@example.com",
  platform_role: "creator",
  created_at: new Date(),
  plan: "free",
  plan_status: "active",
  plan_period_end: null,
  stripe_customer_id: null,
};

test("a brand new account is announced once, and signing in again is not", async () => {
  const fresh = fakePool((sql) => {
    if (sql.startsWith("UPDATE accounts SET email")) return [];
    if (sql.includes("INSERT INTO accounts")) return [accountRow];
    return [];
  });
  const first = recorder();
  const service = new PostgresPlatformService(fresh.pool, tokens, first.notifier);
  await service.ensureCreator("subject-1", "New@Example.com", legal);
  assert.deepEqual(first.events, [{ type: "account.created", email: "new@example.com" }]);
  assert.deepEqual(first.userEmails, [{ type: "welcome", to: "new@example.com" }]);

  const known = fakePool((sql) => {
    if (sql.startsWith("UPDATE accounts SET email")) return [accountRow];
    if (sql.includes("suspended_at IS NULL")) return [{ "?column?": 1 }];
    return [];
  });
  const second = recorder();
  const again = new PostgresPlatformService(known.pool, tokens, second.notifier);
  await again.ensureCreator("subject-1", "new@example.com", legal);
  assert.deepEqual(second.events, []);
  assert.deepEqual(second.userEmails, []);
});

test("creating a game emails that creator once", async () => {
  const actor = "55555555-5555-4555-8555-555555555555";
  const organizationId = "44444444-4444-4444-8444-444444444444";
  const pool = fakePool((sql) => {
    if (sql.includes("count(*)")) return [{ count: "0" }];
    if (sql.includes("role = 'owner'")) {
      return [{
        id: actor,
        email: "maker@example.com",
        plan: "free",
        plan_status: "active",
        plan_period_end: null,
        stripe_customer_id: null,
      }];
    }
    if (sql.includes("FROM organization_members")) return [{ "?column?": 1 }];
    if (sql.includes("INSERT INTO projects")) {
      return [{
        id: "22222222-2222-4222-8222-222222222222",
        organization_id: organizationId,
        name: "Tanks",
        slug: "tanks",
        state: "draft",
        active_deployment_id: null,
        created_at: new Date(),
        updated_at: new Date(),
      }];
    }
    if (sql.includes("SELECT email FROM accounts")) return [{ email: "maker@example.com" }];
    return [];
  });
  const recorded = recorder();
  const project = await new PostgresPlatformService(pool.pool, tokens, recorded.notifier)
    .createProject(actor, organizationId, { name: "Tanks", slug: "tanks" });
  assert.equal(project.name, "Tanks");
  assert.deepEqual(recorded.userEmails, [
    { type: "game_created", to: "maker@example.com", projectName: "Tanks" },
  ]);
  assert.deepEqual(recorded.events, []);
});

const projectId = "22222222-2222-4222-8222-222222222222";
const deploymentId = "33333333-3333-4333-8333-333333333333";
const projectRow = {
  id: projectId,
  organization_id: "44444444-4444-4444-8444-444444444444",
  name: "Tanks",
  slug: "tanks",
  state: "private",
  active_deployment_id: deploymentId,
  created_at: new Date(),
  updated_at: new Date(),
};

function activationPool(previouslyActivated: boolean) {
  return fakePool((sql) => {
    if (sql.includes("FROM projects WHERE id = $1 FOR UPDATE")) return [projectRow];
    if (sql.includes("FROM organization_members")) return [{ "?column?": 1 }];
    if (sql.includes("FROM deployments")) return [{ "?column?": 1 }];
    if (sql.includes("action = 'deployment.activated'")) {
      return previouslyActivated ? [{ "?column?": 1 }] : [];
    }
    if (sql.includes("UPDATE projects")) return [projectRow];
    if (sql.includes("SELECT email FROM accounts")) return [{ email: "maker@example.com" }];
    return [];
  });
}

test("only a project's first activation is announced", async () => {
  const actor = "55555555-5555-4555-8555-555555555555";
  const first = recorder();
  await new PostgresPlatformService(activationPool(false).pool, tokens, first.notifier)
    .setActiveDeployment(actor, projectId, deploymentId);
  assert.deepEqual(first.events, [
    { type: "game.first_deployed", email: "maker@example.com", projectName: "Tanks" },
  ]);

  const later = recorder();
  await new PostgresPlatformService(activationPool(true).pool, tokens, later.notifier)
    .setActiveDeployment(actor, projectId, deploymentId);
  assert.deepEqual(later.events, []);
});

function approvePool(earlierApproval: boolean) {
  return fakePool((sql) => {
    if (sql.includes("FROM cli_device_authorizations")) {
      return [
        {
          id: "66666666-6666-4666-8666-666666666666",
          approved_at: null,
          consumed_at: null,
          expires_at: new Date(Date.now() + 5 * 60_000),
        },
      ];
    }
    if (sql.includes("FROM security_audit_records")) {
      return earlierApproval ? [{ "?column?": 1 }] : [];
    }
    if (sql.includes("SELECT email FROM accounts")) return [{ email: "maker@example.com" }];
    return [];
  });
}

async function approve(earlierApproval: boolean): Promise<OperatorEvent[]> {
  const { notifier, events } = recorder();
  const service = new PostgresCliDeviceAuthorizationService(
    approvePool(earlierApproval).pool,
    Buffer.alloc(32, 1),
    { verificationUri: "https://app.example.test/device", notifier },
  );
  const now = Math.floor(Date.now() / 1_000);
  await service.approve({
    userCode: "ABCD-2345",
    actorId: "77777777-7777-4777-8777-777777777777",
    accessToken: "token",
    accessTokenExpiresAt: now + 600,
  });
  return events;
}

test("only an account's first CLI login approval is announced", async () => {
  assert.deepEqual(await approve(false), [
    { type: "cli.first_login", email: "maker@example.com" },
  ]);
  assert.deepEqual(await approve(true), []);
});
