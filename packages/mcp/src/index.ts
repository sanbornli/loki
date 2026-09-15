import { GameManifestSchema } from "../../protocol/src/index.js";

export const lokiResources = [
  {
    uri: "loki://docs/integration",
    name: "Loki integration guide",
    mimeType: "text/markdown",
    text: [
      "# Loki integration",
      "Use @lokiplay/sdk and a host-authoritative room.",
      "Create rooms with createRoom() and join with joinRoom({ inviteCode }). Installing the SDK does not add a create/join screen. If the game has no usable room-entry flow, add a minimal lobby or an automatic create/join flow before shipping. The Loki overlay does not create or join rooms.",
      "Inspect the game to establish its multiplayer profile. Do not infer player counts, teams, or simulation type from the game's name or genre. If a material field is ambiguous, stop and ask the creator. Do not invent new game.json fields.",
      "After confirming each mode's profile, choose createSynchronizedRoom for turn-based or event-driven state, or createRealtimeRoom for continuous host-authoritative simulation. Choose by how authoritative state actually progresses, not by genre or animation smoothness.",
      "createSynchronizedRoom: keep synchronized state compact and JSON-compatible; reducers must be synchronous, deterministic, and free of rendering, timers, networking, or other I/O.",
      "createRealtimeRoom: integrate the game's existing simulation through its predict/interpolate/extrapolate/blendCorrection/shouldCorrect/composeRenderState callbacks instead of a parallel input queue, RTT estimator, snapshot pacer, stale-round rejection, input ledger, interpolation buffer, or reconnect netcode. For multi-entity games, use getRenderStates()/composeRenderState (or the createEntityCompositor/createLocalPrediction helpers) to render each entity from the stream that fits it (predicted for local, interpolated/latestAuthoritative for remotes) instead of predicting every entity, which diverges after collisions. publishSnapshot() already coalesces multiple same-turn calls to a single send; do not build a separate coalescing layer. Use sendEffect()/onConfirmedEffect() to confirm authoritative events (e.g. collisions) with a stable id instead of a custom event-confirmation channel, so speculative local particles/audio can be deduped against the confirmed outcome. Keep one game-owned render loop, keep authoritative snapshots compact and self-contained, publish at a chosen rate up to the runtime's cap (30 Hz; default 10 Hz), and report selected rates plus observed diagnostics (including onDiagnosticWarning cadence warnings) as evidence. Loki does not supply physics, collision, rendering optimization, or competitive integrity for realtime rooms.",
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
      tickRate: "1..30",
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
      packages: ["@lokiplay/sdk@0.3.6", "@lokiplay/ui-web@0.3.6"],
      command: "npm install @lokiplay/sdk@0.3.6 @lokiplay/ui-web@0.3.6",
      apiOrigin: "https://api.lokiplay.cc",
      authority: "host",
      rankedIntegrity: false,
      synchronizedRooms: true,
      realtimeRooms: true,
      guidance:
        "After confirming each mode's profile, choose createSynchronizedRoom for turn-based or event-driven state, or createRealtimeRoom for continuous host-authoritative simulation (30 Hz snapshot cap, 10 Hz default); do not choose by genre or animation smoothness. For createRealtimeRoom, integrate the game's existing simulation through its callbacks rather than a parallel input queue, RTT estimator, snapshot pacer, or reconnect netcode, keep one game-owned render loop, and report selected rates and diagnostics as evidence; Loki does not supply physics, collision, rendering optimization, or competitive integrity. Installing the SDK does not add a create/join screen; add a usable room-entry flow (minimal lobby or automatic create/join) before shipping. Inspect the game to establish its multiplayer profile; do not infer player counts, teams, or simulation type from name or genre, and stop to ask the creator when a material field is ambiguous. Do not invent new game.json fields. Let Loki own lifecycle reconnect and pending-action replay; never leave or replace a room on browser visibility, page, focus, or network events. Dispatch only while connected and preserve authoritative state while suspended, reconnecting, or resynchronizing. Use responsive safe-area-aware viewport sizing, Pointer Events for touch and desktop, and bounded canvas resolution and rendering. Low-level sendAction and sendHostState remain supported. Native clients cannot join realtime-mode rooms until a later parity release.",
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
        message: "Install and initialize @lokiplay/sdk@0.3.6.",
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
