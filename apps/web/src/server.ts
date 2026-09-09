import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { URL } from "node:url";
import type {
  ArtifactReadStore,
  Deployment,
} from "../../api/src/deployments.js";
import type {
  Awaitable,
  PlatformOperations,
} from "../../api/src/platform.js";
import { renderCreatorPage } from "./creator-page.js";
import { renderDevicePage } from "./device-page.js";
import { renderMarketingPage } from "./marketing-page.js";
import { renderOperatorPage } from "./operator-page.js";
import { gameSecurityHeaders, renderPlayerShell } from "./player.js";
import { renderPlayerPlatformPage } from "./player-platform-page.js";
import type { ProductPageConfig } from "./product-theme.js";

export interface WebDependencies {
  platform: PlatformOperations;
  deployments: {
    get(
      projectId: string,
      deploymentId: string,
    ): Awaitable<Deployment | undefined>;
  };
  artifacts: ArtifactReadStore;
  authorizePlay(
    request: IncomingMessage,
    projectId: string,
  ): Promise<string | undefined | void>;
  gameOrigin(projectId: string): string;
  productConfig?: ProductPageConfig;
  readiness?(): Promise<Record<string, boolean>>;
  log?(record: Record<string, unknown>): void;
}

const mimeTypes: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".wasm": "application/wasm",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
};

function fail(response: ServerResponse, status: number, message: string): void {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  response.end(`${JSON.stringify({ error: message })}\n`);
}

function requestHostname(request: IncomingMessage): string {
  const host = request.headers.host ?? "";
  return host.replace(/:\d+$/, "").replace(/\.$/, "").toLowerCase();
}

