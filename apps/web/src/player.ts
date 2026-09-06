import type { GameManifest } from "../../../packages/protocol/src/index.js";

const escapeHtml = (value: string): string =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character]!,
  );

export function gameSecurityHeaders(manifest: GameManifest): Record<string, string> {
  const connections = [
    "https://api.lokiplay.cc",
    "wss://multiplayer.lokiplay.cc",
    ...manifest.networkAllowlist.map((value) => new URL(value).origin),
  ].join(" ");
  return {
    "content-security-policy": [
      "default-src 'none'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "media-src 'self' blob:",
      "font-src 'self'",
      `connect-src ${connections}`,
      "worker-src 'self' blob:",
      "frame-src 'none'",
      "object-src 'none'",
      "base-uri 'none'",
      "form-action 'none'",
    ].join("; "),
    "permissions-policy":
      "camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=()",
    "cross-origin-resource-policy": "same-origin",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
  };
}

export function renderPlayerShell(input: {
  title: string;
  projectId: string;
  deploymentId: string;
  gameOrigin: string;
  entrypoint?: string;
  apiOrigin?: string;
  playInvite?: string;
}): string {
  const gameUrl = new URL(
    `/games/${encodeURIComponent(input.projectId)}/releases/${encodeURIComponent(
      input.deploymentId,
    )}/${input.entrypoint ?? "index.html"}`,
    input.gameOrigin,
  );
  gameUrl.searchParams.set("project", input.projectId);
  if (input.playInvite) gameUrl.searchParams.set("invite", input.playInvite);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(input.title)} — Loki</title>
  <style>
    html,body,main,iframe{width:100%;height:100%;margin:0;border:0}
    body{overflow:hidden;background:#09090b;color:white;font:14px system-ui}
    #status{position:fixed;z-index:2;top:12px;left:12px;padding:6px 10px;border-radius:99px;background:#18181bcc}
  </style>
</head>
<body>
  <div id="status" role="status">Connecting…</div>
  <main>
    <iframe
      title="${escapeHtml(input.title)}"
      src="${escapeHtml(gameUrl.toString())}"
      sandbox="allow-scripts allow-pointer-lock"
      allow="gamepad; fullscreen"
      referrerpolicy="no-referrer"
    ></iframe>
  </main>
  <script type="module">
    const frame = document.querySelector("iframe");
    const status = document.querySelector("#status");
    const channel = new MessageChannel();
    const nonce = crypto.randomUUID();
    const apiOrigin = ${JSON.stringify(input.apiOrigin ?? "https://api.lokiplay.cc")};
    frame.addEventListener("load", () => {
      frame.contentWindow.postMessage(
        { type: "loki:init", protocolVersion: 1, nonce },
        ${JSON.stringify(gameUrl.origin)},
        [channel.port2],
      );
    });
    channel.port1.onmessage = (event) => {
      if (event.data?.nonce !== nonce) return;
      if (event.data.type === "loki:ready") status.textContent = "Connected";
      if (event.data.type === "loki:session") {
        void (async () => {
          try {
            const playerResponse = await fetch(apiOrigin + "/v1/player-sessions", {
              method: "POST",
              credentials: "include",
              headers: {
                "content-type": "application/json",
                ...(${JSON.stringify(input.playInvite ?? "")}
                  ? { "x-loki-play-invite": ${JSON.stringify(input.playInvite ?? "")} }
                  : {}),
              },
              body: JSON.stringify({ projectId: ${JSON.stringify(input.projectId)} }),
            });
            if (!playerResponse.ok) throw new Error("player session denied");
            const player = await playerResponse.json();
            const nakamaResponse = await fetch(apiOrigin + "/v1/nakama-session", {
              method: "POST",
              headers: { authorization: "Bearer " + player.token },
            });
            if (!nakamaResponse.ok) throw new Error("multiplayer session denied");
            channel.port1.postMessage({
              type: "loki:session",
              nonce,
              requestId: event.data.requestId,
              session: await nakamaResponse.json(),
            });
          } catch (error) {
            channel.port1.postMessage({
              type: "loki:error",
              nonce,
              requestId: event.data.requestId,
              code: "UNAUTHORIZED",
              message: error instanceof Error ? error.message : "session failed",
            });
          }
        })();
      }
    };
  </script>
</body>
</html>`;
}
