import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const token = process.env.CLOUDFLARE_API_TOKEN;
const outputPosition = process.argv.indexOf("--output");
const output =
  outputPosition === -1 ? undefined : process.argv[outputPosition + 1];
if (!token) {
  throw new Error("CLOUDFLARE_API_TOKEN is required");
}

const spec = JSON.parse(
  await readFile(resolve("infra/cloudflare/api-rate-limits.json"), "utf8"),
) as {
  zone: string;
  host: string;
  rules: {
    name: string;
    expression: string;
    periodSeconds: number;
    requests: number;
  }[];
};

const zones = (await (
  await fetch(
    `https://api.cloudflare.com/client/v4/zones?name=${encodeURIComponent(spec.zone)}`,
    { headers: { authorization: `Bearer ${token}` } },
  )
).json()) as { result?: { id: string }[] };
const zoneId = zones.result?.[0]?.id;
if (!zoneId) throw new Error(`Cloudflare zone ${spec.zone} not found`);

const ruleset = (await (
  await fetch(
    `https://api.cloudflare.com/client/v4/zones/${zoneId}/rulesets/phases/http_ratelimit/entrypoint`,
    { headers: { authorization: `Bearer ${token}` } },
  )
).json()) as { result?: { id?: string }; success?: boolean; errors?: unknown };

const body = {
  rules: spec.rules.map((rule) => ({
    action: "block",
    expression: rule.expression,
    description: rule.name,
    ratelimit: {
      characteristics: ["ip.src"],
      period: rule.periodSeconds,
      requests_per_period: rule.requests,
      mitigation_timeout: rule.periodSeconds,
    },
  })),
};

const updated = await fetch(
  ruleset.result?.id
    ? `https://api.cloudflare.com/client/v4/zones/${zoneId}/rulesets/${ruleset.result.id}`
    : `https://api.cloudflare.com/client/v4/zones/${zoneId}/rulesets`,
  {
    method: ruleset.result?.id ? "PUT" : "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(
      ruleset.result?.id
        ? body
        : { name: "lokiplay-api-rate-limits", kind: "zone", phase: "http_ratelimit", ...body },
    ),
  },
);
const payload = (await updated.json()) as { success?: boolean; errors?: unknown; result?: unknown };
if (!updated.ok || payload.success === false) {
  throw new Error(`Cloudflare rate-limit update failed: ${JSON.stringify(payload.errors ?? payload)}`);
}

const artifact = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  zone: spec.zone,
  host: spec.host,
  applied: spec.rules.map((rule) => rule.name),
  passed: true,
};
if (output) {
  await writeFile(resolve(output), `${JSON.stringify(artifact, null, 2)}\n`, {
    flag: "wx",
  });
}
console.log(JSON.stringify(artifact, null, 2));
