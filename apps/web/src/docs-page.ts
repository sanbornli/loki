import {
  LOKI_PACKAGE_VERSION,
  isDocsRoute,
  normalizeDocsPath,
  renderDocsSite,
  type DocsRoute,
} from "./docs-site.js";
import type { ProductPageConfig } from "./product-theme.js";

export {
  LOKI_PACKAGE_VERSION,
  docsRoutes,
  isDocsRoute,
  normalizeDocsPath,
} from "./docs-site.js";

const v = LOKI_PACKAGE_VERSION;

function codeBlock(code: string): string {
  return `<pre><code>${code
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")}</code></pre>`;
}

function table(headers: string[], rows: string[][]): string {
  return `
          <div class="docs-table-wrap">
            <table class="docs-table">
              <thead><tr>${headers.map((header) => `<th>${header}</th>`).join("")}</tr></thead>
              <tbody>
                ${rows
                  .map(
                    (row) =>
                      `<tr>${row.map((cell) => `<td>${cell}</td>`).join("")}</tr>`,
                  )
                  .join("")}
              </tbody>
            </table>
          </div>`;
}

function cards(items: Array<{ title: string; body: string; href?: string }>): string {
  return `
          <div class="docs-cards">
            ${items
              .map(
                (item) => `
            <article class="docs-card">
              <h3>${item.href ? `<a href="${item.href}">${item.title}</a>` : item.title}</h3>
              <p>${item.body}</p>
            </article>`,
              )
              .join("")}
          </div>`;
}

function panel(title: string, rows: Array<[string, string]>): string {
  return `
          <div class="docs-panel" aria-label="${title}">
            <div class="docs-panel-header"><span>${title}</span><span>Current</span></div>
            ${rows
              .map(
                ([left, right]) =>
                  `<div class="docs-row"><code>${left}</code><span>${right}</span></div>`,
              )
              .join("")}
          </div>`;
}

function aside(items: Array<{ label: string; body: string }>): string {
  return `
          <aside class="docs-aside" aria-label="Page notes">
            ${items
              .map(
                (item) =>
                  `<div><strong>${item.label}</strong><p>${item.body}</p></div>`,
              )
              .join("")}
          </aside>`;
}

const pages: Record<
  DocsRoute,
  {
    title: string;
    description: string;
    lede: string;
    aside?: string;
    main: string;
  }
