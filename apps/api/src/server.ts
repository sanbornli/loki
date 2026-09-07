import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { URL } from "node:url";
import type { CliDeviceAuthorizationOperations } from "./cli-device-auth.js";
import type { DashboardOperations } from "./dashboard.js";
import type { DeploymentDedupOperations } from "./deployment-dedup.js";
import type { DeploymentService } from "./deployments.js";
import {
  githubActionsWorkflow,
  type GitHubAppClient,
  type GitHubRepository,
} from "./github-app.js";
import {
  normalizeGitHubConnectionInput,
  type GitHubConnectionOperations,
} from "./github-connections.js";
import type { NakamaGateway } from "./nakama.js";
import type { PlatformOperations } from "./platform.js";
import type { HostingAuthorization } from "./hosting-auth.js";
import { ServiceError, type SafetyOperations } from "./safety.js";

export interface ApiDependencies {
  platform: PlatformOperations;
  deployments: DeploymentService;
  nakama?: NakamaGateway;
  deviceAuth?: CliDeviceAuthorizationOperations;
  authorizeDeviceApproval?(request: IncomingMessage): Promise<{
    actorId: string;
    accessToken: string;
    accessTokenExpiresAt: number;
  }>;
  deploymentDedup?: DeploymentDedupOperations;
  githubConnections?: GitHubConnectionOperations;
  githubAppSlug?: string;
  githubApp?: GitHubAppClient;
  playableUrl?(projectId: string): string;
  authenticateCreator(request: IncomingMessage): Promise<string>;
  authenticatePlayer?(request: IncomingMessage): Promise<string | undefined>;
  dashboard?: DashboardOperations;
  hostingAuth?: HostingAuthorization;
  safety?: SafetyOperations;
  readiness?(): Promise<Record<string, boolean>>;
  log?(record: Record<string, unknown>): void;
  allowOrigin?(origin: string): boolean;
  captureException?(error: unknown): void;
}

async function readBody(
  request: IncomingMessage,
  limitBytes: number,
): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const bytes = Buffer.from(chunk);
    size += bytes.length;
    if (size > limitBytes) throw new Error("request body too large");
    chunks.push(bytes);
  }
  return Buffer.concat(chunks);
}

function json(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  response.end(`${JSON.stringify(value)}\n`);
}

const htmlEscape = (value: unknown): string =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

function html(response: ServerResponse, status: number, body: string): void {
  response.writeHead(status, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
    "content-security-policy":
      "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
  });
  response.end(body);
}

const formPage = (content: string): string =>
  `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Connect GitHub</title><style>body{font:16px system-ui;max-width:680px;margin:48px auto;padding:0 20px;color:#18181b}label{display:block;margin:18px 0 6px}input,select{box-sizing:border-box;width:100%;padding:10px}button{margin-top:24px;padding:10px 16px}code{word-break:break-all}</style></head><body>${content}</body></html>`;

const hidden = (name: string, value: string): string =>
  `<input type="hidden" name="${htmlEscape(name)}" value="${htmlEscape(value)}">`;

async function detectedRepositoryDefaults(
  github: GitHubAppClient,
  installationId: string,
  repository: GitHubRepository,
): Promise<{ branch: string; rootDirectory: string; buildCommand: string; outputDirectory: string }> {
  let buildCommand = "";
  let outputDirectory = "";
  const source = await github.repositoryText(
    installationId,
    repository,
    "package.json",
  );
  if (source && Buffer.byteLength(source) <= 1024 * 1024) {
    try {
      const packageJson = JSON.parse(source) as {
        packageManager?: unknown;
        scripts?: Record<string, unknown>;
        dependencies?: Record<string, unknown>;
        devDependencies?: Record<string, unknown>;
        loki?: Record<string, unknown>;
      };
      const configured = packageJson.loki;
      if (typeof configured?.buildCommand === "string") {
        buildCommand = configured.buildCommand;
      } else if (typeof packageJson.scripts?.build === "string") {
        const manager =
          typeof packageJson.packageManager === "string"
            ? packageJson.packageManager.split("@")[0]
            : "npm";
        if (["npm", "pnpm", "yarn", "bun"].includes(manager!)) {
          buildCommand = manager === "npm" ? "npm run build" : `${manager} run build`;
        }
      }
      if (typeof configured?.outputDirectory === "string") {
        outputDirectory = configured.outputDirectory;
      } else {
        const packages = {
          ...packageJson.dependencies,
          ...packageJson.devDependencies,
        };
        if ("vite" in packages) outputDirectory = "dist";
        else if ("react-scripts" in packages) outputDirectory = "build";
        else if (
          typeof packageJson.scripts?.build === "string" &&
          /\bnext\s+build\b.*\bnext\s+export\b/.test(packageJson.scripts.build)
        ) {
          outputDirectory = "out";
        }
      }
    } catch {
      // Invalid package metadata is left for the creator to configure explicitly.
    }
  }
  return {
    branch: repository.defaultBranch,
    rootDirectory: ".",
    buildCommand,
    outputDirectory,
  };
}

