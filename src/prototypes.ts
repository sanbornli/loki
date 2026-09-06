import { Worker } from "node:worker_threads";
import { performance } from "node:perf_hooks";

export type ClientKind = "javascript" | "swift" | "kotlin" | "unity";
export type AuthorityMode = "host" | "server";

export interface SessionClaims {
  playerId: string;
  projectId: string;
  client: ClientKind;
}

export interface ProtocolEnvelope<T = unknown> {
  version: 1;
  projectId: string;
  roomId: string;
  sequence: number;
  type: "action" | "event" | "snapshot";
  payload: T;
}

export function decodeEnvelope(
  raw: string,
  trustedProjectId: string,
): ProtocolEnvelope {
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== "object") throw new Error("invalid envelope");
  const envelope = value as Partial<ProtocolEnvelope>;
  if (
    envelope.version !== 1 ||
    envelope.projectId !== trustedProjectId ||
    typeof envelope.roomId !== "string" ||
    !Number.isSafeInteger(envelope.sequence) ||
    !["action", "event", "snapshot"].includes(envelope.type ?? "")
  ) {
    throw new Error("invalid or cross-tenant envelope");
  }
  return envelope as ProtocolEnvelope;
}

/**
 * An in-memory stand-in for the trusted Nakama module. The API deliberately
 * accepts a signed session, not a client-provided tenant identifier.
 */
export class SharedNakamaPrototype {
  readonly #sessions = new Map<string, SessionClaims>();
  readonly #queues = new Map<string, SessionClaims[]>();

  issueSession(claims: SessionClaims): string {
    const token = crypto.randomUUID();
    this.#sessions.set(token, structuredClone(claims));
    return token;
  }

  authenticate(token: string): SessionClaims {
    const claims = this.#sessions.get(token);
    if (!claims) throw new Error("invalid session");
    return structuredClone(claims);
  }

  enqueue(token: string): SessionClaims[] | undefined {
    const claims = this.authenticate(token);
    const queue = this.#queues.get(claims.projectId) ?? [];
    if (queue.some((entry) => entry.playerId === claims.playerId)) {
      throw new Error("already queued");
    }
    queue.push(claims);
    this.#queues.set(claims.projectId, queue);
    if (queue.length < 2) return undefined;
    return queue.splice(0, 2).map((entry) => structuredClone(entry));
  }
}

export interface RoomSnapshot<T> {
  roomId: string;
  projectId: string;
  hostId: string;
  version: number;
  state: T;
  members: string[];
}

export class HostAuthoritativeRoom<T> {
  readonly #members = new Map<string, number>();
  #nextJoinOrder = 0;
  #version = 0;
  #state: T;
  #hostId = "";

  constructor(
    readonly roomId: string,
    readonly projectId: string,
    initialState: T,
  ) {
    this.#state = structuredClone(initialState);
  }

