import assert from "node:assert/strict";
import { createHmac, createVerify, generateKeyPairSync } from "node:crypto";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import {
  GitHubAppClient,
  LOKI_WORKFLOW_MARKER,
  createGitHubAppJwt,
  githubActionsWorkflow,
  verifyGitHubWebhookSignature,
  type GitHubRepository,
} from "../apps/api/src/github-app.js";
import type {
  GitHubConnection,
  GitHubConnectionOperations,
} from "../apps/api/src/github-connections.js";
import {
  createApiHandler,
  type ApiDependencies,
} from "../apps/api/src/server.js";

test("GitHub App JWT and webhook signatures use the required algorithms", () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });
  const jwt = createGitHubAppJwt(
    "12345",
    privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    1_000,
  );
  const [header, payload, signature] = jwt.split(".");
  assert.deepEqual(JSON.parse(Buffer.from(header!, "base64url").toString()), {
    alg: "RS256",
    typ: "JWT",
  });
  assert.deepEqual(JSON.parse(Buffer.from(payload!, "base64url").toString()), {
    iat: 940,
    exp: 1540,
    iss: "12345",
  });
  const verifier = createVerify("RSA-SHA256");
  verifier.update(`${header}.${payload}`);
  verifier.end();
  assert.equal(verifier.verify(publicKey, signature!, "base64url"), true);

  const body = Buffer.from('{"safe":true}');
  const expected = `sha256=${createHmac("sha256", "webhook-secret-123")
    .update(body)
    .digest("hex")}`;
  assert.equal(
    verifyGitHubWebhookSignature("webhook-secret-123", body, expected),
    true,
  );
  assert.equal(
    verifyGitHubWebhookSignature("webhook-secret-123", body, `${expected}00`),
    false,
  );
  assert.equal(
    verifyGitHubWebhookSignature("webhook-secret-123", Buffer.from("{}"), expected),
    false,
  );
});

const testPrivateKey = generateKeyPairSync("rsa", {
  modulusLength: 2048,
}).privateKey.export({ type: "pkcs8", format: "pem" }).toString();

const githubClientWith = (fetchImplementation: typeof fetch) =>
  new GitHubAppClient({
    appId: "12345",
    privateKeyPem: testPrivateKey,
    webhookSecret: "webhook-secret-123",
    fetch: fetchImplementation,
  });

const workflow = githubActionsWorkflow({
  branch: "main",
  rootDirectory: ".",
  buildCommand: "npm run build",
  outputDirectory: "dist",
  artifactName: "loki-finished-build",
});

test("GitHub workflow installation creates an absent workflow", async () => {
  const requests: Array<{ url: string; method: string; body?: string }> = [];
  const client = githubClientWith(async (url, init) => {
    requests.push({
      url: String(url),
      method: init?.method ?? "GET",
      body: typeof init?.body === "string" ? init.body : undefined,
    });
    if (String(url).includes("/access_tokens")) {
      return Response.json({ token: "installation-token" }, { status: 201 });
    }
    if ((init?.method ?? "GET") === "GET") {
      return new Response("not found", { status: 404 });
    }
    return Response.json(
      { content: { sha: "a".repeat(40) }, commit: { sha: "b".repeat(40) } },
      { status: 201 },
    );
  });
  assert.equal(
    await client.installWorkflow({
      installationId: "77",
      repository,
      branch: "main",
      workflowFile: ".github/workflows/loki-deploy.yml",
      content: workflow,
    }),
    "created",
  );
  const write = requests.find((request) => request.method === "PUT")!;
  const body = JSON.parse(write.body!) as { sha?: string; content: string };
  assert.equal(body.sha, undefined);
  assert.equal(Buffer.from(body.content, "base64").toString(), workflow);
});

test("GitHub workflow installation safely updates only Loki-owned content", async () => {
  let writtenSha: string | undefined;
  const existing = `${LOKI_WORKFLOW_MARKER}\nname: Old Loki workflow\n`;
  const client = githubClientWith(async (url, init) => {
    if (String(url).includes("/access_tokens")) {
      return Response.json({ token: "installation-token" }, { status: 201 });
    }
    if ((init?.method ?? "GET") === "GET") {
      return Response.json({
        type: "file",
        encoding: "base64",
        content: Buffer.from(existing).toString("base64"),
        size: Buffer.byteLength(existing),
        sha: "c".repeat(40),
      });
    }
    writtenSha = (JSON.parse(String(init?.body)) as { sha?: string }).sha;
    return Response.json({
      content: { sha: "d".repeat(40) },
      commit: { sha: "e".repeat(40) },
    });
  });
  assert.equal(
    await client.installWorkflow({
      installationId: "77",
      repository,
      branch: "main",
      workflowFile: ".github/workflows/loki-deploy.yml",
      content: workflow,
    }),
    "updated",
  );
  assert.equal(writtenSha, "c".repeat(40));
});

