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

export function gameSecurityHeaders(
  manifest: GameManifest,
  resourceOrigin: string,
): Record<string, string> {
  const assetsOrigin = new URL(resourceOrigin).origin;
  const connections = [
    "https://api.lokiplay.cc",
    "https://multiplayer.lokiplay.cc",
    "wss://multiplayer.lokiplay.cc",
    ...manifest.networkAllowlist.map((value) => new URL(value).origin),
  ].join(" ");
  return {
    "content-security-policy": [
      "default-src 'none'",
      `script-src ${assetsOrigin}`,
      `style-src ${assetsOrigin} 'unsafe-inline'`,
      `img-src ${assetsOrigin} data: blob:`,
      `media-src ${assetsOrigin} blob:`,
      `font-src ${assetsOrigin}`,
      `connect-src ${connections}`,
      `worker-src ${assetsOrigin} blob:`,
      "frame-src 'none'",
      "object-src 'none'",
      "base-uri 'none'",
      "form-action 'none'",
    ].join("; "),
    "permissions-policy":
      "camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=()",
    "cross-origin-resource-policy": "cross-origin",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
  };
}

export const playServiceWorkerSource = `self.addEventListener("fetch", (event) => {
  event.respondWith(fetch(event.request));
});
`;

export function renderPlayManifest(input: {
  title: string;
  startUrl: string;
}): string {
  const name = input.title.trim() || "Loki";
  return JSON.stringify({
    name,
    short_name: name.length <= 12 ? name : name.slice(0, 12),
    id: input.startUrl,
    start_url: input.startUrl,
    display: "standalone",
    background_color: "#09090b",
    theme_color: "#09090b",
    icons: [
      {
        src: "/assets/loki-app-icon-dark.png",
        sizes: "1024x1024",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/assets/loki-app-icon-light.png",
        sizes: "1024x1024",
        type: "image/png",
        purpose: "any",
      },
    ],
  });
}

export function renderPlayerShell(input: {
  title: string;
  projectId: string;
  deploymentId: string;
  gameOrigin: string;
  entrypoint?: string;
  apiOrigin?: string;
  playInvite?: string;
  playPath: string;
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
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <link rel="manifest" href="${escapeHtml(input.playPath)}/app.webmanifest">
  <link rel="apple-touch-icon" href="/assets/loki-app-icon-dark.png">
  <title>${escapeHtml(input.title)} — Loki</title>
  <style>
    html,body,main,iframe{width:100%;height:100%;margin:0;border:0}
    body{overflow:hidden;background:#09090b;color:white;font:14px system-ui}
    #status{position:fixed;z-index:2;top:12px;left:12px;padding:6px 10px;border-radius:99px;background:#18181bcc}
    #install{position:fixed;z-index:3;left:12px;right:12px;bottom:12px;display:none;gap:10px;align-items:center;justify-content:space-between;padding:12px;border-radius:14px;background:#18181bf2}
    #install p{margin:0}
    #install button{font:inherit;border:0;border-radius:99px;padding:8px 12px;background:#f4efe3;color:#09090b}
    @media (pointer: fine) { #install { display:none !important } }
    @media (display-mode: standalone) { #install { display:none !important } }
  </style>
</head>
<body>
  <div id="status" role="status">Connecting…</div>
  <main>
    <iframe
      title="${escapeHtml(input.title)}"
      src="${escapeHtml(gameUrl.toString())}"
      sandbox="allow-scripts allow-pointer-lock allow-same-origin"
      allow="gamepad; fullscreen; clipboard-write"
      referrerpolicy="no-referrer"
    ></iframe>
  </main>
  <script type="module">
    const frame = document.querySelector("iframe");
    const status = document.querySelector("#status");
    const nonce = crypto.randomUUID();
    const apiOrigin = ${JSON.stringify(input.apiOrigin ?? "https://api.lokiplay.cc")};
    const pendingPorts = new Set();
    let bridgePort;
    let handshakeTimer;
    let connectionTimer;

    const stopHandshake = (selectedPort) => {
      window.clearInterval(handshakeTimer);
      window.clearTimeout(connectionTimer);
      for (const port of pendingPorts) {
        if (port !== selectedPort) port.close();
      }
      pendingPorts.clear();
      if (selectedPort) pendingPorts.add(selectedPort);
    };

    const handleBridgeMessage = (port, event) => {
      if (event.data?.nonce !== nonce) return;
      if (bridgePort && bridgePort !== port) return;
      bridgePort = port;
      stopHandshake(port);
      if (event.data.type === "loki:ready") {
        status.textContent = "Connected";
      }
      if (event.data.type === "loki:session") {
        status.textContent = "Authorizing…";
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
            port.postMessage({
              type: "loki:session",
              nonce,
              requestId: event.data.requestId,
              session: await nakamaResponse.json(),
            });
            status.textContent = "Connected";
            window.setTimeout(() => {
              status.hidden = true;
            }, 1_500);
          } catch (error) {
            status.textContent = "Connection failed";
            status.title = error instanceof Error ? error.message : "session failed";
            port.postMessage({
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

    const offerBridge = () => {
      if (bridgePort) return;
      const channel = new MessageChannel();
      pendingPorts.add(channel.port1);
      channel.port1.onmessage = (event) => handleBridgeMessage(channel.port1, event);
      channel.port1.start();
      frame.contentWindow.postMessage(
        { type: "loki:init", protocolVersion: 1, nonce },
        "*",
        [channel.port2],
      );
    };

    frame.addEventListener("load", () => {
      status.textContent = "Connecting…";
      offerBridge();
      handshakeTimer = window.setInterval(offerBridge, 500);
      connectionTimer = window.setTimeout(() => {
        stopHandshake();
        status.textContent = "Connection timed out";
        status.title = "The game did not request a multiplayer session.";
      }, 15_000);
    });

    const coarsePointer = window.matchMedia("(pointer: coarse)").matches;
    const mobileUa = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
    const installed = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
    const dismissed = (() => {
      try { return localStorage.getItem("loki_pwa_dismissed") === "1"; }
      catch { return false; }
    })();
    if (coarsePointer && mobileUa && !installed && !dismissed) {
      navigator.serviceWorker.register("/play/sw.js", { scope: "/play/" }).catch(() => {});
      const rememberDismiss = () => {
        try { localStorage.setItem("loki_pwa_dismissed", "1"); } catch {}
      };
      const banner = document.createElement("aside");
      banner.id = "install";
      banner.setAttribute("role", "dialog");
      banner.setAttribute("aria-label", "Add to Home Screen");
      const copy = document.createElement("p");
      const dismissButton = document.createElement("button");
      dismissButton.type = "button";
      dismissButton.textContent = "Not now";
      dismissButton.addEventListener("click", () => {
        banner.remove();
        rememberDismiss();
      });
      const ios = /iPhone|iPad|iPod/i.test(navigator.userAgent);
      if (ios) {
        copy.textContent = "Tap Share, then Add to Home Screen for a better experience.";
        banner.append(copy, dismissButton);
        banner.style.display = "flex";
        document.body.append(banner);
      } else {
        window.addEventListener("beforeinstallprompt", (event) => {
          event.preventDefault();
          copy.textContent = "Add to Home Screen for a better experience";
          const addButton = document.createElement("button");
          addButton.type = "button";
          addButton.textContent = "Add";
          addButton.addEventListener("click", () => {
            void event.prompt();
            banner.remove();
            rememberDismiss();
          });
          banner.append(copy, addButton, dismissButton);
          banner.style.display = "flex";
          document.body.append(banner);
        });
      }
    }
  </script>
</body>
</html>`;
}
