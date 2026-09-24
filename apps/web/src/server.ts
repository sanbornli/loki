import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
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
import { buildLlmsFull, isDocsRoute, llmsTxt, renderDocsPage } from "./docs-page.js";
import { isMarketingRoute, renderMarketingPage } from "./marketing-page.js";
import { renderOperatorPage } from "./operator-page.js";
import {
  gameSecurityHeaders,
  playServiceWorkerSource,
  renderPlayManifest,
  renderPlayerShell,
} from "./player.js";
import { renderPlayerPlatformPage } from "./player-platform-page.js";
import type { ProductPageConfig } from "./product-theme.js";

const staticImageAssets: Record<string, { file: string; type: string }> = {
  "/assets/loki-vibecoded-game-montage.png": {
    file: "./assets/loki-vibecoded-game-montage.png",
    type: "image/png",
  },
  "/assets/loki-mark.png": {
    file: "./assets/brand/loki-mark.png",
    type: "image/png",
  },
  "/assets/loki-app-icon-dark.png": {
    file: "./assets/brand/loki-app-icon-dark.png",
    type: "image/png",
  },
  "/assets/loki-app-icon-light.png": {
    file: "./assets/brand/loki-app-icon-light.png",
    type: "image/png",
  },
  "/assets/loki-lockup-dark.png": {
    file: "./assets/brand/loki-lockup-dark.png",
    type: "image/png",
  },
  "/assets/loki-lockup-light.png": {
    file: "./assets/brand/loki-lockup-light.png",
    type: "image/png",
  },
  "/assets/loki-game-montage.mp4": {
    file: "./assets/marketing/loki-game-montage.mp4",
    type: "video/mp4",
  },
  "/assets/loki-game-montage.webp": {
    file: "./assets/marketing/loki-game-montage.webp",
    type: "image/webp",
  },
  "/assets/loki-world-network.mp4": {
    file: "./assets/marketing/loki-world-network.mp4",
    type: "video/mp4",
  },
  "/assets/loki-world-network.webp": {
    file: "./assets/marketing/loki-world-network.webp",
    type: "image/webp",
  },
};

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

let cachedLlmsFull: string | undefined;

async function docsMachineText(pathname: string): Promise<string> {
  if (pathname === "/llms.txt") return `${llmsTxt.trim()}\n`;
  if (cachedLlmsFull) return cachedLlmsFull;
  const agentsPath = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../../packages/agent-instructions/templates/AGENTS.md",
  );
  cachedLlmsFull = `${buildLlmsFull(await readFile(agentsPath, "utf8")).trim()}\n`;
  return cachedLlmsFull;
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
  const forwarded = request.headers["x-forwarded-host"];
  const host =
    (typeof forwarded === "string" ? forwarded.split(",", 1)[0] : undefined) ??
    request.headers.host ??
    "";
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
      if (request.method === "GET") {
        const staticAsset = staticImageAssets[url.pathname];
        if (staticAsset) {
          const image = await readFile(new URL(staticAsset.file, import.meta.url));
          response.writeHead(200, {
            "content-type": staticAsset.type,
            "cache-control": "public, max-age=31536000, immutable",
            "x-content-type-options": "nosniff",
          });
          response.end(image);
          return;
        }
      }
      const hostname = requestHostname(request);
      const playerHost = hostname === "play.lokiplay.cc";
      const creatorHost = hostname === "app.lokiplay.cc";
      const docsHost = hostname === "docs.lokiplay.cc";
      let productPage: string | undefined;
      if (request.method === "GET" && dependencies.productConfig) {
        if (docsHost && (url.pathname === "/llms.txt" || url.pathname === "/llms-full.txt")) {
          response.writeHead(200, {
            "content-type": "text/plain; charset=utf-8",
            "cache-control": "public, max-age=60, stale-while-revalidate=300",
            "x-content-type-options": "nosniff",
          });
          response.end(await docsMachineText(url.pathname));
          return;
        }
        if (docsHost && (url.pathname === "/" || isDocsRoute(url.pathname))) {
          productPage = renderDocsPage(dependencies.productConfig, url.pathname);
        } else if (url.pathname === "/") {
          productPage = playerHost
            ? renderPlayerPlatformPage(dependencies.productConfig)
            : creatorHost
              ? renderCreatorPage(dependencies.productConfig)
              : renderMarketingPage(dependencies.productConfig);
        } else if (url.pathname === "/play") {
          productPage = renderPlayerPlatformPage(dependencies.productConfig);
        } else if (
          !playerHost &&
          !creatorHost &&
          !docsHost &&
          isMarketingRoute(url.pathname)
        ) {
          productPage = renderMarketingPage(
            dependencies.productConfig,
            url.pathname,
          );
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
            `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' data:; media-src 'self'; connect-src ${apiOrigin} ${authOrigin}; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; object-src 'none'`,
          "cache-control": "no-store",
          "referrer-policy": "strict-origin-when-cross-origin",
          "x-content-type-options": "nosniff",
          "x-frame-options": "DENY",
        });
        response.end(productPage);
        return;
      }
      if (request.method === "GET" && url.pathname === "/play/sw.js") {
        response.writeHead(200, {
          "content-type": "text/javascript; charset=utf-8",
          "cache-control": "no-store",
          "x-content-type-options": "nosniff",
        });
        response.end(playServiceWorkerSource);
        return;
      }
      const playManifestUuid = url.pathname.match(
        /^\/play\/([0-9a-f-]{36})\/app\.webmanifest$/i,
      );
      const playManifestSlugs = url.pathname.match(
        /^\/play\/([a-z0-9-]{3,48})\/([a-z0-9-]{3,48})\/app\.webmanifest$/i,
      );
      if (request.method === "GET" && (playManifestUuid || playManifestSlugs)) {
        const project = playManifestUuid
          ? await dependencies.platform.playableProject(playManifestUuid[1]!)
          : await dependencies.platform.playableProjectBySlugs(
              playManifestSlugs![1]!,
              playManifestSlugs![2]!,
            );
        const startUrl = url.pathname.replace(/\/app\.webmanifest$/i, "");
        response.writeHead(200, {
          "content-type": "application/manifest+json; charset=utf-8",
          "cache-control": "no-store",
          "x-content-type-options": "nosniff",
        });
        response.end(renderPlayManifest({ title: project.name, startUrl }));
        return;
      }
      const playUuid = url.pathname.match(/^\/play\/([0-9a-f-]{36})$/i);
      const playSlugs = url.pathname.match(
        /^\/play\/([a-z0-9-]{3,48})\/([a-z0-9-]{3,48})$/i,
      );
      if (request.method === "GET" && (playUuid || playSlugs)) {
        const project = playUuid
          ? await dependencies.platform.playableProject(playUuid[1]!)
          : await dependencies.platform.playableProjectBySlugs(
              playSlugs![1]!,
              playSlugs![2]!,
            );
        const projectId = project.id;
        const playInvite = await dependencies.authorizePlay(request, projectId);
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
          playPath: url.pathname,
        });
        const gameOrigin = new URL(dependencies.gameOrigin(projectId)).origin;
        response.writeHead(200, {
          "content-type": "text/html; charset=utf-8",
          "content-security-policy":
            `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; worker-src 'self'; manifest-src 'self'; frame-src ${gameOrigin}; connect-src ${new URL(apiOrigin).origin}; base-uri 'none'; object-src 'none'`,
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
