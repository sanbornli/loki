import { GameManifestSchema } from "../../protocol/src/index.js";

export const lokiResources = [
  {
    uri: "loki://docs/integration",
    name: "Loki integration guide",
    mimeType: "text/markdown",
    text: [
      "# Loki integration",
      "Use @lokiplay/sdk and a host-authoritative room.",
      "Prefer createSynchronizedRoom for shared state. Keep synchronized state compact and JSON-compatible; reducers must be synchronous, deterministic, and free of rendering, timers, networking, or other I/O.",
      "Let the SDK own page lifecycle, socket replacement, retries, snapshots, and pending-action replay. Keep the same client and room while interrupted. Never leave, close, disconnect, reload, or replace a room because of visibility, page, focus, or network lifecycle events.",
      "Dispatch only while connected. During suspended, reconnecting, or resynchronizing, lock authoritative input, preserve rendered state, show a temporary reconnecting message, and wait for an authoritative snapshot. Do not assume host authority survives reconnect.",
      "Do not repeat unresolved actions under new IDs. Treat indeterminate confirmation as an unknown outcome, room_closed as terminal, and leave_failed as requiring resolution before another room.",
      "Use a mobile viewport with viewport-fit=cover without globally disabling zoom. Fill 100dvh with a 100vh fallback, account for safe areas, recalculate container layout on viewport changes, and avoid document scrolling during play.",
      "Use Pointer Events across touch and desktop input, scoped touch-action, pointer capture and cancellation handling, 44x44 CSS-pixel primary targets, and no hover-only controls.",
      "For canvas games, separate CSS and backing size, cap devicePixelRatio reasonably, and resize and redraw without replacing the canvas. Use one controlled requestAnimationFrame loop and pause or throttle rendering while hidden without leaving the room.",
      "Report mobile Safari and Android Chrome coverage without claiming real-device testing unless it actually occurred.",
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
      packages: ["@lokiplay/sdk@0.2.3", "@lokiplay/ui-web@0.2.3"],
      command: "npm install @lokiplay/sdk@0.2.3 @lokiplay/ui-web@0.2.3",
      apiOrigin: "https://api.lokiplay.cc",
      authority: "host",
      rankedIntegrity: false,
      synchronizedRooms: true,
      guidance:
        "Prefer createSynchronizedRoom for shared state. Let Loki own lifecycle reconnect and pending-action replay; never leave or replace a room on browser visibility, page, focus, or network events. Dispatch only while connected and preserve authoritative state while suspended, reconnecting, or resynchronizing. Use responsive safe-area-aware viewport sizing, Pointer Events for touch and desktop, and bounded canvas resolution and rendering. Low-level sendAction and sendHostState remain supported.",
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
        message: "Install and initialize @lokiplay/sdk@0.2.3.",
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