export function createWebHandler(dependencies: WebDependencies) {
  return async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    const requestId =
      typeof request.headers["x-request-id"] === "string" &&
      /^[A-Za-z0-9_-]{8,128}$/.test(request.headers["x-request-id"])
        ? request.headers["x-request-id"]
        : randomUUID();
    const startedAt = Date.now();
    response.setHeader("x-request-id", requestId);
    response.once("finish", () => dependencies.log?.({
      type: "request",
      requestId,
      method: request.method,
      path: (request.url ?? "/").split("?", 1)[0],
      status: response.statusCode,
      durationMs: Date.now() - startedAt,
    }));
    try {
      const url = new URL(request.url ?? "/", "http://web.local");
      if (
        request.method === "GET" &&
        (url.pathname === "/health" || url.pathname === "/health/live")
      ) {
        response.writeHead(200, {
          "content-type": "application/json; charset=utf-8",
          "cache-control": "no-store",
        });
        response.end('{"ok":true}\n');
        return;
      }
      if (request.method === "GET" && url.pathname === "/health/ready") {
        const checks = (await dependencies.readiness?.()) ?? {};
        const ok = Object.values(checks).every(Boolean);
        response.writeHead(ok ? 200 : 503, {
          "content-type": "application/json; charset=utf-8",
          "cache-control": "no-store",
        });
        response.end(`${JSON.stringify({ ok, checks })}\n`);
        return;
      }
      if (
        request.method === "GET" &&
        url.pathname === "/assets/loki-vibecoded-game-montage.png"
      ) {
        const image = await readFile(
          new URL("./assets/loki-vibecoded-game-montage.png", import.meta.url),
        );
        response.writeHead(200, {
          "content-type": "image/png",
          "cache-control": "public, max-age=31536000, immutable",
          "x-content-type-options": "nosniff",
        });
        response.end(image);
        return;
      }
      const hostname = requestHostname(request);
      const playerHost = hostname === "play.lokiplay.cc";
      const creatorHost = hostname === "app.lokiplay.cc";
      let productPage: string | undefined;
      if (request.method === "GET" && dependencies.productConfig) {
        if (url.pathname === "/") {
          productPage = playerHost
            ? renderPlayerPlatformPage(dependencies.productConfig)
            : creatorHost
              ? renderCreatorPage(dependencies.productConfig)
              : renderMarketingPage(dependencies.productConfig);
        } else if (url.pathname === "/play") {
          productPage = renderPlayerPlatformPage(dependencies.productConfig);
        } else if (
          url.pathname === "/creator" ||
          url.pathname === "/login" ||
          url.pathname === "/signup"
        ) {
          productPage = renderCreatorPage(dependencies.productConfig);
        } else if (url.pathname === "/device") {
          productPage = renderDevicePage(
            dependencies.productConfig,
            url.searchParams.get("user_code") ?? "",
          );
        } else if (url.pathname === "/operator") {
          productPage = renderOperatorPage(dependencies.productConfig);
        }
      }
      if (productPage && dependencies.productConfig) {
        const apiOrigin = new URL(dependencies.productConfig.apiOrigin).origin;
        const authOrigin = new URL(dependencies.productConfig.supabaseUrl).origin;
        response.writeHead(200, {
          "content-type": "text/html; charset=utf-8",
          "content-security-policy":
            `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' data:; connect-src ${apiOrigin} ${authOrigin}; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; object-src 'none'`,
          "cache-control": "no-store",
          "referrer-policy": "strict-origin-when-cross-origin",
          "x-content-type-options": "nosniff",
          "x-frame-options": "DENY",
        });
        response.end(productPage);
        return;
      }
      const play = url.pathname.match(/^\/play\/([0-9a-f-]{36})$/i);
      if (request.method === "GET" && play) {
        const projectId = play[1]!;
        const playInvite = await dependencies.authorizePlay(request, projectId);
        const project = await dependencies.platform.playableProject(projectId);
        const deployment = await dependencies.deployments.get(
          projectId,
          project.activeDeploymentId!,
        );
        if (!deployment) throw new Error("deployment not found");
        const apiOrigin =
          dependencies.productConfig?.apiOrigin ?? "https://api.lokiplay.cc";
        const html = renderPlayerShell({
          title: project.name,
          projectId,
          deploymentId: project.activeDeploymentId!,
          gameOrigin: dependencies.gameOrigin(projectId),
          entrypoint: deployment.manifest.entrypoint,
          apiOrigin,
          playInvite: playInvite || undefined,
        });
        const gameOrigin = new URL(dependencies.gameOrigin(projectId)).origin;
        response.writeHead(200, {
          "content-type": "text/html; charset=utf-8",
          "content-security-policy":
            `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; frame-src ${gameOrigin}; connect-src ${new URL(apiOrigin).origin}; base-uri 'none'; object-src 'none'`,
          "cache-control": "no-store",
          "x-content-type-options": "nosniff",
        });
        response.end(html);
        return;
      }

      const release = url.pathname.match(
        /^\/games\/([0-9a-f-]{36})\/releases\/([0-9a-f-]{36})\/(.+)$/i,
      );
      if (request.method === "GET" && release) {
        const [, projectId, deploymentId, encodedFile] = release;
        const playInvite = await dependencies.authorizePlay(request, projectId!);
        const file = decodeURIComponent(encodedFile!).replaceAll("\\", "/");
        if (
          file.startsWith("/") ||
          file.split("/").includes("..") ||
          path.posix.normalize(file) !== file
        ) {
          fail(response, 400, "invalid asset path");
          return;
        }
        const deployment = await dependencies.deployments.get(
          projectId!,
          deploymentId!,
        );
        if (!deployment) throw new Error("deployment not found");
        const project = await dependencies.platform.playableProject(projectId!);
        if (
          project.activeDeploymentId !== deploymentId ||
          !["ready", "ready_with_warnings"].includes(deployment.status)
        ) {
          fail(response, 404, "release unavailable");
          return;
        }
        const bytes = await dependencies.artifacts.get(deploymentId!, file);
        if (!bytes) {
          fail(response, 404, "asset not found");
          return;
        }
        response.writeHead(200, {
          ...gameSecurityHeaders(
            deployment.manifest,
            dependencies.gameOrigin(projectId!),
          ),
          "content-type":
            mimeTypes[path.posix.extname(file).toLowerCase()] ??
            "application/octet-stream",
          "cache-control": "public, max-age=31536000, immutable",
          etag: `"${deployment.contentHash}"`,
          ...(playInvite
            ? {
                "set-cookie":
                  `loki_play_invite=${encodeURIComponent(playInvite)}; Path=/games/${projectId}/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`,
              }
            : {}),
        });
        response.end(Buffer.from(bytes));
        return;
      }
      fail(response, 404, "not found");
    } catch (error) {
      fail(response, 403, error instanceof Error ? error.message : "request failed");
    }
  };
}

export function startWebServer(
  dependencies: WebDependencies,
  port = 8788,
  host = "127.0.0.1",
): ReturnType<typeof createServer> {
  const server = createServer((request, response) => {
    void createWebHandler(dependencies)(request, response);
  });
  return server.listen(port, host);
}