  join(claims: SessionClaims): RoomSnapshot<T> {
    this.#assertTenant(claims);
    if (!this.#members.has(claims.playerId)) {
      this.#members.set(claims.playerId, this.#nextJoinOrder++);
    }
    if (!this.#hostId) this.#hostId = claims.playerId;
    return this.snapshot();
  }

  leave(claims: SessionClaims): RoomSnapshot<T> | undefined {
    this.#assertTenant(claims);
    this.#members.delete(claims.playerId);
    if (this.#members.size === 0) return undefined;
    if (claims.playerId === this.#hostId) {
      this.#hostId = [...this.#members.entries()].sort(
        ([, left], [, right]) => left - right,
      )[0]![0];
    }
    return this.snapshot();
  }

  update(claims: SessionClaims, expectedVersion: number, state: T): RoomSnapshot<T> {
    this.#assertTenant(claims);
    if (claims.playerId !== this.#hostId) throw new Error("host required");
    if (expectedVersion !== this.#version) throw new Error("stale version");
    this.#state = structuredClone(state);
    this.#version += 1;
    return this.snapshot();
  }

  snapshot(): RoomSnapshot<T> {
    if (!this.#hostId) throw new Error("room is empty");
    return {
      roomId: this.roomId,
      projectId: this.projectId,
      hostId: this.#hostId,
      version: this.#version,
      state: structuredClone(this.#state),
      members: [...this.#members.keys()],
    };
  }

  get empty(): boolean {
    return this.#members.size === 0;
  }

  #assertTenant(claims: SessionClaims): void {
    if (claims.projectId !== this.projectId) throw new Error("tenant mismatch");
  }
}

export const SANDBOX_CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  "font-src 'self'",
  "connect-src 'none'",
  "worker-src 'self' blob:",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");

export interface SandboxLaunch {
  gameOrigin: string;
  iframeSandbox: string;
  headers: Record<string, string>;
}

export function createSandboxLaunch(projectId: string, releaseId: string): SandboxLaunch {
  if (!/^[a-z0-9-]+$/.test(projectId) || !/^[a-z0-9-]+$/.test(releaseId)) {
    throw new Error("invalid immutable release identifier");
  }
  return {
    gameOrigin: `https://${projectId}.games.loki.invalid/releases/${releaseId}/index.html`,
    iframeSandbox: "allow-scripts allow-pointer-lock allow-gamepad",
    headers: {
      "content-security-policy": SANDBOX_CSP,
      "cross-origin-resource-policy": "same-origin",
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
    },
  };
}

export function validateBridgeMessage(
  eventOrigin: string,
  expectedOrigin: string,
  expectedProjectId: string,
  value: unknown,
): ProtocolEnvelope {
  if (eventOrigin !== expectedOrigin) throw new Error("untrusted bridge origin");
  return decodeEnvelope(JSON.stringify(value), expectedProjectId);
}

export interface RulesPackage {
  projectId: string;
  version: string;
  source: string;
}

export interface RunnerResult<T = unknown> {
  ok: boolean;
  state?: T;
  events?: unknown[];
  error?: "timeout" | "rule_error" | "invalid_result" | "worker_error";
  durationMs: number;
}

const WORKER_SOURCE = `
  const { parentPort, workerData } = require("node:worker_threads");
  function seeded(seed) {
    let value = seed >>> 0;
    return () => {
      value = (value * 1664525 + 1013904223) >>> 0;
      return value / 4294967296;
    };
  }
  try {
    const rule = Function(
      '"use strict"; return (' + workerData.source + ')'
    )();
    const frozenAction = Object.freeze(structuredClone(workerData.action));
    const api = Object.freeze({ random: seeded(workerData.seed), now: () => workerData.tick });
    const result = rule(structuredClone(workerData.state), frozenAction, api);
    if (!result || typeof result !== "object" || !("state" in result)) {
      parentPort.postMessage({ ok: false, error: "invalid_result" });
    } else {
      parentPort.postMessage({ ok: true, state: result.state, events: result.events ?? [] });
    }
  } catch {
    parentPort.postMessage({ ok: false, error: "rule_error" });
  }
`;

export class IsolatedRulesRunner {
  constructor(
    readonly timeoutMs = 50,
    readonly memoryMb = 16,
  ) {}

  execute<T>(
    rules: RulesPackage,
    state: T,
    action: unknown,
    seed: number,
    tick: number,
  ): Promise<RunnerResult<T>> {
    const started = performance.now();
    return new Promise((resolve) => {
      let settled = false;
      const worker = new Worker(WORKER_SOURCE, {
        eval: true,
        workerData: { source: rules.source, state, action, seed, tick },
        resourceLimits: {
          maxOldGenerationSizeMb: this.memoryMb,
          maxYoungGenerationSizeMb: Math.max(2, Math.floor(this.memoryMb / 4)),
          stackSizeMb: 1,
        },
      });
      const finish = (result: Omit<RunnerResult<T>, "durationMs">): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        void worker.terminate();
        resolve({ ...result, durationMs: performance.now() - started });
      };
      const timer = setTimeout(
        () => finish({ ok: false, error: "timeout" }),
        this.timeoutMs,
      );
      worker.once("message", (message: Omit<RunnerResult<T>, "durationMs">) =>
        finish(message),
      );
      worker.once("error", () => finish({ ok: false, error: "worker_error" }));
      worker.once("exit", (code) => {
        if (code !== 0) finish({ ok: false, error: "worker_error" });
      });
    });
  }
}

export interface AdapterBroadcast<T> {
  roomId: string;
  projectId: string;
  rulesVersion: string;
  sequence: number;
  state: T;
  events: unknown[];
}

export class NakamaRunnerAdapter<T> {
  #sequence = 0;
  #state: T;

  constructor(
    readonly projectId: string,
    readonly roomId: string,
    initialState: T,
    readonly rules: RulesPackage,
    readonly runner: IsolatedRulesRunner,
  ) {
    if (rules.projectId !== projectId) throw new Error("rules tenant mismatch");
    this.#state = structuredClone(initialState);
  }

  async apply(
    claims: SessionClaims,
    action: unknown,
  ): Promise<AdapterBroadcast<T>> {
    if (claims.projectId !== this.projectId) throw new Error("tenant mismatch");
    if (!action || typeof action !== "object") throw new Error("invalid action");
    const nextSequence = this.#sequence + 1;
    const result = await this.runner.execute(
      this.rules,
      this.#state,
      action,
      nextSequence,
      nextSequence,
    );
    if (!result.ok || result.state === undefined) {
      throw new Error(`runner failure: ${result.error}`);
    }
    this.#sequence = nextSequence;
    this.#state = structuredClone(result.state);
    return {
      roomId: this.roomId,
      projectId: this.projectId,
      rulesVersion: this.rules.version,
      sequence: this.#sequence,
      state: structuredClone(this.#state),
      events: result.events ?? [],
    };
  }
}

export type ExtractionLanguage = "javascript" | "swift" | "kotlin" | "csharp";

/**
 * A deliberately narrow extraction spike. It recognizes pure score-update
 * functions in four representative languages and emits one Loki rule package.
 * Unsupported rendering, networking, filesystem, and reflection APIs fail
 * closed instead of being copied into server rules.
 */
export function extractScoreRule(
  language: ExtractionLanguage,
  source: string,
  projectId: string,
): RulesPackage {
  const forbidden = /(fetch|URLSession|Socket|UnityEngine|File\.|java\.io|reflection)/i;
  if (forbidden.test(source)) throw new Error("impure dependency");
  const patterns: Record<ExtractionLanguage, RegExp> = {
    javascript: /score\s*\+=\s*(?:action\.)?amount/,
    swift: /score\s*\+=\s*action\.amount/,
    kotlin: /score\s*\+=\s*action\.amount/,
    csharp: /score\s*\+=\s*action\.amount/,
  };
  if (!patterns[language].test(source)) throw new Error("unsupported rule shape");
  return {
    projectId,
    version: `extracted-${language}-1`,
    source:
      "(state, action) => { if (!Number.isFinite(action.amount)) throw new Error('invalid amount'); " +
      "return { state: { ...state, score: state.score + action.amount }, events: [{ type: 'score' }] }; }",
  };
}

// (module (func (export "add") (param i32 i32) (result i32) local.get 0 local.get 1 i32.add))
export const WASM_ADD_MODULE = Uint8Array.from([
  0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, 0x01, 0x07, 0x01, 0x60,
  0x02, 0x7f, 0x7f, 0x01, 0x7f, 0x03, 0x02, 0x01, 0x00, 0x07, 0x07, 0x01,
  0x03, 0x61, 0x64, 0x64, 0x00, 0x00, 0x0a, 0x09, 0x01, 0x07, 0x00, 0x20,
  0x00, 0x20, 0x01, 0x6a, 0x0b,
]);

export async function evaluateWasm(iterations = 10_000): Promise<{
  startupMs: number;
  operationsPerSecond: number;
  result: number;
}> {
  const startup = performance.now();
  const instance = await WebAssembly.instantiate(WASM_ADD_MODULE);
  const startupMs = performance.now() - startup;
  const add = instance.instance.exports.add as (left: number, right: number) => number;
  const began = performance.now();
  let result = 0;
  for (let index = 0; index < iterations; index += 1) result = add(result, 1);
  const duration = performance.now() - began;
  return {
    startupMs,
    operationsPerSecond: iterations / (duration / 1_000),
    result,
  };
}