const field = (label: string, name: string, value: string, required = true): string =>
  `<label for="${htmlEscape(name)}">${htmlEscape(label)}</label><input id="${htmlEscape(
    name,
  )}" name="${htmlEscape(name)}" value="${htmlEscape(value)}"${
    required ? " required" : ""
  }>`;

function configurationPage(input: {
  state: string;
  installationId: string;
  repositories: GitHubRepository[];
  selected?: GitHubRepository;
  defaults?: Awaited<ReturnType<typeof detectedRepositoryDefaults>>;
}): string {
  const options = input.repositories
    .map(
      (repository) =>
        `<option value="${htmlEscape(repository.id)}"${
          repository.id === input.selected?.id ? " selected" : ""
        }>${htmlEscape(repository.fullName)}${repository.private ? " (private)" : ""}</option>`,
    )
    .join("");
  if (!input.selected || !input.defaults) {
    return formPage(
      `<h1>Select a repository</h1><form method="get" action="/v1/github/callback">${hidden(
        "state",
        input.state,
      )}${hidden("installation_id", input.installationId)}<label for="repository_id">Repository</label><select id="repository_id" name="repository_id" required>${options}</select><button type="submit">Configure repository</button></form>`,
    );
  }
  const defaults = input.defaults;
  return formPage(
    `<h1>Configure ${htmlEscape(input.selected.fullName)}</h1><p>Builds run only in GitHub Actions. Loki receives the finished ZIP artifact.</p><form method="post" action="/v1/github/callback">${hidden(
      "state",
      input.state,
    )}${hidden("installation_id", input.installationId)}${hidden(
      "repository_id",
      input.selected.id,
    )}${field("Branch", "branch", defaults.branch)}${field(
      "Root directory",
      "rootDirectory",
      defaults.rootDirectory,
    )}${field("Build command", "buildCommand", defaults.buildCommand)}${field(
      "Output directory",
      "outputDirectory",
      defaults.outputDirectory,
    )}${field(
      "Artifact name",
      "artifactName",
      "loki-finished-build",
    )}<button type="submit">Finish connection</button></form>`,
  );
}

interface GitHubWorkflowRunPayload {
  action?: unknown;
  installation?: { id?: unknown };
  repository?: { id?: unknown };
  workflow_run?: {
    id?: unknown;
    status?: unknown;
    conclusion?: unknown;
    head_branch?: unknown;
    path?: string;
    repository?: { id?: unknown };
  };
}

