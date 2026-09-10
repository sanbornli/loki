import { GameManifestSchema } from "../../protocol/src/index.js";

export const lokiResources = [
  {
    uri: "loki://docs/integration",
    name: "Loki integration guide",
    mimeType: "text/markdown",
    text: [
      "# Loki integration",
      "Use @lokiplay/sdk and a host-authoritative room.",
      "Prefer createSynchronizedRoom for shared state.",
      "Production multiplayer requires a Loki-hosted build.",
      "Never include backend source, secrets, localhost URLs, or creator ad scripts.",
    ].join("\n\n"),
  },
  {
    uri: "loki://schemas/game-manifest",
    name: "game.json schema",
    mimeType: "application/json",
    text: JSON.stringify({
      schemaVersion: 1,
      authority: "host",
      maxPlayers: "1..16",
      tickRate: "1..10",
    }),
  },
] as const;

export const lokiTools = [
  {
    name: "create_project",
    description: "Create a Loki project in an authenticated organization.",
  },
  {
    name: "validate_manifest",
    description: "Validate a Loki game.json manifest before deployment.",
  },
  {
    name: "create_deployment_credential",
    description: "Issue a short-lived one-use credential for a project upload.",
  },
  {
    name: "deployment_status",
    description: "Read deployment compatibility and activation status.",
  },
  {
    name: "integration_requirements",
    description: "Return exact production package names and multiplayer constraints.",
  },
  {
    name: "diagnose_multiplayer",
    description: "Diagnose common obsolete or unsafe multiplayer integration patterns.",
  },
] as const;

export interface LokiMcpApi {
  createProject(input: {
    organizationId: string;
    name: string;
    slug: string;
  }): Promise<unknown>;
  createDeploymentCredential(projectId: string): Promise<unknown>;
  deploymentStatus(projectId: string, deploymentId: string): Promise<unknown>;
}

export async function callLokiTool(
  api: LokiMcpApi,
  name: string,
  input: Record<string, unknown>,
): Promise<unknown> {
  if (name === "create_project") {
    if (
      typeof input.organizationId !== "string" ||
      typeof input.name !== "string" ||
      typeof input.slug !== "string"
    ) {
      throw new Error("organizationId, name, and slug are required");
    }
    return api.createProject({
      organizationId: input.organizationId,
      name: input.name,
      slug: input.slug,
    });
  }
  if (name === "validate_manifest") {
    const manifest = GameManifestSchema.parse(input.manifest);
    return { valid: true, manifest };
  }
  if (name === "create_deployment_credential") {
    if (typeof input.projectId !== "string") {
      throw new Error("projectId is required");
    }
    return api.createDeploymentCredential(input.projectId);
  }
  if (name === "deployment_status") {
    if (
      typeof input.projectId !== "string" ||
      typeof input.deploymentId !== "string"
    ) {
      throw new Error("projectId and deploymentId are required");
    }
    return api.deploymentStatus(input.projectId, input.deploymentId);
  }
  if (name === "integration_requirements") {
    return {
      packages: ["@lokiplay/sdk@0.2.2", "@lokiplay/ui-web@0.2.2"],
      command: "npm install @lokiplay/sdk@0.2.2 @lokiplay/ui-web@0.2.2",
      apiOrigin: "https://api.lokiplay.cc",
      authority: "host",
      rankedIntegrity: false,
      synchronizedRooms: true,
      guidance:
        "Prefer createSynchronizedRoom for shared state. Low-level sendAction and sendHostState remain supported.",
    };
  }
  if (name === "diagnose_multiplayer") {
    const sources = Array.isArray(input.sources)
      ? input.sources.filter((source): source is string => typeof source === "string")
      : [];
    const joined = sources.join("\n");
    const findings: Array<{ code: string; message: string }> = [];
    if (/socket\.io-client|\/socket\.io\b/i.test(joined)) {
      findings.push({
        code: "OBSOLETE_SOCKET_IO",
        message: "Replace the creator backend with @lokiplay/sdk FirstPartyTransport.",
      });
    }
    if (/@heroiclabs\/nakama-js|\b7350\b/i.test(joined)) {
      findings.push({
        code: "DIRECT_NAKAMA",
        message: "Game code must use @lokiplay/sdk and must not depend on Nakama types.",
      });
    }
    if (/localhost|127\.0\.0\.1/i.test(joined)) {
      findings.push({
        code: "LOCAL_ENDPOINT",
        message: "Use https://api.lokiplay.cc or an explicit non-production override.",
      });
    }
    if (/<script\b(?![^>]*\bsrc\s*=)[^>]*>/i.test(joined) || /\son[a-z]+\s*=/i.test(joined)) {
      findings.push({
        code: "INLINE_SCRIPT",
        message:
          "Move JavaScript into a same-origin .js file. Inline <script> tags and event handlers are blocked by Loki CSP.",
      });
    }
    if (/fonts\.googleapis\.com|fonts\.gstatic\.com/i.test(joined)) {
      findings.push({
        code: "REMOTE_FONT",
        message: "Self-host font files. Google Fonts and other remote stylesheets are blocked by Loki CSP.",
      });
    }
    if (/<form\b/i.test(joined)) {
      findings.push({
        code: "SANDBOX_FORM",
        message:
          "The Loki iframe does not allow form submission. Use <button type=\"button\"> and JavaScript click handlers.",
      });
    }
    if (!/@lokiplay\/sdk|FirstPartyTransport|LokiClient/.test(joined)) {
      findings.push({
        code: "SDK_NOT_DETECTED",
        message: "Install and initialize @lokiplay/sdk@0.2.2.",
      });
    }
    if (
      /sendHostState|sendAction/.test(joined) &&
      !/createSynchronizedRoom/.test(joined)
    ) {
      findings.push({
        code: "MANUAL_SYNCHRONIZATION",
        message:
          "Prefer createSynchronizedRoom so Loki owns versions, retries, and membership.",
      });
    }
    return { ok: findings.length === 0, findings };
  }
  throw new Error(`unknown Loki tool: ${name}`);
}
