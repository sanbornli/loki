import { timingSafeEqual } from "node:crypto";

export type RateLimitRule = { limit: number; window: number };

const exact: Record<string, RateLimitRule> = {
  "POST:/v1/organizations": { limit: 10, window: 3600 },
  "POST:/v1/projects": { limit: 20, window: 3600 },
  "POST:/v1/cli/device": { limit: 20, window: 60 },
  "POST:/v1/cli/device/approve": { limit: 20, window: 60 },
  "POST:/v1/player-sessions": { limit: 60, window: 60 },
  "POST:/v1/nakama-session": { limit: 60, window: 60 },
  "POST:/v1/deployments": { limit: 20, window: 3600 },
  "POST:/v1/github/webhooks": { limit: 300, window: 60 },
  "GET:/v1/github/callback": { limit: 30, window: 60 },
  "POST:/v1/github/callback": { limit: 30, window: 60 },
  "POST:/v1/reports": { limit: 30, window: 60 },
  "POST:/v1/runtime-reports": { limit: 30, window: 60 },
};

/**
 * With `edgeSecret` set, `cf-connecting-ip` is trusted only when the request
 * carries a matching `x-loki-edge-secret` (added by Cloudflare), so callers who
 * reach the origin directly cannot spoof their address. Otherwise the last
 * `x-forwarded-for` entry (appended by the platform proxy) is used.
 * Without `edgeSecret`, the previous header-trusting behavior applies.
 */
export function clientAddress(
  headers: Record<string, string | string[] | undefined>,
  remoteAddress?: string,
  edgeSecret?: string,
): string {
  const read = (name: string): string | undefined => {
    const value = headers[name] ?? headers[name.toLowerCase()];
    return Array.isArray(value) ? value[0] : value;
  };
  if (!edgeSecret) {
    const forwarded = read("cf-connecting-ip") ?? read("x-forwarded-for");
    const first = forwarded?.split(",")[0]?.trim();
    return first || remoteAddress || "unknown";
  }
  const supplied = read("x-loki-edge-secret") ?? "";
  const expected = Buffer.from(edgeSecret);
  const given = Buffer.from(supplied);
  if (
    given.length === expected.length &&
    timingSafeEqual(given, expected)
  ) {
    const trusted = read("cf-connecting-ip")?.trim();
    if (trusted) return trusted;
  }
  const last = read("x-forwarded-for")?.split(",").at(-1)?.trim();
  return last || remoteAddress || "unknown";
}

export function rateLimitFor(
  method: string,
  pathname: string,
): RateLimitRule | undefined {
  const key = `${method.toUpperCase()}:${pathname}`;
  if (exact[key]) return exact[key];
  if (
    method === "GET" &&
    /^\/v1\/cli\/device\/[A-Za-z0-9_-]+$/.test(pathname)
  ) {
    return { limit: 60, window: 60 };
  }
  if (
    method === "DELETE" &&
    /^\/v1\/projects\/[0-9a-f-]{36}$/i.test(pathname)
  ) {
    return { limit: 20, window: 3600 };
  }
  if (
    method === "POST" &&
    /^\/v1\/projects\/[0-9a-f-]{36}\/deployment-credentials$/i.test(pathname)
  ) {
    return { limit: 20, window: 3600 };
  }
  if (
    method === "POST" &&
    /^\/v1\/deployments\/[0-9a-f-]{36}\/activate$/i.test(pathname)
  ) {
    return { limit: 20, window: 3600 };
  }
  return undefined;
}
