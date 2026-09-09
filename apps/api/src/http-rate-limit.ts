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
};

export function clientAddress(
  headers: Record<string, string | string[] | undefined>,
  remoteAddress?: string,
): string {
  const read = (name: string): string | undefined => {
    const value = headers[name] ?? headers[name.toLowerCase()];
    return Array.isArray(value) ? value[0] : value;
  };
  const forwarded = read("cf-connecting-ip") ?? read("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  return first || remoteAddress || "unknown";
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