test("GitHub workflow installation refuses a user-owned workflow", async () => {
  let writes = 0;
  const existing = "name: User workflow\n";
  const client = githubClientWith(async (url, init) => {
    if (String(url).includes("/access_tokens")) {
      return Response.json({ token: "installation-token" }, { status: 201 });
    }
    if ((init?.method ?? "GET") === "PUT") writes += 1;
    return Response.json({
      type: "file",
      encoding: "base64",
      content: Buffer.from(existing).toString("base64"),
      size: Buffer.byteLength(existing),
      sha: "f".repeat(40),
    });
  });
  await assert.rejects(
    client.installWorkflow({
      installationId: "77",
      repository,
      branch: "main",
      workflowFile: ".github/workflows/loki-deploy.yml",
      content: workflow,
    }),
    /refusing to overwrite/,
  );
  assert.equal(writes, 0);
});

const repository: GitHubRepository = {
  id: "88",
  owner: "studio",
  name: "game",
  fullName: "studio/game",
  defaultBranch: "main",
  private: true,
};

const connection: GitHubConnection = {
  id: "connection-id",
  projectId: "11111111-1111-4111-8111-111111111111",
  installationId: "77",
  repositoryId: "88",
  repositoryOwner: "studio",
  repositoryName: "game",
  branch: "main",
  rootDirectory: ".",
  buildCommand: "npm run build",
  outputDirectory: "dist",
  workflowFile: ".github/workflows/loki-deploy.yml",
  artifactName: "loki-finished-build",
  createdBy: "actor-id",
  createdAt: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString(),
};

async function withApi(
  dependencies: ApiDependencies,
  operation: (origin: string) => Promise<void>,
): Promise<void> {
  const server = createServer((request, response) => {
    void createApiHandler(dependencies)(request, response);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address() as AddressInfo;
    await operation(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}

const baseDependencies = (): ApiDependencies =>
  ({
    platform: {},
    deployments: {},
    authenticateCreator: async () => "actor-id",
  }) as unknown as ApiDependencies;

test("GitHub callback binds but does not consume state and escapes HTML", async () => {
  const calls: string[] = [];
  const connections = {
    async getPendingConnection() {
      calls.push("pending");
      return {
        actorId: "actor-id",
        projectId: connection.projectId,
        expiresAt: 1_000,
      };
    },
    async bindPendingInstallation() {
      calls.push("bind");
    },
    async completeConnection(state: string, input: { repositoryId: string }) {
      assert.equal(state, "s".repeat(43));
      assert.equal(input.repositoryId, repository.id);
      calls.push("complete");
      return connection;
    },
  } as unknown as GitHubConnectionOperations;
  const maliciousRepository = {
    ...repository,
    fullName: "<script>unsafe()</script>",
  };
  const github = {
    async listInstallationRepositories() {
      return [maliciousRepository];
    },
    async repositoryText() {
      return JSON.stringify({
        scripts: { build: "vite build" },
        devDependencies: { vite: "1.0.0" },
      });
    },
    async getInstallationRepository() {
      calls.push("revalidate");
      return repository;
    },
    async installWorkflow(input: { content: string }) {
      assert.ok(input.content.startsWith(LOKI_WORKFLOW_MARKER));
      calls.push("install");
      return "created";
    },
  } as unknown as GitHubAppClient;
  await withApi(
    { ...baseDependencies(), githubConnections: connections, githubApp: github },
    async (origin) => {
      const response = await fetch(
        `${origin}/v1/github/callback?state=${"s".repeat(43)}&installation_id=77`,
      );
      const body = await response.text();
      assert.equal(response.status, 200);
      assert.match(body, /&lt;script&gt;unsafe\(\)&lt;\/script&gt;/);
      assert.doesNotMatch(body, /<script>unsafe\(\)<\/script>/);
      assert.match(response.headers.get("content-security-policy")!, /form-action 'self'/);
      assert.equal(response.headers.get("cache-control"), "no-store");
      assert.deepEqual(calls, ["pending", "bind"]);
      const configured = await fetch(`${origin}/v1/github/callback`, {
        method: "POST",
        redirect: "manual",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          state: "s".repeat(43),
          installation_id: "77",
          repository_id: repository.id,
          branch: "main",
          rootDirectory: ".",
          buildCommand: "npm run build",
          outputDirectory: "dist",
          artifactName: "loki-finished-build",
        }),
      });
      assert.equal(configured.status, 303);
      assert.equal(
        configured.headers.get("location"),
        "https://play.lokiplay.cc/creator?github=connected",
      );
    },
  );
  assert.deepEqual(calls, [
    "pending",
    "bind",
    "pending",
    "revalidate",
    "install",
    "complete",
  ]);
});

test("failed workflow installation leaves callback state unconsumed", async () => {
  const calls: string[] = [];
  const connections = {
    async getPendingConnection() {
      calls.push("pending");
      return {
        actorId: "actor-id",
        projectId: connection.projectId,
        installationId: "77",
        expiresAt: 1_000,
      };
    },
    async completeConnection() {
      calls.push("complete");
      return connection;
    },
  } as unknown as GitHubConnectionOperations;
  const github = {
    async getInstallationRepository() {
      calls.push("revalidate");
      return repository;
    },
    async installWorkflow() {
      calls.push("install");
      throw new Error("GitHub workflow write failed");
    },
  } as unknown as GitHubAppClient;
  await withApi(
    { ...baseDependencies(), githubConnections: connections, githubApp: github },
    async (origin) => {
      const response = await fetch(`${origin}/v1/github/callback`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          state: "s".repeat(43),
          installation_id: "77",
          repository_id: repository.id,
          branch: "main",
          rootDirectory: ".",
          buildCommand: "npm run build",
          outputDirectory: "dist",
        }),
      });
      assert.equal(response.status, 400);
    },
  );
  assert.deepEqual(calls, ["pending", "revalidate", "install"]);
});