export function createApiHandler(dependencies: ApiDependencies) {
  return async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    const requestId =
      typeof request.headers["x-request-id"] === "string" &&
      /^[A-Za-z0-9_-]{8,128}$/.test(request.headers["x-request-id"])
        ? request.headers["x-request-id"]
        : randomUUID();
    const startedAt = Date.now();
    response.setHeader("x-request-id", requestId);
    response.once("finish", () => {
      dependencies.log?.({
        type: "request",
        requestId,
        method: request.method,
        path: (request.url ?? "/").split("?", 1)[0],
        status: response.statusCode,
        durationMs: Date.now() - startedAt,
      });
    });
    try {
      const url = new URL(request.url ?? "/", "http://api.local");
      const origin = request.headers.origin;
      if (origin && dependencies.allowOrigin?.(origin)) {
        response.setHeader("access-control-allow-origin", origin);
        response.setHeader("access-control-allow-credentials", "true");
        response.setHeader("vary", "Origin");
      }
      if (request.method === "OPTIONS") {
        response.writeHead(204, {
          "access-control-allow-methods": "GET, POST, PATCH, DELETE, OPTIONS",
          "access-control-allow-headers":
            "authorization, content-type, x-loki-credential-id, x-loki-play-invite, x-loki-terms-version, x-loki-privacy-version, x-loki-aup-version, x-request-id",
          "access-control-max-age": "86400",
        });
        response.end();
        return;
      }
      if (
        request.method === "GET" &&
        (url.pathname === "/health" || url.pathname === "/health/live")
      ) {
        json(response, 200, { ok: true });
        return;
      }
      if (request.method === "GET" && url.pathname === "/health/ready") {
        const checks = (await dependencies.readiness?.()) ?? {};
        const ok = Object.values(checks).every(Boolean);
        json(response, ok ? 200 : 503, { ok, checks });
        return;
      }
      const limitedOperations: Record<string, { limit: number; window: number }> = {
        "/v1/projects": { limit: 20, window: 3600 },
        "/v1/organizations": { limit: 10, window: 3600 },
        "/v1/cli/device": { limit: 20, window: 60 },
        "/v1/player-sessions": { limit: 60, window: 60 },
        "/v1/deployments": { limit: 20, window: 3600 },
        "/v1/github/webhooks": { limit: 300, window: 60 },
      };
      const rate =
        limitedOperations[url.pathname] ??
        (/^\/v1\/projects\/[0-9a-f-]{36}\/deployment-credentials$/i.test(url.pathname)
          ? { limit: 20, window: 3600 }
          : undefined);
      if (rate && dependencies.safety) {
        await dependencies.safety.rateLimit(
          request.socket.remoteAddress ?? "unknown",
          `${request.method}:${url.pathname}`,
          rate.limit,
          rate.window,
        );
      }
      if (
        url.pathname === "/v1/github/callback" &&
        (request.method === "GET" || request.method === "POST")
      ) {
        if (!dependencies.githubConnections || !dependencies.githubApp) {
          json(response, 501, { error: "GitHub connection is not configured" });
          return;
        }
        if (request.method === "GET") {
          const state = url.searchParams.get("state") ?? "";
          const installationId = url.searchParams.get("installation_id") ?? "";
          const selectedRepositoryId = url.searchParams.get("repository_id");
          await dependencies.githubConnections.getPendingConnection(state);
          const repositories =
            await dependencies.githubApp.listInstallationRepositories(installationId);
          if (!repositories.length) throw new Error("installation has no accessible repositories");
          await dependencies.githubConnections.bindPendingInstallation(
            state,
            installationId,
          );
          const selected =
            repositories.find((repository) => repository.id === selectedRepositoryId) ??
            (repositories.length === 1 ? repositories[0] : undefined);
          if (selectedRepositoryId && !selected) {
            throw new Error("repository is not accessible to installation");
          }
          const defaults = selected
            ? await detectedRepositoryDefaults(
                dependencies.githubApp,
                installationId,
                selected,
              )
            : undefined;
          html(
            response,
            200,
            configurationPage({
              state,
              installationId,
              repositories,
              selected,
              defaults,
            }),
          );
          return;
        }
        const contentType = request.headers["content-type"] ?? "";
        if (!contentType.toLowerCase().startsWith("application/x-www-form-urlencoded")) {
          throw new Error("GitHub configuration must be form encoded");
        }
        const form = new URLSearchParams(
          (await readBody(request, 32 * 1024)).toString("utf8"),
        );
        const state = form.get("state") ?? "";
        const installationId = form.get("installation_id") ?? "";
        const repositoryId = form.get("repository_id") ?? "";
        await dependencies.githubConnections.getPendingConnection(
          state,
          installationId,
        );
        const repository = await dependencies.githubApp.getInstallationRepository(
          installationId,
          repositoryId,
        );
        const configuration = normalizeGitHubConnectionInput({
          installationId,
          repositoryId: repository.id,
          repositoryOwner: repository.owner,
          repositoryName: repository.name,
          branch: form.get("branch") ?? "",
          rootDirectory: form.get("rootDirectory") ?? ".",
          buildCommand: form.get("buildCommand") ?? "",
          outputDirectory: form.get("outputDirectory") ?? "",
          artifactName: form.get("artifactName") ?? "loki-finished-build",
        });
        await dependencies.githubApp.installWorkflow({
          installationId,
          repository,
          branch: configuration.branch,
          workflowFile: configuration.workflowFile,
          content: githubActionsWorkflow({
            branch: configuration.branch,
            rootDirectory: configuration.rootDirectory,
            buildCommand: configuration.buildCommand,
            outputDirectory: configuration.outputDirectory,
            artifactName: configuration.artifactName,
          }),
        });
        await dependencies.githubConnections.completeConnection(
          state,
          configuration,
        );
        response.writeHead(303, {
          location: "https://play.lokiplay.cc/creator?github=connected",
          "cache-control": "no-store",
          "referrer-policy": "no-referrer",
        });
        response.end();
        return;
      }
      if (request.method === "POST" && url.pathname === "/v1/github/webhooks") {
        if (!dependencies.githubConnections || !dependencies.githubApp) {
          json(response, 501, { error: "GitHub connection is not configured" });
          return;
        }
        const payloadBytes = await readBody(request, 2 * 1024 * 1024);
        const signatureHeader = request.headers["x-hub-signature-256"];
        const signature =
          typeof signatureHeader === "string" ? signatureHeader : undefined;
        if (!dependencies.githubApp.verifyWebhook(payloadBytes, signature)) {
          json(response, 401, { error: "invalid GitHub webhook signature" });
          return;
        }
        const deliveryHeader = request.headers["x-github-delivery"];
        const eventHeader = request.headers["x-github-event"];
        if (
          typeof deliveryHeader !== "string" ||
          typeof eventHeader !== "string"
        ) {
          throw new Error("GitHub webhook headers are required");
        }
        let payload: GitHubWorkflowRunPayload;
        try {
          payload = JSON.parse(payloadBytes.toString("utf8")) as GitHubWorkflowRunPayload;
        } catch {
          throw new Error("invalid GitHub webhook JSON");
        }
        const installationId = String(payload.installation?.id ?? "");
        const repositoryId = String(payload.repository?.id ?? "");
        const recorded = await dependencies.githubConnections.recordWebhookDelivery({
          deliveryId: deliveryHeader,
          installationId,
          repositoryId,
          eventName: eventHeader,
          payload: payloadBytes,
        });
        if (!recorded.accepted) {
          json(response, 200, { duplicate: true });
          return;
        }
        const connection = recorded.connection;
        const run = payload.workflow_run;
        const workflowPath = run?.path?.split("@", 1)[0];
        const matches =
          eventHeader === "workflow_run" &&
          payload.action === "completed" &&
          run?.status === "completed" &&
          run.conclusion === "success" &&
          String(run.repository?.id ?? repositoryId) === repositoryId &&
          run.head_branch === connection?.branch &&
          workflowPath === connection?.workflowFile;
        if (!connection || !matches) {
          await dependencies.githubConnections.completeWebhookDelivery(
            deliveryHeader,
            "ignored",
          );
          json(response, 202, { accepted: true });
          return;
        }
        try {
          const repository = await dependencies.githubApp.getInstallationRepository(
            connection.installationId,
            connection.repositoryId,
          );
          const artifact = await dependencies.githubApp.findRunArtifact(
            connection.installationId,
            repository,
            String(run.id),
            connection.artifactName,
          );
          const archive = await dependencies.githubApp.downloadArtifact(
            connection.installationId,
            artifact,
          );
          const credential =
            await dependencies.platform.issueDeploymentCredential(
              connection.createdBy,
              connection.projectId,
            );
          await dependencies.deployments.deployZip({
            credentialId: credential.credentialId,
            secret: credential.secret,
            archive,
            activate: true,
          });
          await dependencies.githubConnections.completeWebhookDelivery(
            deliveryHeader,
            "processed",
          );
        } catch (error) {
          dependencies.captureException?.(error);
          const errorMessage =
            error instanceof Error ? error.message.slice(0, 2000) : "webhook processing failed";
          await dependencies.githubConnections.completeWebhookDelivery(
            deliveryHeader,
            "failed",
            errorMessage,
          );
        }
        json(response, 202, { accepted: true });
        return;
      }
      if (request.method === "POST" && url.pathname === "/v1/deployments") {
        const credentialId = request.headers["x-loki-credential-id"];
        const authorization = request.headers.authorization;
        if (
          typeof credentialId !== "string" ||
          !authorization?.startsWith("Bearer ")
        ) {
          json(response, 401, { error: "deployment credential required" });
          return;
        }
        const archive = await readBody(request, 25 * 1024 * 1024);
        const deployment = await dependencies.deployments.deployZip({
          credentialId,
          secret: authorization.slice("Bearer ".length),
          archive,
          activate: url.searchParams.get("activate") === "true",
        });
        json(response, deployment.status === "blocked" ? 422 : 201, {
          ...deployment,
          playableUrl: dependencies.playableUrl?.(deployment.projectId),
        });
        return;
      }
      if (request.method === "POST" && url.pathname === "/v1/reports") {
        if (!dependencies.safety) throw new Error("reporting unavailable");
        const reporterAccountId = await dependencies.authenticatePlayer?.(request);
        const input = JSON.parse((await readBody(request, 16 * 1024)).toString("utf8")) as {
          projectId?: string;
          deploymentId?: string;
          category?: string;
          summary?: string;
          evidenceRefs?: string[];
        };
        json(response, 201, await dependencies.safety.createReport({
          reporterAccountId,
          projectId: input.projectId,
          deploymentId: input.deploymentId,
          category: input.category ?? "",
          summary: input.summary ?? "",
          evidenceRefs: input.evidenceRefs,
        }));
        return;
      }
      if (request.method === "GET" && url.pathname === "/v1/operator/reports") {
        if (!dependencies.safety) throw new Error("reporting unavailable");
        const actorId = await dependencies.authenticateCreator(request);
        json(response, 200, await dependencies.safety.listReports(
          actorId,
          url.searchParams.get("status") ?? "open",
        ));
        return;
      }
      if (request.method === "POST" && url.pathname === "/v1/cli/device") {
        if (!dependencies.deviceAuth) throw new Error("device authentication unavailable");
        json(response, 201, await dependencies.deviceAuth.begin());
        return;
      }
      if (request.method === "POST" && url.pathname === "/v1/cli/device/approve") {
        if (!dependencies.deviceAuth || !dependencies.authorizeDeviceApproval) {
          throw new Error("device authentication unavailable");
        }
        const approval = await dependencies.authorizeDeviceApproval(request);
        const input = JSON.parse(
          (await readBody(request, 8 * 1024)).toString("utf8"),
        ) as { userCode?: string };
        if (!input.userCode) throw new Error("userCode is required");
        await dependencies.deviceAuth.approve({
          userCode: input.userCode,
          ...approval,
        });
        response.writeHead(204, { "cache-control": "no-store" });
        response.end();
        return;
      }
      const devicePoll = url.pathname.match(/^\/v1\/cli\/device\/([A-Za-z0-9_-]+)$/);
      if (request.method === "GET" && devicePoll) {
        if (!dependencies.deviceAuth) throw new Error("device authentication unavailable");
        const result = await dependencies.deviceAuth.poll(devicePoll[1]!);
        if (result.status === "pending") {
          json(response, 202, { status: "pending" });
        } else {
          json(response, 200, { accessToken: result.accessToken });
        }
        return;
      }
      if (request.method === "POST" && url.pathname === "/v1/organizations") {
        const actorId = await dependencies.authenticateCreator(request);
        const input = JSON.parse(
          (await readBody(request, 8 * 1024)).toString("utf8"),
        ) as { name?: string };
        if (!input.name) throw new Error("organization name is required");
        json(
          response,
          201,
          await dependencies.platform.createOrganization(actorId, input.name),
        );
        return;
      }
      if (request.method === "POST" && url.pathname === "/v1/projects") {
        const actorId = await dependencies.authenticateCreator(request);
        await dependencies.safety?.meter(
          "account",
          actorId,
          "projects",
          1,
          30 * 24 * 60 * 60,
        );
        const input = JSON.parse(
          (await readBody(request, 8 * 1024)).toString("utf8"),
        ) as { organizationId?: string; name?: string; slug?: string };
        if (!input.organizationId || !input.name || !input.slug) {
          throw new Error("organizationId, name, and slug are required");
        }
        json(
          response,
          201,
          await dependencies.platform.createProject(
            actorId,
            input.organizationId,
            { name: input.name, slug: input.slug },
          ),
        );
        return;
      }
      if (request.method === "GET" && url.pathname === "/v1/creator/overview") {
        if (!dependencies.dashboard) throw new Error("dashboard unavailable");
        const actorId = await dependencies.authenticateCreator(request);
        json(response, 200, await dependencies.dashboard.creatorOverview(actorId));
        return;
      }
      if (request.method === "GET" && url.pathname === "/v1/catalog") {
        if (!dependencies.dashboard) throw new Error("catalog unavailable");
        json(response, 200, await dependencies.dashboard.publicCatalog());
        return;
      }
      if (request.method === "GET" && url.pathname === "/v1/operator/overview") {
        if (!dependencies.dashboard) throw new Error("operator console unavailable");
        const actorId = await dependencies.authenticateCreator(request);
        json(response, 200, await dependencies.dashboard.operatorOverview(actorId));
        return;
      }
      if (request.method === "GET" && url.pathname === "/v1/operator/projects") {
        if (!dependencies.dashboard) throw new Error("operator console unavailable");
        const actorId = await dependencies.authenticateCreator(request);
        json(response, 200, await dependencies.dashboard.operatorProjects(actorId));
        return;
      }
      if (request.method === "GET" && url.pathname === "/v1/operator/audit") {
        if (!dependencies.dashboard) throw new Error("operator console unavailable");
        const actorId = await dependencies.authenticateCreator(request);
        const requestedLimit = Number(url.searchParams.get("limit") ?? 100);
        json(
          response,
          200,
          await dependencies.dashboard.operatorAudit(actorId, requestedLimit),
        );
        return;
      }
      const projectMatch = url.pathname.match(/^\/v1\/projects\/([0-9a-f-]{36})$/i);
      const projectStateMatch = url.pathname.match(
        /^\/v1\/projects\/([0-9a-f-]{36})\/state$/i,
      );
      const projectDeploymentsMatch = url.pathname.match(
        /^\/v1\/projects\/([0-9a-f-]{36})\/deployments$/i,
      );
      const deploymentHashMatch = url.pathname.match(
        /^\/v1\/projects\/([0-9a-f-]{36})\/deployments\/by-hash\/([a-f0-9]{64})$/i,
      );
      const activationMatch = url.pathname.match(
        /^\/v1\/projects\/([0-9a-f-]{36})\/deployments\/([0-9a-f-]{36})\/activate$/i,
      );
      const operatorStateMatch = url.pathname.match(
        /^\/v1\/operator\/projects\/([0-9a-f-]{36})\/state$/i,
      );
      const credentialMatch = url.pathname.match(
        /^\/v1\/projects\/([0-9a-f-]{36})\/deployment-credentials$/i,
      );
      const githubConnectMatch = url.pathname.match(
        /^\/v1\/projects\/([0-9a-f-]{36})\/github\/connect$/i,
      );
      const githubConnectionMatch = url.pathname.match(
        /^\/v1\/projects\/([0-9a-f-]{36})\/github\/connection$/i,
      );
      const githubActionsMatch = url.pathname.match(
        /^\/v1\/projects\/([0-9a-f-]{36})\/github\/actions-configuration$/i,
      );
      const playInviteMatch = url.pathname.match(
        /^\/v1\/projects\/([0-9a-f-]{36})\/play-invites$/i,
      );
      const reportResolveMatch = url.pathname.match(
        /^\/v1\/operator\/reports\/([0-9a-f-]{36})$/i,
      );
      const projectSuspensionMatch = url.pathname.match(
        /^\/v1\/operator\/projects\/([0-9a-f-]{36})\/suspension$/i,
      );
      const accountSuspensionMatch = url.pathname.match(
        /^\/v1\/operator\/accounts\/([0-9a-f-]{36})\/suspension$/i,
      );
      const securityReviewMatch = url.pathname.match(
        /^\/v1\/operator\/deployments\/([0-9a-f-]{36})\/security-review$/i,
      );
      if (request.method === "POST" && playInviteMatch) {
        if (!dependencies.hostingAuth) throw new Error("play invites unavailable");
        const actorId = await dependencies.authenticateCreator(request);
        const input = JSON.parse((await readBody(request, 8 * 1024)).toString("utf8") || "{}") as {
          expiresInSeconds?: number;
        };
        json(response, 201, await dependencies.hostingAuth.createInvite(
          actorId,
          playInviteMatch[1]!,
          input.expiresInSeconds,
        ));
        return;
      }
      if (request.method === "PATCH" && reportResolveMatch) {
        if (!dependencies.safety) throw new Error("reporting unavailable");
        const actorId = await dependencies.authenticateCreator(request);
        const input = JSON.parse((await readBody(request, 8 * 1024)).toString("utf8")) as {
          status?: "resolved" | "dismissed";
          resolution?: string;
        };
        if (!input.status || !input.resolution) throw new Error("status and resolution are required");
        await dependencies.safety.resolveReport(actorId, reportResolveMatch[1]!, input.status, input.resolution);
        json(response, 200, { status: input.status });
        return;
      }
      if (request.method === "PATCH" && projectSuspensionMatch) {
        if (!dependencies.safety) throw new Error("safety controls unavailable");
        const actorId = await dependencies.authenticateCreator(request);
        const input = JSON.parse((await readBody(request, 8 * 1024)).toString("utf8")) as {
          suspended?: boolean;
          reason?: string;
        };
        if (typeof input.suspended !== "boolean" || !input.reason) throw new Error("suspended and reason are required");
        await dependencies.safety.setProjectSuspension(
          actorId,
          projectSuspensionMatch[1]!,
          input.suspended,
          input.reason,
        );
        json(response, 200, { suspended: input.suspended });
        return;
      }
      if (request.method === "PATCH" && accountSuspensionMatch) {
        if (!dependencies.safety) throw new Error("safety controls unavailable");
        const actorId = await dependencies.authenticateCreator(request);
        const input = JSON.parse((await readBody(request, 8 * 1024)).toString("utf8")) as {
          suspended?: boolean;
          reason?: string;
        };
        if (typeof input.suspended !== "boolean" || !input.reason) throw new Error("suspended and reason are required");
        await dependencies.safety.setAccountSuspension(
          actorId,
          accountSuspensionMatch[1]!,
          input.suspended,
          input.reason,
        );
        json(response, 200, { suspended: input.suspended });
        return;
      }
      if (request.method === "PATCH" && securityReviewMatch) {
        if (!dependencies.safety) throw new Error("security review unavailable");
        const actorId = await dependencies.authenticateCreator(request);
        const input = JSON.parse((await readBody(request, 16 * 1024)).toString("utf8")) as {
          approved?: boolean;
          evidenceRefs?: string[];
        };
        if (typeof input.approved !== "boolean" || !Array.isArray(input.evidenceRefs)) {
          throw new Error("approved and evidenceRefs are required");
        }
        await dependencies.safety.resolveSecurityReview(
          actorId,
          securityReviewMatch[1]!,
          input.approved,
          input.evidenceRefs,
        );
        json(response, 200, { approved: input.approved });
        return;
      }
      if (request.method === "PATCH" && url.pathname === "/v1/operator/play-switch") {
        if (!dependencies.safety) throw new Error("safety controls unavailable");
        const actorId = await dependencies.authenticateCreator(request);
        const input = JSON.parse((await readBody(request, 8 * 1024)).toString("utf8")) as {
          disabled?: boolean;
          reason?: string;
        };
        if (typeof input.disabled !== "boolean" || !input.reason) throw new Error("disabled and reason are required");
        await dependencies.safety.setGlobalPlayDisabled(actorId, input.disabled, input.reason);
        json(response, 200, { disabled: input.disabled });
        return;
      }
      if (request.method === "GET" && deploymentHashMatch) {
        if (!dependencies.deploymentDedup) throw new Error("deployment lookup unavailable");
        const actorId = await dependencies.authenticateCreator(request);
        const deployment = await dependencies.deploymentDedup.findExisting(
          actorId,
          deploymentHashMatch[1]!,
          deploymentHashMatch[2]!.toLowerCase(),
        );
        if (!deployment) {
          json(response, 404, { error: "deployment not found" });
        } else {
          json(response, 200, {
            ...deployment,
            playableUrl: dependencies.playableUrl?.(deployment.projectId),
          });
        }
        return;
      }
      if (request.method === "POST" && githubConnectMatch) {
        if (
          !dependencies.githubConnections ||
          !dependencies.githubAppSlug
        ) {
          json(response, 501, { error: "GitHub connection is not configured" });
          return;
        }
        const actorId = await dependencies.authenticateCreator(request);
        const connection = await dependencies.githubConnections.beginConnection(
          actorId,
          githubConnectMatch[1]!,
        );
        json(response, 201, {
          authorizationUrl:
            `https://github.com/apps/${encodeURIComponent(dependencies.githubAppSlug)}` +
            `/installations/new?state=${encodeURIComponent(connection.state)}`,
          expiresAt: connection.expiresAt,
        });
        return;
      }
      if (request.method === "GET" && githubConnectionMatch) {
        if (!dependencies.githubConnections) {
          json(response, 501, { error: "GitHub connection is not configured" });
          return;
        }
        const actorId = await dependencies.authenticateCreator(request);
        json(
          response,
          200,
          await dependencies.githubConnections.getConnection(
            actorId,
            githubConnectionMatch[1]!,
          ),
        );
        return;
      }
      if (request.method === "GET" && githubActionsMatch) {
        if (!dependencies.githubConnections) {
          json(response, 501, { error: "GitHub connection is not configured" });
          return;
        }
        const actorId = await dependencies.authenticateCreator(request);
        json(
          response,
          200,
          await dependencies.githubConnections.actionsDeploymentConfiguration(
            actorId,
            githubActionsMatch[1]!,
          ),
        );
        return;
      }
      if (request.method === "GET" && projectDeploymentsMatch) {
        if (!dependencies.dashboard) throw new Error("dashboard unavailable");
        const actorId = await dependencies.authenticateCreator(request);
        json(
          response,
          200,
          await dependencies.dashboard.projectDeployments(
            actorId,
            projectDeploymentsMatch[1]!,
          ),
        );
        return;
      }
      if (request.method === "POST" && activationMatch) {
        const actorId = await dependencies.authenticateCreator(request);
        json(
          response,
          200,
          await dependencies.platform.setActiveDeployment(
            actorId,
            activationMatch[1]!,
            activationMatch[2]!,
          ),
        );
        return;
      }
      if (request.method === "PATCH" && operatorStateMatch) {
        if (!dependencies.dashboard) throw new Error("operator console unavailable");
        const actorId = await dependencies.authenticateCreator(request);
        const input = JSON.parse(
          (await readBody(request, 8 * 1024)).toString("utf8"),
        ) as { state?: "private" | "unlisted" | "published" | "suspended" };
        if (!input.state) throw new Error("state is required");
        json(
          response,
          200,
          await dependencies.dashboard.operatorTransitionProject(
            actorId,
            operatorStateMatch[1]!,
            input.state,
          ),
        );
        return;
      }
      if (request.method === "POST" && credentialMatch) {
        const actorId = await dependencies.authenticateCreator(request);
        await dependencies.safety?.meter(
          "project",
          credentialMatch[1]!,
          "deployment_credentials",
          1,
          30 * 24 * 60 * 60,
        );
        json(
          response,
          201,
          await dependencies.platform.issueDeploymentCredential(
            actorId,
            credentialMatch[1]!,
          ),
        );
        return;
      }
      if (request.method === "PATCH" && projectStateMatch) {
        const actorId = await dependencies.authenticateCreator(request);
        const input = JSON.parse(
          (await readBody(request, 8 * 1024)).toString("utf8"),
        ) as { state?: "draft" | "private" | "unlisted" | "review_requested" | "published" | "suspended" };
        if (!input.state) throw new Error("state is required");
        json(
          response,
          200,
          await dependencies.platform.transitionProject(
            actorId,
            projectStateMatch[1]!,
            input.state,
          ),
        );
        return;
      }
      if (request.method === "GET" && projectMatch) {
        const actorId = await dependencies.authenticateCreator(request);
        json(
          response,
          200,
          await dependencies.platform.getProject(actorId, projectMatch[1]!),
        );
        return;
      }
      if (request.method === "POST" && url.pathname === "/v1/player-sessions") {
        const input = JSON.parse(
          (await readBody(request, 8 * 1024)).toString("utf8"),
        ) as { projectId?: string; playerId?: string; guest?: boolean };
        if (!input.projectId) throw new Error("projectId is required");
        const authenticatedPlayerId =
          await dependencies.authenticatePlayer?.(request);
        if (dependencies.hostingAuth) {
          await dependencies.hostingAuth.authorizeRequest(
            request,
            input.projectId,
            authenticatedPlayerId,
          );
        } else {
          await dependencies.platform.playableProject(input.projectId);
        }
        await dependencies.safety?.meter(
          "project",
          input.projectId,
          authenticatedPlayerId ? "player_sessions" : "guest_sessions",
          1,
          30 * 24 * 60 * 60,
        );
        const token = await dependencies.platform.issuePlayerSession(
          input.projectId,
          authenticatedPlayerId,
          authenticatedPlayerId ? false : (input.guest ?? true),
        );
        json(response, 201, { token, expiresIn: 600 });
        return;
      }
      if (request.method === "POST" && url.pathname === "/v1/nakama-session") {
        if (!dependencies.nakama) throw new Error("Nakama gateway unavailable");
        const authorization = request.headers.authorization;
        if (!authorization?.startsWith("Bearer ")) {
          json(response, 401, { error: "player session required" });
          return;
        }
        json(
          response,
          201,
          await dependencies.nakama.exchangePlayerToken(
            authorization.slice("Bearer ".length),
          ),
        );
        return;
      }
      json(response, 404, { error: "not found" });
    } catch (error) {
      dependencies.captureException?.(error);
      const message = error instanceof Error ? error.message : "request failed";
      const status = error instanceof ServiceError ? error.status :
        /authentication required|session required|deployment credential required/i.test(
          message,
        )
          ? 401
          : /access denied|admin required|not authorized/i.test(message)
            ? 403
            : /not found/i.test(message)
              ? 404
              : 400;
      json(response, status, {
        error: message,
        code: error instanceof ServiceError ? error.code : "REQUEST_FAILED",
        requestId,
      });
    }
  };
}

export function startApiServer(
  dependencies: ApiDependencies,
  port = 8787,
  host = "127.0.0.1",
): ReturnType<typeof createServer> {
  const server = createServer((request, response) => {
    void createApiHandler(dependencies)(request, response);
  });
  return server.listen(port, host);
}
