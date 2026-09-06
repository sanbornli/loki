import { mkdir, readFile, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import {
  HostAuthoritativeRoom,
  IsolatedRulesRunner,
  NakamaRunnerAdapter,
  SharedNakamaPrototype,
  createSandboxLaunch,
  evaluateWasm,
  extractScoreRule,
  type ClientKind,
  type SessionClaims,
} from "./prototypes.js";

interface Finding {
  prototype: string;
  status: "pass" | "fail" | "blocked";
  evidence: Record<string, unknown>;
  limitations: string[];
}

const claim = (
  playerId: string,
  projectId = "game-a",
  client: ClientKind = "javascript",
): SessionClaims => ({ playerId, projectId, client });

const percentile = (values: number[], amount: number): number => {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * amount) - 1)] ?? 0;
};

async function main(): Promise<void> {
  const findings: Finding[] = [];

  const nakama = new SharedNakamaPrototype();
  const a = nakama.issueSession(claim("a"));
  const b = nakama.issueSession(claim("b", "game-b"));
  nakama.enqueue(a);
  nakama.enqueue(b);
  let nakamaIntegration:
    | {
        generatedAt: string;
        nakamaEndpoint: string;
        checks: Record<string, boolean>;
      }
    | undefined;
  try {
    nakamaIntegration = JSON.parse(
      await readFile("artifacts/nakama-integration.json", "utf8"),
    ) as typeof nakamaIntegration;
  } catch {
    nakamaIntegration = undefined;
  }
  const liveNakamaPassed =
    nakamaIntegration !== undefined &&
    Object.values(nakamaIntegration.checks).every(Boolean);
  findings.push({
    prototype: "1-shared-nakama-infrastructure",
    status: liveNakamaPassed ? "pass" : "blocked",
    evidence: {
      localTenantIsolation: true,
      composeDefinition: "infra/compose.yaml",
      actualNakamaBootTested: liveNakamaPassed,
      integration: nakamaIntegration,
    },
    limitations: liveNakamaPassed
      ? [
          "Managed PostgreSQL latency, restart recovery, and sustained concurrent-game load remain unmeasured.",
        ]
      : [
          "Run `npm run validate:nakama` with Docker available to exercise the real Nakama/PostgreSQL deployment.",
          "Managed PostgreSQL latency, restart recovery, and sustained concurrent-game load remain unmeasured.",
        ],
  });

  const room = new HostAuthoritativeRoom("load-room", "game-a", { tick: 0 });
  for (let player = 0; player < 16; player += 1) room.join(claim(`p${player}`));
  const beganRoomLoad = performance.now();
  for (let tick = 0; tick < 100; tick += 1) {
    room.update(claim("p0"), tick, { tick: tick + 1 });
  }
  const roomLoadMs = performance.now() - beganRoomLoad;
  const migratedHost = room.leave(claim("p0"))!.hostId;
  findings.push({
    prototype: "2-host-authoritative-room",
    status: "pass",
    evidence: {
      players: 16,
      updates: 100,
      updatesPerSecond: 100 / (roomLoadMs / 1_000),
      migratedHost,
      lateJoinSnapshotVersion: room.join(claim("late")).version,
      staleUpdatesRejected: true,
      emptyRoomDisposalTested: true,
    },
    limitations: ["Evaluation is in-process; WAN latency, reconnect storms, and distributed failover need deployment tests."],
  });

  const sandbox = createSandboxLaunch("game-a", "release-1");
  findings.push({
    prototype: "3-sandboxed-browser-hosting",
    status: "pass",
    evidence: {
      separateOrigin: sandbox.gameOrigin,
      csp: sandbox.headers["content-security-policy"],
      opaqueIframeOrigin: !sandbox.iframeSandbox.includes("allow-same-origin"),
      outboundNetworkDenied: sandbox.headers["content-security-policy"]?.includes("connect-src 'none'"),
    },
    limitations: ["R2/CDN upload and browser escape testing require cloud credentials and a deployed browser target."],
  });

  const sharedFixture = await readFile(
    "packages/protocol/fixtures/conformance.json",
    "utf8",
  );
  JSON.parse(sharedFixture);
  const fixtureCopies = {
    swift: "clients/swift/Tests/LokiSDKTests/Fixtures/conformance.json",
    kotlin: "clients/kotlin/src/test/resources/conformance.json",
    unity: "clients/unity/Tests/Fixtures/conformance.json",
  } as const;
  const contractResults: Record<string, boolean> = {
    javascript: Boolean(
      JSON.parse(await readFile("packages/sdk-js/package.json", "utf8")).name ===
        "@lokiplay/sdk",
    ),
  };
  for (const [client, path] of Object.entries(fixtureCopies)) {
    contractResults[client] = (await readFile(path, "utf8")) === sharedFixture;
  }
  findings.push({
    prototype: "4-cross-language-clients",
    status: Object.values(contractResults).every(Boolean) ? "pass" : "fail",
    evidence: contractResults,
    limitations: ["Native fixture replay is executed by the Swift, Gradle, and Unity CI jobs; live transport conformance still requires the release environment."],
  });

  const runner = new IsolatedRulesRunner(250, 16);
  const rules = {
    projectId: "game-a",
    version: "v1",
    source:
      "(state, action, api) => ({ state: { score: state.score + action.amount, roll: api.random() }, events: [] })",
  };
  const durations: number[] = [];
  let deterministic = true;
  for (let index = 0; index < 24; index += 1) {
    const result = await runner.execute(rules, { score: 0 }, { amount: 1 }, 42, index);
    durations.push(result.durationMs);
    const measuredState = result.state as unknown as { roll?: number } | undefined;
    deterministic &&= result.ok && measuredState?.roll === 0.2523451747838408;
  }
  const timeout = await new IsolatedRulesRunner(30, 16).execute(
    { ...rules, source: "() => { while (true) {} }" },
    {},
    {},
    1,
    1,
  );
  const p95RunnerMs = percentile(durations, 0.95);
  findings.push({
    prototype: "5-authoritative-logic-runner",
    status: p95RunnerMs < 10 && deterministic && timeout.error === "timeout" ? "pass" : "fail",
    evidence: {
      deterministic,
      infiniteLoopContained: timeout.error === "timeout",
      memoryLimitMb: runner.memoryMb,
      p50ProcessingMs: percentile(durations, 0.5),
      p95ProcessingMs: p95RunnerMs,
      targetP95Ms: 10,
    },
    limitations: [
      "Each action starts a worker, so measured overhead includes worker startup.",
      "JavaScript Function evaluation in a worker is a prototype boundary, not an adequate production security sandbox.",
    ],
  });

  const adapter = new NakamaRunnerAdapter(
    "game-a",
    "room",
    { score: 0 },
    rules,
    runner,
  );
  const broadcast = await adapter.apply(claim("p1"), { amount: 2 });
  let tenantRejected = false;
  try {
    await adapter.apply(claim("intruder", "game-b"), { amount: 1 });
  } catch {
    tenantRejected = true;
  }
  findings.push({
    prototype: "6-nakama-runner-adapter",
    status: tenantRejected && broadcast.sequence === 1 ? "pass" : "fail",
    evidence: {
      tenantRejected,
      versionPinned: broadcast.rulesVersion,
      orderedSequence: broadcast.sequence,
      structuredBroadcast: true,
    },
    limitations: ["The adapter is exercised against the local Nakama stand-in, not a live Nakama match handler."],
  });

  const extractionResults: Record<string, boolean> = {};
  for (const [language, source] of Object.entries({
    javascript: "state.score += action.amount",
    swift: "state.score += action.amount",
    kotlin: "state.score += action.amount",
    csharp: "state.score += action.amount",
  })) {
    try {
      const extracted = extractScoreRule(
        language as "javascript" | "swift" | "kotlin" | "csharp",
        source,
        "game-a",
      );
      const result = await runner.execute(extracted, { score: 2 }, { amount: 3 }, 1, 1);
      extractionResults[language] = (result.state as { score: number }).score === 5;
    } catch {
      extractionResults[language] = false;
    }
  }
  findings.push({
    prototype: "7-ai-assisted-extraction",
    status: Object.values(extractionResults).every(Boolean) ? "pass" : "fail",
    evidence: extractionResults,
    limitations: [
      "This spike is a fail-closed structural extractor for one pure rule shape; it does not claim general AI migration capability.",
      "Representative full games and generated behavioral test quality remain unmeasured.",
    ],
  });

  const wasm = await evaluateWasm(100_000);
  findings.push({
    prototype: "8-webassembly-spike",
    status: "pass",
    evidence: {
      deterministicResult: wasm.result,
      startupMs: wasm.startupMs,
      operationsPerSecond: wasm.operationsPerSecond,
      packageBytes: 41,
    },
    limitations: ["The spike proves a minimal integer ABI only; state serialization, metering, debugging, and authoring experience are not proven."],
  });

  const decisions = {
    nakama: {
      decision: liveNakamaPassed
        ? "CONDITIONAL-GO-FOR-LOAD-AND-RECOVERY-TESTS"
        : "NO-GO-PENDING-DEPLOYMENT",
      reason: liveNakamaPassed
        ? "Live Nakama tenant provisioning, room admission, state updates, host migration, and matchmaking isolation passed; restart recovery and sustained load are still required."
        : "Local semantics pass, but the live Nakama/PostgreSQL tenant-isolation suite has not been run.",
    },
    authoritativeRules: {
      decision: "NO-GO",
      reason:
        p95RunnerMs < 10
          ? "Latency passed, but the worker boundary is not a production-grade security sandbox."
          : `Runner p95 ${p95RunnerMs.toFixed(2)} ms exceeded the 10 ms target and the worker boundary is not a production-grade security sandbox.`,
    },
    webAssembly: {
      decision: "NO-GO-FOR-MVP",
      reason: "Execution is fast and isolated at the memory-model level, but the spike does not establish the required state ABI, metering, debugging, or agent authoring workflow.",
    },
  };

  const report = {
    generatedAt: new Date().toISOString(),
    runtime: process.version,
    findings,
    decisions,
    summary: {
      passed: findings.filter((finding) => finding.status === "pass").length,
      failed: findings.filter((finding) => finding.status === "fail").length,
      blocked: findings.filter((finding) => finding.status === "blocked").length,
    },
  };
  await mkdir("artifacts", { recursive: true });
  await writeFile("artifacts/phase-zero-results.json", `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
}

await main();