function webhookDependencies(input: {
  accepted: boolean;
  matched?: boolean;
  calls: string[];
}): ApiDependencies {
  const connections = {
    async recordWebhookDelivery() {
      input.calls.push("record");
      return {
        accepted: input.accepted,
        connection: input.matched ? connection : undefined,
      };
    },
    async completeWebhookDelivery(
      _deliveryId: string,
      status: "processed" | "failed" | "ignored",
    ) {
      input.calls.push(status);
      return true;
    },
  } as unknown as GitHubConnectionOperations;
  const github = {
    verifyWebhook() {
      return true;
    },
    async getInstallationRepository() {
      input.calls.push("repository");
      return repository;
    },
    async findRunArtifact() {
      input.calls.push("artifact");
      return {
        id: "99",
        name: connection.artifactName,
        expired: false,
        archiveDownloadUrl: "https://api.github.com/artifact",
      };
    },
    async downloadArtifact() {
      input.calls.push("download");
      return new Uint8Array([1, 2, 3]);
    },
  } as unknown as GitHubAppClient;
  return {
    ...baseDependencies(),
    githubConnections: connections,
    githubApp: github,
    platform: {
      async issueDeploymentCredential(actorId: string, projectId: string) {
        input.calls.push(`credential:${actorId}:${projectId}`);
        return { credentialId: "credential", secret: "secret", expiresAt: 1_000 };
      },
    } as unknown as ApiDependencies["platform"],
    deployments: {
      async deployZip(deployment: { activate?: boolean; archive: Uint8Array }) {
        input.calls.push(`deploy:${deployment.activate}:${deployment.archive.length}`);
        return {};
      },
    } as unknown as ApiDependencies["deployments"],
  };
}

const workflowPayload = (overrides: Record<string, unknown> = {}) => ({
  action: "completed",
  installation: { id: 77 },
  repository: { id: 88 },
  workflow_run: {
    id: 99,
    status: "completed",
    conclusion: "success",
    head_branch: "main",
    path: ".github/workflows/loki-deploy.yml",
    repository: { id: 88 },
    ...overrides,
  },
});

async function postWebhook(
  dependencies: ApiDependencies,
  origin: string,
  payload: unknown,
): Promise<Response> {
  return fetch(`${origin}/v1/github/webhooks`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-github-delivery": "delivery-id",
      "x-github-event": "workflow_run",
      "x-hub-signature-256": `sha256=${"0".repeat(64)}`,
    },
    body: JSON.stringify(payload),
  });
}

test("GitHub webhooks return 200 for duplicates and ignore nonmatching runs", async () => {
  const duplicateCalls: string[] = [];
  await withApi(
    webhookDependencies({ accepted: false, calls: duplicateCalls }),
    async (origin) => {
      const response = await postWebhook(
        webhookDependencies({ accepted: false, calls: duplicateCalls }),
        origin,
        workflowPayload(),
      );
      assert.equal(response.status, 200);
    },
  );
  assert.deepEqual(duplicateCalls, ["record"]);

  const ignoredCalls: string[] = [];
  const ignoredDependencies = webhookDependencies({
    accepted: true,
    matched: true,
    calls: ignoredCalls,
  });
  await withApi(ignoredDependencies, async (origin) => {
    const response = await postWebhook(
      ignoredDependencies,
      origin,
      workflowPayload({ conclusion: "failure" }),
    );
    assert.equal(response.status, 202);
  });
  assert.deepEqual(ignoredCalls, ["record", "ignored"]);
});

test("successful workflow artifact deploys through one-time credentials", async () => {
  const calls: string[] = [];
  const dependencies = webhookDependencies({
    accepted: true,
    matched: true,
    calls,
  });
  await withApi(dependencies, async (origin) => {
    const response = await postWebhook(
      dependencies,
      origin,
      workflowPayload(),
    );
    assert.equal(response.status, 202);
  });
  assert.deepEqual(calls, [
    "record",
    "repository",
    "artifact",
    "download",
    `credential:${connection.createdBy}:${connection.projectId}`,
    "deploy:true:3",
    "processed",
  ]);
});