> = {
  "/": {
    title: "Loki docs",
    description:
      "Host a finished browser game, add rooms, and ship a playable URL with one SDK and one CLI.",
    lede: "Loki hosts the finished browser build, scans it, isolates it, and runs rooms on the same playable URL. You keep the game. You still fine-tune that game after the package lands.",
    aside: aside([
      {
        label: "Humans",
        body: "Start with Quickstart, then pick a room type from how authoritative state actually moves.",
      },
      {
        label: "Agents",
        body: "Read Agent rules and llms.txt. Install is not a finished integration.",
      },
    ]),
    main: `
          <h2>Start here</h2>
          ${cards([
            {
              title: "Quickstart",
              href: "/quickstart",
              body: `Create a project, install @lokiplay/sdk@${v}, connect, and ship a URL.`,
            },
            {
              title: "How Loki works",
              href: "/concepts",
              body: "Host authority, finished builds, and the Layer 1 / Layer 2 split.",
            },
            {
              title: "Choose a room type",
              href: "/multiplayer",
              body: "Synchronized for turns and events. Realtime for a continuous host sim.",
            },
            {
              title: "Agent rules",
              href: "/agents",
              body: "The same contract as AGENTS.md. No invented servers. Fine-tune after install.",
            },
          ])}
          <h2>Packages</h2>
          ${table(
            ["Package", "Role"],
            [
              ["<code>@lokiplay/sdk</code>", "Runtime client. Required for multiplayer."],
              ["<code>lokiplay</code>", "CLI: login, connect, validate, ship."],
              [
                "<code>@lokiplay/ui-web</code>",
                "Optional overlay: status, roster, invite copy, chat. Does not create or join rooms.",
              ],
              [
                "<code>@lokiplay/mcp</code>",
                "Agent tooling. Do not ship it in the game bundle.",
              ],
              [
                "<code>@lokiplay/protocol</code>",
                "Shared schemas. Install only if the SDK already requires it.",
              ],
            ],
          )}
          <p>Pin the exact published version. Current release: <strong>${v}</strong>.</p>
          ${codeBlock(`npm install @lokiplay/sdk@${v}`)}
          <h2>Surfaces</h2>
          ${table(
            ["URL", "What it is"],
            [
              [
                '<a href="https://app.lokiplay.cc">app.lokiplay.cc</a>',
                "Create a project and copy the agent prompt",
              ],
              [
                '<a href="https://play.lokiplay.cc">play.lokiplay.cc</a>',
                "Play a hosted game",
              ],
              [
                '<a href="https://api.lokiplay.cc">api.lokiplay.cc</a>',
                "Production API",
              ],
              [
                '<a href="https://docs.lokiplay.cc">docs.lokiplay.cc</a>',
                "These docs",
              ],
            ],
          )}
          <h2>What is in Layer 1</h2>
          <p>Private and unlisted hosting. Immutable releases. Host-authoritative rooms. Invites. Fill-N matchmaking. Presence. Lobby and match chat. Private leaderboards. Reconnect and host migration. JavaScript SDK. Native clients for synchronized rooms.</p>
          <h2>What is not in Layer 1</h2>
          <p>A public catalog listing. Tips, ads, and payouts. Friends, parties, and public leaderboards. Ranked anti-cheat. Native clients in realtime rooms. Creator-authored server rules.</p>
`,
  },
  "/quickstart": {
    title: "Quickstart — Loki docs",
    description:
      "Install the SDK, connect a project, and ship a playable Loki URL.",
    lede: "The path is the same for you and for a coding agent. Package install is public. Creator login is a browser device flow. Never paste an access token. After the first ship, fine-tune the game and ship again.",
    aside: aside([
      {
        label: "Safety",
        body: "A green deploy does not mean the lobby, seats, or realtime profile are right for this title.",
      },
    ]),
    main: `
          <h2>1. Create a project</h2>
          <p>Sign in at <a href="https://app.lokiplay.cc/signup">app.lokiplay.cc</a> and create a project. Copy the project ID. If you use an agent, copy the project prompt from the desk and paste it into the repo.</p>
          <h2>2. Install the client</h2>
          <p>In the game repository, pin the published SDK. Keep the existing stack and UI.</p>
          ${codeBlock(`npm view @lokiplay/sdk@${v} version
npm install @lokiplay/sdk@${v}`)}
          <p>Optional overlay:</p>
          ${codeBlock(`npm install @lokiplay/ui-web@${v}`)}
          <p>Do not install <code>@loki/*</code>, unofficial packages named Loki, or <code>@heroiclabs/nakama-js</code>.</p>
          <h2>3. Add a room-entry flow</h2>
          <p>Installing the SDK does not add a create/join screen. Before shipping, the game needs one of:</p>
          <ul>
            <li>A minimal lobby: create room, join with invite, copy invite, start when ready.</li>
            <li>An automatic flow: a plain play URL creates a room; an invite or deep-link URL joins it.</li>
          </ul>
          <p>Players still need loading, waiting, and error states. The Loki overlay does not create or join rooms.</p>
          <p>Loki’s SDK does not add a public lobby screen. If public-room discovery is enabled, the game agent must build the room browser and all loading, empty, joining, full-room, waiting, readiness, and error states. The Loki overlay does not list, create, or join public rooms. Do not make every room public.</p>
          <h2>4. Write <code>game.json</code></h2>
          ${codeBlock(`{
  "schemaVersion": 1,
  "name": "my-game",
  "entrypoint": "index.html",
  "multiplayer": {
    "enabled": true,
    "authority": "host",
    "maxPlayers": 8,
    "tickRate": 10
  },
  "networkAllowlist": []
}`)}
          <p>Do not invent extra <code>game.json</code> fields. See <a href="/game-json">the manifest</a>.</p>
          <h2>5. Integrate the SDK</h2>
          <p>On a Loki play page, call <code>createHostedLokiClient({ projectId })</code> once at boot. It listens for <code>loki:init</code>, requests the session immediately, and returns an authenticated client. Do not wait for a Create/Join click — the play shell times out around 15 seconds.</p>
          ${codeBlock(`import { createHostedLokiClient } from "@lokiplay/sdk";

const client = await createHostedLokiClient({
  projectId, // the UUID from the creator desk
  fallbackTransport, // optional FirstPartyTransport for local preview
});

const room = client.createSynchronizedRoom({
  initialState,
  reduce,
});

await room.create();
// or: await room.join({ inviteCode });`)}
          <p>Pick <code>createSynchronizedRoom()</code> for turns and discrete events. Pick <code>createRealtimeRoom()</code> only for a continuous host simulation. Do not run both for the same mode. Details: <a href="/multiplayer">multiplayer</a>.</p>
          <h2>6. Log in and connect</h2>
          <p>Login still needs the production API origin in the environment:</p>
          ${codeBlock(`LOKI_API_URL=https://api.lokiplay.cc npx lokiplay@${v} login`)}
          <p>Open the printed URL, confirm the code, and approve this terminal. Then:</p>
          ${codeBlock(`npx lokiplay@${v} connect --project <project-uuid>`)}
          <p>That writes <code>.loki/project.json</code> and <code>AGENTS.md</code>. It does not put secrets in the repo.</p>
          <h2>7. Validate and ship</h2>
          ${codeBlock(`npx lokiplay@${v} validate
npx lokiplay@${v} ship`)}
          <p><code>ship</code> builds the project, copies <code>game.json</code> into the output, validates, uploads a zip, waits for security review, activates the release, and prints a playable URL. A blocked or quarantined build never becomes that URL.</p>
          <h2>8. Fine-tune, then play</h2>
          <p>Open the playable URL. Invite with the 6-digit room code Loki issued. Then keep going: confirm seats and start conditions, fix the lobby, tune the reducer or realtime profile, and re-ship. Do not invent room keys.</p>
`,
  },
  "/concepts": {
    title: "How Loki works — Loki docs",
    description: "Host authority, finished builds, and the Layer 1 / Layer 2 split.",
    lede: "Loki does not compile your source, run a creator backend, or decide whether the game is complete. After install, you still have to make this title playable.",
    main: `
          <h2>You own the game</h2>
          <p>The repository, the UI, the rules, the simulation, and the finished browser build are yours. Fine-tuning seats, modes, lobby copy, and feel stays yours after the SDK is in the tree.</p>
          <h2>Loki owns the platform</h2>
          <p>Identity, tenant boundaries, membership, invite codes, matchmaking, message sequencing, snapshots, host election, quotas, and the playable origin are Loki’s. Never trust a client-supplied player ID, project ID, room key, or membership list over what the SDK returns.</p>
          <h2>Finished builds, not servers</h2>
          <p>Upload <code>game.json</code>, <code>index.html</code>, and static assets. Do not upload source-only repos, <code>server.js</code>, secrets, creator ad tags, or localhost URLs.</p>
          <p>The live game runs in a sandboxed iframe on a Loki origin. Production multiplayer is available only from that hosted build.</p>
          <h2>Host authority</h2>
          <p>Every Layer 1 room elects a host. The host is a player client. Loki checks that the sender is the current host, sequences messages, and migrates host when that player is gone. Loki cannot prove the host simulated honestly.</p>
          <p>Use this for casual and unranked play. Do not treat it as ranked anti-cheat or a server-authoritative competitive boundary.</p>
          <h2>Two room types</h2>
          ${table(
            ["Room", "When", "What Loki commits"],
            [
              [
                "Synchronized",
                "Turns, discrete actions, lockstep state",
                "Actions, reducer commits, <code>stateVersion</code>",
              ],
              [
                "Realtime",
                "Continuous host simulation",
                "Inputs and host snapshots, paced and fenced",
              ],
            ],
          )}
          <p>Choose by how <strong>authoritative state</strong> progresses, not by genre or frame rate. A 60 FPS chessboard is still synchronized.</p>
          <h2>Layer 1 and Layer 2</h2>
          <p><strong>Layer 1</strong> is hosting and multiplayer. Private and unlisted links. Friends can play an ugly draft.</p>
          <p><strong>Layer 2</strong> is a reviewed public catalog page. It is closed. You cannot publish into the catalog from this release.</p>
          <h2>Identity</h2>
          <p>Players authenticate through Loki. Hosted games do that through <code>createHostedLokiClient()</code>. The game must not mint its own player IDs or call the multiplayer runtime with raw platform credentials.</p>
`,
  },
  "/hosting": {
    title: "Hosting — Loki docs",
    description: "Scan, isolate, and serve a finished browser build on a Loki URL.",
    lede: "Ship a production browser build. Loki stores it as an immutable release and serves it from a sandbox.",
    main: `
          <h2>What you upload</h2>
          <ul>
            <li><code>game.json</code></li>
            <li>the HTML entrypoint named in the manifest</li>
            <li>bundled JavaScript, CSS, images, fonts, and other static assets</li>
          </ul>
          <p><code>npx lokiplay ship</code> runs the repo’s build script, then archives the output directory. <code>AGENTS.md</code> and <code>.loki/</code> are not uploaded.</p>
          <h2>What is rejected</h2>
          <ul>
            <li>backend or <code>server</code> source</li>
            <li>a direct Nakama client</li>
            <li>Socket.IO multiplayer</li>
            <li>inline <code>&lt;script&gt;</code> tags or inline event handlers</li>
            <li>remote <code>&lt;script src&gt;</code></li>
            <li>remote stylesheets, including Google Fonts</li>
            <li><code>&lt;form&gt;</code> elements</li>
            <li>missing <code>game.json</code> or a missing entrypoint</li>
          </ul>
          <p>Localhost URLs are a warning, not a pass.</p>
          <h2>Isolation</h2>
          <p>Each release is immutable. The play page loads the game in an iframe with <code>sandbox="allow-scripts allow-pointer-lock allow-same-origin"</code>.</p>
          <p>CSP is strict. Scripts, fonts, and styles must be same-origin. <code>connect-src</code> includes Loki API and multiplayer endpoints, plus up to ten URIs in <code>networkAllowlist</code>. Forms cannot submit. Camera, microphone, geolocation, and payment are off.</p>
          <p>Do not add <code>api.lokiplay.cc</code> or the multiplayer host to the allowlist. Use <code>networkAllowlist</code> only for extra origins the game truly needs.</p>
          <h2>Security review</h2>
          ${table(
            ["Status", "Meaning"],
            [
              ["<code>ready</code>", "Allowed to activate"],
              ["<code>ready_with_warnings</code>", "Allowed; read the warnings"],
              ["<code>security_review_pending</code>", "Wait"],
              ["<code>blocked</code>", "Rejected"],
              ["<code>quarantined</code>", "Held for operator review"],
            ],
          )}
          <p><code>ship</code> waits, then activates only a ready release, then checks that the playable URL returns a Loki game page (<code>loki:init</code> in the shell).</p>
          <h2>Playable URL</h2>
          <p>A successful ship prints a playable URL. Private play requires creator membership or a signed, expiring play invite. Unlisted play is capability-based. Projects are not enumerable. The public catalog is closed.</p>
          <h2>Activate and replace</h2>
          <p>Each successful ship is a new immutable deployment. Activating it replaces the project’s live release. You cannot edit files on an old release in place.</p>
`,
  },
  "/game-json": {
    title: "game.json — Loki docs",
    description: "The only manifest Loki accepts for a hosted game.",
    lede: "Unknown fields are rejected. Record a richer multiplayer profile in notes, not in this file.",
    main: `
          ${codeBlock(`{
  "schemaVersion": 1,
  "name": "arena",
  "entrypoint": "index.html",
  "multiplayer": {
    "enabled": true,
    "authority": "host",
    "maxPlayers": 8,
    "tickRate": 10
  },
  "networkAllowlist": []
}`)}
          ${table(
            ["Field", "Required", "Rules"],
            [
              ["<code>schemaVersion</code>", "Yes", "Must be <code>1</code>"],
              ["<code>name</code>", "Yes", "1–80 characters"],
              [
                "<code>entrypoint</code>",
                "Yes",
                "Relative <code>*.html</code> path. No leading <code>/</code>, no <code>..</code>",
              ],
              [
                "<code>multiplayer</code>",
                "No",
                "If present, all four subfields are required",
              ],
              ["<code>multiplayer.enabled</code>", "", "<code>true</code> or <code>false</code>"],
              ["<code>multiplayer.authority</code>", "", "Must be <code>\"host\"</code>"],
              ["<code>multiplayer.maxPlayers</code>", "", "Integer 1–16"],
              ["<code>multiplayer.tickRate</code>", "", "Integer 1–30"],
              [
                "<code>networkAllowlist</code>",
                "No",
                "Up to 10 absolute URIs. Default <code>[]</code>",
              ],
            ],
          )}
          <p><code>tickRate</code> is a deployment-time room-loop hint. Do not copy a realtime <code>snapshotHz</code> into it. Realtime publish is a separate ceiling (default and cap 30 Hz) set on the room.</p>
          <p><code>npx lokiplay init</code> and <code>connect</code> write this file if it is missing. Default <code>maxPlayers</code> is 8 and <code>tickRate</code> is 10.</p>
`,
  },
  "/cli": {
    title: "CLI — Loki docs",
    description: "Login, connect, validate, and ship with lokiplay.",
    lede: "The CLI is how humans and agents authenticate a creator and publish a finished build.",
    main: `
          ${codeBlock(`npm install --global lokiplay
# or
npx lokiplay@${v} <command>`)}
          ${codeBlock(`lokiplay <login|init|connect|validate|ship|deploy|status> [directory] [--project <uuid>]`)}
          <h2><code>login</code></h2>
          <p>Starts a device-code flow. Prints a URL and a short code. You approve the terminal in the browser. The CLI stores a session under <code>~/.config/lokiplay/session.json</code> (mode <code>600</code>).</p>
          <p>This release requires the API origin:</p>
          ${codeBlock(`LOKI_API_URL=https://api.lokiplay.cc npx lokiplay@${v} login`)}
          <p>Never ask anyone to paste the access token.</p>
          <h2><code>init [directory]</code></h2>
          <p>Writes <code>game.json</code> (if missing) and <code>AGENTS.md</code>.</p>
          <h2><code>connect --project &lt;uuid&gt;</code></h2>
          <p>Confirms the logged-in creator can access that project. Writes <code>.loki/project.json</code> and <code>AGENTS.md</code>.</p>
          <h2><code>validate [directory]</code></h2>
          <p>Validates a <strong>build output</strong> directory: manifest, entrypoint, sandbox rules, no backend, no Nakama, no Socket.IO.</p>
          <h2><code>ship [directory] [--project &lt;uuid&gt;]</code></h2>
          <p>The command agents and humans should use: authenticate, connect if needed, build, copy <code>game.json</code>, validate, upload, wait for review, activate, verify the playable URL.</p>
          <h2><code>deploy [directory]</code></h2>
          <p>Uploads a zip of the given directory without the build / review / activate loop. Prefer <code>ship</code>.</p>
          <h2><code>status</code></h2>
          <p>Prints the linked project JSON, including the active deployment.</p>
          <h2>Environment</h2>
          ${table(
            ["Variable", "Use"],
            [
              ["<code>LOKI_API_URL</code>", "Required for <code>login</code>. Production value is <code>https://api.lokiplay.cc</code>."],
              ["<code>LOKI_PROJECT_ID</code>", "Override the linked project"],
              [
                "<code>LOKI_SHIP_TIMEOUT_MS</code>",
                "Review wait timeout (default 10 minutes, min 1000)",
              ],
              [
                "<code>LOKI_DEPLOY_CREDENTIAL_ID</code> / <code>LOKI_DEPLOY_SECRET</code>",
                "<code>deploy</code> only; <code>ship</code> mints its own",
              ],
            ],
          )}
          <p>Do not point a shipped game at localhost.</p>
`,
  },
  "/multiplayer": {
    title: "Multiplayer — Loki docs",
    description: "Pick synchronized or realtime from how authoritative state moves.",
    lede: "Inspect the game first. Do not infer player count, teams, or simulation type from the name. If a material field is ambiguous, stop and ask.",
    main: `
          <h2>Decision</h2>
          <ol>
            <li>Discrete actions → <code>createSynchronizedRoom()</code></li>
            <li>A continuous host tick → <code>createRealtimeRoom()</code></li>
            <li>Do not pick realtime because the game animates at 60 FPS.</li>
            <li>Do not run both room types for the same mode.</li>
            <li>Native clients cannot join realtime rooms. Cross-client modes use synchronized rooms.</li>
          </ol>
          <h2>What every mode still needs</h2>
          <ul>
            <li>Create with <code>createRoom()</code> / <code>room.create()</code>. Create stays invite-only unless the game passes <code>{ visibility: "public" }</code>.</li>
            <li>Join with <code>joinRoom({ inviteCode })</code> / <code>room.join({ inviteCode })</code></li>
            <li>Optional public browsing: <code>listPublicRooms()</code> then <code>joinPublic({ roomId })</code>. Confirm per mode; do not make every room public.</li>
            <li>A 6-digit invite code issued by Loki (16-character hex codes from 0.2.0 still join)</li>
            <li>Loading, waiting, reconnecting, and error UI, including a game-owned public lobby when discovery is enabled</li>
            <li><code>leave()</code> only from an explicit Leave / End Game control</li>
          </ul>
          <p>Fine-tuning after install means confirming those fields for <em>this</em> title, not copying a chess lobby onto a racer.</p>
          <h2>What Loki does not supply</h2>
          <p>Physics, collision, rendering, interpolation math you did not provide, or competitive integrity. Overlay UI does not start a match.</p>
`,
  },
  "/synchronized-rooms": {
    title: "Synchronized rooms — Loki docs",
    description: "Discrete actions, a reducer, and an authoritative stateVersion.",
    lede: "Use this for turn-based and event-driven games. Loki sequences actions, commits only from the current host, and tracks stateVersion.",
    main: `
          <h2>Contract</h2>
          <ol>
            <li>JSON-compatible state and actions. Numbers must be finite safe integers.</li>
            <li><code>reduce(state, action, context)</code> must be synchronous, deterministic, and fast (budget 50 ms). No I/O or rendering inside <code>reduce</code>.</li>
            <li>Only the current host runs <code>reduce</code>.</li>
            <li>Subscribe to snapshots for <code>state</code>, <code>members</code>, host, and <code>connection</code>.</li>
            <li>Call <code>dispatch(action)</code> only while <code>connection === "connected"</code>.</li>
          </ol>
          ${codeBlock(`const room = client.createSynchronizedRoom<State, Action>({
  initialState: { board: emptyBoard, turn: "white" },
  reduce(state, action, context) {
    if (action.type === "move") return applyMove(state, action, context.senderId);
    return state;
  },
});

const created = await room.create();
room.subscribe((snapshot) => {
  render(snapshot.state, snapshot.members, snapshot.connection);
});
await room.dispatch({ type: "move", from: "e2", to: "e4" });`)}
          <p>Shared methods: <code>create()</code>, <code>create({ visibility: "public" })</code>, <code>join({ inviteCode })</code>, <code>joinPublic({ roomId })</code>, <code>dispatch(action)</code>, <code>leave()</code>, <code>reconnect()</code>.</p>
          <h2>Connection</h2>
          ${table(
            ["connection", "What to do"],
            [
              ["<code>connected</code>", "Dispatch is allowed"],
              ["<code>suspended</code>", "Page hidden or offline. Lock input. Do not leave."],
              [
                "<code>reconnecting</code> / <code>resynchronizing</code>",
                "Wait for a snapshot. Host may have changed.",
              ],
              ["<code>leave_failed</code>", "Retry <code>leave()</code> or <code>close()</code>"],
              ["<code>room_closed</code>", "Terminal. Return to lobby."],
            ],
          )}
          <p>Coming back replaces the socket and replays unresolved actions with the same <code>(senderId, actionId)</code>. Do not resend under a new ID. <code>indeterminate</code> is unknown, not proof of failure.</p>
          <p>Prefer <code>createSynchronizedRoom()</code> over low-level <code>sendAction()</code> / <code>sendHostState()</code>.</p>
`,
  },
  "/realtime-rooms": {
    title: "Realtime rooms — Loki docs",
    description: "Host-authoritative streaming for continuous simulation.",
    lede: "Use this when the host simulation advances every tick. JavaScript only. Calibrate the rate. Do not guess 30 Hz.",
    main: `
          <p>Every member must be realtime-capable before the room activates. Native clients cannot join. A turn-based game with smooth animation is not a realtime room.</p>
          <h2>Responsibility</h2>
          ${table(
            ["Loki", "The game"],
            [
              ["Transport, sequencing, authority/round fences", "Simulation and physics"],
              ["Snapshot pacing and backpressure", "Collision"],
              ["Input delivery and coalescing", "Rendering"],
              ["Reconnect and host migration", "Prediction you configure"],
              ["Diagnostics and calibration", "Competitive integrity — not provided"],
            ],
          )}
          <h2>Loop</h2>
          ${codeBlock(`const room = client.createRealtimeRoom<RacerState, RacerInput>({
  snapshotHz: 30,
  adaptiveRate: true,
  initialSnapshotHz: 12,
  minSnapshotHz: 8,
  diagnostics: true,
  predict(state, localInput, dtSeconds) { return state; },
  interpolate(from, to, t) { return to; },
});

await room.create();
room.publishSnapshot(currentState, { simulationTick });
room.setInput({ throttle: 75 });
await room.sendInput({ type: "placeBomb", cell: 12 });

function frame(now: number) {
  room.advanceFrame(now);
  render(room.getRenderState(now));
}`)}
          <p>Drive rendering from one game-owned <code>requestAnimationFrame</code> loop. Call <code>advanceFrame()</code> and <code>getRenderState()</code> at most once per frame. <code>setInput()</code> is safe every frame; the SDK paces the network send.</p>
          <h2>Rates</h2>
          <p><code>snapshotHz</code> is a ceiling (default and cap 30), not a delivery guarantee. Start conservative with <code>adaptiveRate: true</code>. Do not copy <code>snapshotHz</code> into <code>game.json</code> <code>tickRate</code>.</p>
          <h2>Calibrate</h2>
          <p>Prefer <code>calibrateRealtimeRoom()</code> over guessing. It needs two distinct player identities — two isolated browser profiles or two real players, not two tabs of one signed-in account. Write only the returned <code>RealtimeProfile</code> into <code>createRealtimeRoom()</code>.</p>
          ${codeBlock(`import { calibrateRealtimeRoom } from "@lokiplay/sdk";

const { recommended } = await calibrateRealtimeRoom({
  snapshotHzCandidates: [8, 12, 15, 20, 25, 30],
  simulationHz: 60,
  durationMsPerCandidate: 20_000,
  createHostRoom: (candidate) =>
    hostClient.createRealtimeRoom({
      snapshotHz: candidate.snapshotHz,
      adaptiveRate: false,
      diagnostics: true,
    }),
  createGuestRoom: () =>
    guestClient.createRealtimeRoom({ diagnostics: true }),
  driveHost: (host, tick) =>
    host.publishSnapshot(simulateOneStep(tick), { simulationTick: tick }),
  driveGuest: (guest) => guest.setInput(representativeControl()),
});

const room = client.createRealtimeRoom({ ...recommended, predict, interpolate });`)}
          <p>If calibration throws, fix the harness and rerun. If no candidate qualifies, use the floor profile (8 Hz, adaptive). Fine-tuning a racer after install means running this sweep on the real wiring, not copying another game’s Hertz.</p>
          <h2>Render streams</h2>
          <p>Predict the local entity. Interpolate remotes. Use <code>getRenderStates()</code> / <code>composeRenderState</code>, or <code>createEntityCompositor</code> / <code>createLocalPrediction</code> with bulk <code>setEntities</code>. Use <code>sendEffect()</code> / <code>onConfirmedEffect()</code> for authoritative events such as collisions.</p>
`,
  },
  "/rooms": {
    title: "Rooms and invites — Loki docs",
    description: "Loki creates every room and issues the invite code.",
    lede: "createRoom() does not take a player-typed room key. joinRoom takes { inviteCode } only.",
    main: `
          ${codeBlock(`await client.authenticate(token);
const created = await client.createRoom();
showCode(created.inviteCode);
const joined = await client.joinRoom({ inviteCode: "123456" });`)}
          <p>New rooms get a 6-digit code. Older 16-character hex codes still resolve. <code>create()</code> stays invite-only unless the game passes <code>{ visibility: "public" }</code>.</p>
          <h2>Public rooms</h2>
          ${codeBlock(`const rooms = await client.listPublicRooms({ limit: 50 });
await room.create({ visibility: "public", modeLabel: "casual" });
await room.joinPublic({ roomId: rooms.rooms[0].roomId });`)}
          <p>A public summary includes only an opaque <code>roomId</code>, occupancy, whether the room is joinable, and an optional bounded <code>modeLabel</code>. Invite codes, player identities, and authoritative state are never listed. Private, unlisted, and matchmaking rooms never appear. Rooms are scoped to the caller’s project.</p>
          <p>Loki’s SDK does not add a public lobby screen. If public-room discovery is enabled, the game agent must build the room browser and all loading, empty, joining, full-room, waiting, readiness, and error states. The Loki overlay does not list, create, or join public rooms. Do not make every room public. Confirm per mode whether entry is private invites, public browsing, automatic matchmaking, or a combination.</p>
          <h2>Matchmaking</h2>
          ${codeBlock(`const room = await client.matchmake({
  minPlayers: 2,
  maxPlayers: 8,
  teamSize: 2,
});`)}
          <p>Fill-N / team matchmaking creates the same Loki room type. Matchmaking is still blind pairing. Public rooms are a per-project browser, not a global cross-game pool.</p>
          <h2>Resolve and leave</h2>
          ${codeBlock(`const { roomId, inviteCode } = await client.resolveInvite("123456");
await client.leaveRoom();`)}
          <p>Call <code>leave()</code> only from Leave / End Game. Invalid codes fail with <code>INVITE_INVALID</code>. A full room returns <code>ROOM_FULL</code>.</p>
`,
  },
  "/presence-chat-scores": {
    title: "Presence, chat, and scores — Loki docs",
    description: "Roster, lobby/match chat, and private leaderboards.",
    lede: "An empty members list is incomplete, not everyone left. Leaderboards are project-scoped, not a public ranking.",
    main: `
          <h2>Presence</h2>
          <ul>
            <li>Replace the roster only when <code>membersComplete</code> is true, or when that flag is omitted and <code>members</code> is non-empty.</li>
            <li><code>membership</code> is <code>ready</code> only when the local player is on a complete roster.</li>
            <li><code>membershipRevision</code> increases for a real join or leave, not a recovered interruption.</li>
          </ul>
          <h2>Chat</h2>
          ${codeBlock(`await client.sendChat("ready", "lobby"); // or "match"`)}
          <p>Bind the overlay’s <code>loki-chat-send</code> event to this. Do not log chat bodies.</p>
          <h2>Private scores</h2>
          ${codeBlock(`await client.submitScore("season-1", 1200, 0);`)}
          <p>Not an anti-cheat boundary.</p>
`,
  },
  "/reconnect": {
    title: "Reconnect — Loki docs",
    description: "Keep the same client. Let Loki replace the socket.",
    lede: "Do not leave, close, or create a new room because the tab hid or the network dropped.",
    main: `
          <p>Keep the same <code>LokiClient</code> and room instance while the page is hidden, blurred, offline, or briefly dead.</p>
          <p>Do not add your own handlers that call <code>leave()</code>, <code>close()</code>, disconnect, reload, or create a new room on <code>visibilitychange</code>, <code>pagehide</code>, <code>pageshow</code>, <code>blur</code>, <code>focus</code>, <code>online</code>, or <code>offline</code>.</p>
          <p>The SDK marks the page <code>suspended</code>, replaces the socket when visible and online, retries with backoff (max 15 s), requests a snapshot, and replays unresolved synchronized actions with the same IDs.</p>
          <p>After reconnect, do not assume you are still host. A runtime process restart is fail-closed: in-memory rooms die. Clients must create a new room. <code>room_closed</code> is terminal.</p>
`,
  },
  "/sdk": {
    title: "JavaScript SDK — Loki docs",
    description: "@lokiplay/sdk — the production client for hosted browser games.",
    lede: "FirstPartyTransport talks to api.lokiplay.cc. The public API never returns Nakama types.",
    aside: aside([
      { label: "Install", body: `npm install @lokiplay/sdk@${v}` },
      { label: "Hosted", body: "createHostedLokiClient({ projectId }) at boot." },
    ]),
    main: `
          ${codeBlock(`npm install @lokiplay/sdk@${v}`)}
          ${codeBlock(`import { LokiClient, FirstPartyTransport } from "@lokiplay/sdk";

const client = new LokiClient({
  projectId,
  transport: new FirstPartyTransport(),
});
await client.authenticate(token);`)}
          ${table(
            ["Method", "Purpose"],
            [
              ["<code>authenticate(token)</code>", "Bind a player session"],
              ["<code>createRoom()</code>", "Host a room; receive inviteCode"],
              ["<code>createRoom({ visibility: \"public\" })</code>", "Host a listable room"],
              ["<code>joinRoom({ inviteCode })</code>", "Join"],
              ["<code>listPublicRooms({ limit? })</code>", "List open public rooms"],
              ["<code>joinPublicRoom({ roomId })</code>", "Join a listed public room"],
              ["<code>matchmake({ minPlayers, maxPlayers, teamSize? })</code>", "Fill a room"],
              ["<code>createSynchronizedRoom(options)</code>", "Lockstep room"],
              ["<code>createRealtimeRoom(options)</code>", "Streaming room"],
              ["<code>createHostedLokiClient(options)</code>", "Hosted play-page client"],
              ["<code>calibrateRealtimeRoom(options)</code>", "Pick a RealtimeProfile from evidence"],
              ["<code>sendChat(text, channel?)</code>", "lobby or match"],
              ["<code>submitScore(id, score, subscore?)</code>", "Private board"],
              ["<code>leaveRoom()</code>", "Intentional leave"],
              ["<code>reconnect()</code>", "Replace socket + snapshot"],
              ["<code>close()</code>", "Abandon the handle"],
            ],
          )}
          <p><code>projectId</code> must be a UUID. <code>playerId</code>, <code>roomId</code>, and <code>inviteCode</code> are read-only on the client. A production build must not target localhost.</p>
`,
  },
  "/overlay": {
    title: "Overlay — Loki docs",
    description: "Room status, roster, invite copy, and chat. Not a lobby.",
    lede: "The overlay does not create rooms, join rooms, list public rooms, or start matches. You still add that flow after install.",
    main: `
          ${codeBlock(`npm install @lokiplay/ui-web@${v}`)}
          ${codeBlock(`import { registerLokiOverlay } from "@lokiplay/ui-web";
registerLokiOverlay();`)}
          ${codeBlock(`<loki-overlay></loki-overlay>`)}
          <p>Set <code>element.state</code> to <code>{ connected, roomCode, players, messages }</code>. Listen for <code>loki-chat-send</code> and call <code>client.sendChat(detail.text)</code>.</p>
          <p>The Loki overlay does not list, create, or join public rooms.</p>
`,
  },
  "/hosted-session": {
    title: "Hosted session — Loki docs",
    description: "Authenticate a sandboxed game without allowlisting Loki.",
    lede: "The play shell posts loki:init. createHostedLokiClient handles the handshake. Do not write your own listener and wait for a button click.",
    main: `
          ${codeBlock(`import { createHostedLokiClient, FirstPartyTransport } from "@lokiplay/sdk";

const client = await createHostedLokiClient({
  projectId,
  fallbackTransport: new FirstPartyTransport(), // local preview only
});`)}
          <p>Reuse that client for every create/join. If the handshake times out and no fallback is configured, the game is not on a Loki play page. Do not fall back to a hardcoded API token in the bundle.</p>
          <p>Lower-level access remains on <code>hostedGameSessionProvider(port, nonce)</code> if you must build your own transport.</p>
`,
  },
  "/mobile": {
    title: "Mobile — Loki docs",
    description: "Viewport, touch, and canvas rules for the Loki iframe.",
    lede: "These are requirements. Fine-tuning after install includes checking them on a real device before you claim they work.",
    main: `
          <ul>
            <li><code>&lt;meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"&gt;</code></li>
            <li>Do not globally disable zoom</li>
            <li>Root: <code>width: 100%</code>, <code>height: 100vh</code>, then <code>height: 100dvh</code>, <code>overflow: hidden</code></li>
            <li><code>env(safe-area-inset-*)</code> on critical controls</li>
            <li>Gameplay must not require document scrolling</li>
            <li>Recalculate on <code>resize</code>, <code>visualViewport.resize</code>, and <code>orientationchange</code></li>
            <li>Canvas: CSS size ≠ backing store; cap <code>devicePixelRatio</code> at 2; do not replace the node</li>
            <li>Pointer Events; <code>touch-action: none</code> only on the playfield</li>
            <li>Primary targets at least 44×44 CSS pixels; no hover-only controls</li>
            <li>One <code>requestAnimationFrame</code> loop; pause rendering while hidden without leaving the room</li>
            <li>Report Safari and Android Chrome only if you actually tested them</li>
          </ul>
`,
  },
  "/native": {
    title: "Native SDKs — Loki docs",
    description: "Swift, Kotlin, and Unity speak protocol v1 synchronized rooms.",
    lede: `Native packages exist at ${v} for host-authoritative synchronized play. They cannot join realtime rooms yet.`,
    main: `
          ${table(
            ["Client", "Install", "Status"],
            [
              [
                "JavaScript",
                `<code>@lokiplay/sdk@${v}</code>`,
                "Production. Synchronized and realtime.",
              ],
              [
                "Swift",
                `SPM <code>https://github.com/sanbornli/loki.git</code> version <code>${v}</code>, product <code>LokiSDK</code>`,
                "Synchronized rooms. Notify lifecycle with <code>notifyLifecycle(visible:online:)</code>.",
              ],
              [
                "Kotlin",
                `<code>cc.lokiplay:loki-sdk:${v}</code>`,
                "Synchronized rooms. Notify lifecycle with <code>notifyLifecycle(visible, online)</code>.",
              ],
              [
                "Unity",
                `<code>https://github.com/sanbornli/loki.git?path=/clients/unity#v${v}</code>`,
                "Synchronized rooms. Notify lifecycle with <code>NotifyLifecycle(visible, online)</code>.",
              ],
            ],
          )}
          <p>Native wrappers match the JavaScript synchronized API: create, join, dispatch, leave, reconnect, close. Do not offer <code>createRealtimeRoom()</code> on a cross-client mode. Do not talk to Nakama directly.</p>
`,
  },
  "/agents": {
    title: "Agent integration — Loki docs",
    description: "Canonical rules. No invented servers. Fine-tune after install.",
    lede: "This page is the human-readable form of AGENTS.md and loki://docs/integration. Installing the package is step one, not the end of the job.",
    main: `
          <h2>Disclaimer for agents</h2>
          <p>Do not report the integration complete after <code>npm install</code>, <code>lokiplay connect</code>, or the first <code>lokiplay ship</code>. Each game still requires fine-tuning: inspect the real modes, confirm player counts and room type with the creator, add a usable create/join flow, tune the reducer or <code>RealtimeProfile</code>, and exercise reconnect and mobile. If a material field is ambiguous, stop and ask.</p>
          <h2>Hard rules</h2>
          <ol>
            <li>Install <code>@lokiplay/sdk@${v}</code>. Do not import Nakama.</li>
            <li>Production multiplayer runs only on a Loki-hosted finished browser build.</li>
            <li>Upload <code>game.json</code>, <code>index.html</code>, and static assets. No backends, secrets, ad tags, or localhost.</li>
            <li>Never override <code>projectId</code>, player identity, membership, or sequence.</li>
            <li><code>createRoom()</code> / <code>joinRoom({ inviteCode })</code>. No invented room keys.</li>
            <li>Add a real create/join flow. The overlay is not that flow.</li>
            <li>Loki’s SDK does not add a public lobby screen. If public-room discovery is enabled, the game agent must build the room browser and all loading, empty, joining, full-room, waiting, readiness, and error states. Do not make every room public.</li>
            <li>Do not invent <code>game.json</code> fields.</li>
            <li>Synchronized vs realtime by state progression, not animation.</li>
            <li>Hosted games: <code>createHostedLokiClient({ projectId })</code> at boot.</li>
            <li>Realtime: calibrate; do not copy <code>snapshotHz</code> into <code>tickRate</code>.</li>
            <li>Let the SDK own lifecycle. Never leave on hide/offline.</li>
            <li><code>dispatch()</code> only while <code>connected</code>.</li>
            <li>CSP: no inline script, no remote fonts/CSS, no <code>&lt;form&gt;</code>.</li>
            <li><code>validate</code> before <code>ship</code>. Do not claim device testing you did not do.</li>
          </ol>
          <h2>Workflow</h2>
          ${codeBlock(`npm install @lokiplay/sdk@${v}
LOKI_API_URL=https://api.lokiplay.cc npx lokiplay@${v} login
npx lokiplay@${v} connect --project <uuid>
npx lokiplay@${v} ship`)}
          <p>Package install does not need Loki credentials. Login does. Stop on auth or deploy errors.</p>
          <p>Machine-readable: <a href="/mcp">MCP</a>, <a href="/llms.txt">/llms.txt</a>, <a href="/llms-full.txt">/llms-full.txt</a>.</p>
`,
  },
  "/mcp": {
    title: "MCP — Loki docs",
    description: "Live Loki tools for capable agents.",
    lede: "Install @lokiplay/mcp for agent hosts. Do not ship it inside the browser build.",
    main: `
          ${codeBlock(`npm install @lokiplay/mcp@${v}`)}
          <h2>Resources</h2>
          ${table(
            ["URI", "Contents"],
            [
              ["<code>loki://docs/integration</code>", "Integration rules (same contract as AGENTS.md)"],
              ["<code>loki://schemas/game-manifest</code>", "Manifest shape"],
            ],
          )}
          <h2>Tools</h2>
          ${table(
            ["Tool", "Does"],
            [
              ["<code>create_project</code>", "Create a project in an authenticated org"],
              ["<code>validate_manifest</code>", "Parse game.json"],
              ["<code>create_deployment_credential</code>", "One-use upload credential"],
              ["<code>deployment_status</code>", "Read review / activation"],
              ["<code>integration_requirements</code>", "Exact package names and room guidance"],
              ["<code>diagnose_multiplayer</code>", "Flag Socket.IO, Nakama, localhost, CSP failures"],
            ],
          )}
          <p><code>integration_requirements</code> currently returns <code>@lokiplay/sdk@${v}</code>, <code>@lokiplay/ui-web@${v}</code>, and <code>https://api.lokiplay.cc</code>.</p>
`,
  },
  "/errors": {
    title: "Errors — Loki docs",
    description: "Stable codes from the protocol.",
    lede: "Show snapshot.lastError or the thrown code. Do not invent a parallel protocol.",
    main: `
          ${table(
            ["Code", "Typical cause"],
            [
              ["<code>UNAUTHORIZED</code>", "No session or expired session"],
              ["<code>FORBIDDEN</code>", "Authenticated but not allowed"],
              ["<code>TENANT_MISMATCH</code>", "Project / room belong to another tenant"],
              ["<code>PROJECT_SUSPENDED</code>", "Play and deploy are stopped"],
              ["<code>ROOM_NOT_FOUND</code>", "Room gone or never existed"],
              ["<code>ROOM_FULL</code>", "maxPlayers reached"],
              ["<code>INVITE_INVALID</code>", "Not a Loki-issued code"],
              ["<code>INVITE_EXPIRED</code>", "Code past TTL"],
              ["<code>STALE_VERSION</code>", "Host state / action version conflict"],
              ["<code>HOST_REQUIRED</code>", "Only the host may send this"],
              ["<code>RATE_LIMITED</code>", "Slow down"],
              ["<code>QUOTA_EXCEEDED</code>", "Account or project cap"],
              ["<code>INVALID_MESSAGE</code>", "Envelope failed schema"],
              ["<code>UNSUPPORTED_VERSION</code>", "Client/server protocol mismatch"],
              ["<code>SERVICE_UNAVAILABLE</code>", "Runtime not ready"],
            ],
          )}
          <p>SDK wrappers also use <code>SynchronizedRoomError</code> and <code>RealtimeRoomError</code>.</p>
`,
  },
  "/limits": {
    title: "Limits — Loki docs",
    description: "Hard caps. No silent overage.",
    lede: "Crossing a cap returns QUOTA_EXCEEDED. There is no automatic paid overage in Layer 1.",
    main: `
          ${table(
            ["Limit", "Value"],
            [
              ["<code>maxPlayers</code> in game.json", "1–16"],
              ["Manifest <code>tickRate</code>", "1–30"],
              ["Realtime snapshot publish", "Ceiling 30 Hz; start conservative"],
              ["Realtime input", "Paced by inputHz"],
              ["Allowlist entries", "10"],
              ["Synchronized message", "16,384 bytes"],
              ["Protocol numbers", "Finite safe integers"],
            ],
          )}
          <p>Free includes one game and two rooms. Loki is the paid plan. See <a href="https://lokiplay.cc/pricing">Pricing</a>.</p>
          <p>Treat <code>PROJECT_SUSPENDED</code> as stop-the-line.</p>
`,
  },
  "/safety": {
    title: "Safety note — Loki docs",
    description:
      "Each game still requires fine-tuning after Loki is installed.",
    lede: "Install is not the finish. Each game still requires fine-tuning after Loki is installed.",
    aside: aside([
      {
        label: "Humans",
        body: "A green deploy is not a finished lobby, seat count, or mobile layout.",
      },
      {
        label: "Agents",
        body: "Do not treat npm install or lokiplay ship as a complete game.",
      },
    ]),
    main: `
          <h2>What install gives you</h2>
          <p>The SDK, CLI, and overlay give you a host, rooms, and a playable URL. They do not invent the right player count, room type, lobby, reducer, realtime profile, or mobile layout for that title.</p>
          <h2>What you still do</h2>
          <ul>
            <li>Inspect the real modes. Do not infer seats or simulation type from the genre.</li>
            <li>Add a usable create/join flow. The overlay does not start a match.</li>
            <li>Tune the reducer or <code>RealtimeProfile</code> against this game, then ship again.</li>
            <li>Playtest reconnect, host migration, and phones before you claim they work.</li>
          </ul>
          <p>If a material field is ambiguous, stop and ask. See <a href="/agents">Agent rules</a> and <a href="/quickstart">Quickstart</a>.</p>
`,
  },
};

export function renderDocsPage(config: ProductPageConfig, path = "/"): string {
  const normalized = normalizeDocsPath(path);
  const route: DocsRoute = isDocsRoute(normalized) ? normalized : "/";
  const page = pages[route];
  return renderDocsSite({
    config,
    path: route,
    title: page.title,
    description: page.description,
    lede: page.lede,
    aside: page.aside,
    main: page.main,
  });
}

export function buildLlmsFull(agentsMarkdown: string): string {
  return [
    llmsTxt.trim(),
    "",
    "# Full documentation",
    "",
    "The HTML docs live at https://docs.lokiplay.cc/ with the same sitemap as this file.",
    "The fine-tuning safety note lives at https://docs.lokiplay.cc/safety.",
    "",
    "# AGENTS.md",
    "",
    agentsMarkdown.trim(),
    "",
  ].join("\n");
}

export const llmsTxt = `# Loki

> Hosting and host-authoritative multiplayer for finished browser games.

Loki hosts a scanned, sandboxed browser build and runs rooms on the same playable URL. Creators do not upload a backend.

## Safety
Installing Loki is not a finished game. Each title still requires fine-tuning after installation: inspect real modes, confirm room type and player counts, add a usable create/join flow, tune the reducer or RealtimeProfile, and playtest reconnect and mobile. Agents must not treat npm install or lokiplay ship as a complete integration.

## Packages
- @lokiplay/sdk@${v} — JavaScript client
- lokiplay@${v} — CLI: login, connect, validate, ship
- @lokiplay/ui-web@${v} — optional overlay (no create/join)
- @lokiplay/mcp@${v} — agent tools, not for the game bundle

## Start
- Docs: https://docs.lokiplay.cc/
- Quickstart: https://docs.lokiplay.cc/quickstart
- Agents: https://docs.lokiplay.cc/agents
- Safety: https://docs.lokiplay.cc/safety
- MCP: https://docs.lokiplay.cc/mcp
- App: https://app.lokiplay.cc/
- Play: https://play.lokiplay.cc/
- API: https://api.lokiplay.cc

## Rules
- Use @lokiplay/sdk. Do not import Nakama or Socket.IO.
- createHostedLokiClient({ projectId }) at boot on hosted play pages.
- createRoom() and joinRoom({ inviteCode }). Loki issues 6-digit codes.
- Public rooms: listPublicRooms() and joinPublic({ roomId }). create() stays invite-only unless visibility is "public". Loki does not add a public lobby screen; the game must build it. Do not make every room public.
- createSynchronizedRoom() for turns/events; createRealtimeRoom() for continuous host simulation. Not both in one mode.
- Calibrate realtime rooms. Do not copy snapshotHz into game.json tickRate.
- Host authority is casual/unranked, not anti-cheat.
- Production multiplayer only from a Loki-hosted build.
- Login: LOKI_API_URL=https://api.lokiplay.cc npx lokiplay@${v} login
- No inline scripts, remote fonts, or forms.
- Layer 2 public catalog is closed.
- Native Swift/Kotlin/Unity ${v} clients support synchronized rooms only.

## Full docs
https://docs.lokiplay.cc/llms-full.txt
`;
