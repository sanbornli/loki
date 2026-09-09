import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { strFromU8, unzipSync } from "fflate";
import {
  GameManifestSchema,
  type GameManifest,
} from "../../../packages/protocol/src/index.js";
import { literalOutboundUrls } from "./network-scan.js";
import type { PlatformOperations } from "./platform.js";

export interface ScanFinding {
  severity: "warning" | "error";
  code:
    | "PROHIBITED_FILE"
    | "BACKEND_SOURCE"
    | "POSSIBLE_SECRET"
    | "LOCALHOST_REFERENCE"
    | "UNAPPROVED_NETWORK"
    | "DANGEROUS_SCRIPT";
  file: string;
  message: string;
}

export type SecurityReviewState =
  | "pending"
  | "running"
  | "approved"
  | "quarantined"
  | "failed"
  | "needs_operator";

export interface SecurityReviewSummary {
  state: SecurityReviewState;
  findingRefs: string[];
  lastError?: string;
}

export interface Deployment {
  id: string;
  projectId: string;
  contentHash: string;
  manifest: GameManifest;
  files: string[];
  findings: ScanFinding[];
  status:
    | "ready"
    | "ready_with_warnings"
    | "blocked"
    | "security_review_pending"
    | "quarantined";
  securityReview?: SecurityReviewSummary;
  createdAt: string;
}

export interface ArtifactReadStore {
  get(deploymentId: string, file: string): Promise<Uint8Array | undefined>;
}

export interface ArtifactWriteStore extends ArtifactReadStore {
  putImmutable(deploymentId: string, files: Map<string, Uint8Array>): Promise<void>;
  delete(deploymentId: string): Promise<void>;
}

/** @deprecated Prefer ArtifactReadStore or ArtifactWriteStore at trust boundaries. */
export type ArtifactStore = ArtifactWriteStore;

export interface DeploymentRepository {
  save(deployment: Deployment): Promise<void>;
  get(projectId: string, deploymentId: string): Promise<Deployment | undefined>;
  getByContentHash(
    projectId: string,
    contentHash: string,
  ): Promise<Deployment | undefined>;
  delete(projectId: string, deploymentId: string): Promise<void>;
}

export class DeploymentContentConflictError extends Error {
  constructor() {
    super("deployment content already exists");
    this.name = "DeploymentContentConflictError";
  }
}

export class MemoryDeploymentRepository implements DeploymentRepository {
  readonly #deployments = new Map<string, Deployment>();

  async save(deployment: Deployment): Promise<void> {
    if (
      [...this.#deployments.values()].some(
        (stored) =>
          stored.projectId === deployment.projectId &&
          stored.contentHash === deployment.contentHash,
      )
    ) {
      throw new DeploymentContentConflictError();
    }
    this.#deployments.set(deployment.id, structuredClone(deployment));
  }

  async get(
    projectId: string,
    deploymentId: string,
  ): Promise<Deployment | undefined> {
    const deployment = this.#deployments.get(deploymentId);
    return deployment?.projectId === projectId
      ? structuredClone(deployment)
      : undefined;
  }

  async getByContentHash(
    projectId: string,
    contentHash: string,
  ): Promise<Deployment | undefined> {
    const deployment = [...this.#deployments.values()].find(
      (stored) =>
        stored.projectId === projectId && stored.contentHash === contentHash,
    );
    return deployment ? structuredClone(deployment) : undefined;
  }

  async delete(projectId: string, deploymentId: string): Promise<void> {
    const deployment = this.#deployments.get(deploymentId);
    if (deployment?.projectId === projectId) {
      this.#deployments.delete(deploymentId);
    }
  }
}

export class MemoryArtifactStore implements ArtifactWriteStore {
  readonly #objects = new Map<string, Map<string, Uint8Array>>();

  async putImmutable(
    deploymentId: string,
    files: Map<string, Uint8Array>,
  ): Promise<void> {
    if (this.#objects.has(deploymentId)) throw new Error("immutable release exists");
    this.#objects.set(
      deploymentId,
      new Map([...files].map(([name, bytes]) => [name, bytes.slice()])),
    );
  }

  async get(deploymentId: string, file: string): Promise<Uint8Array | undefined> {
    return this.#objects.get(deploymentId)?.get(file)?.slice();
  }

  async delete(deploymentId: string): Promise<void> {
    this.#objects.delete(deploymentId);
  }
}

const textExtensions = new Set([".html", ".js", ".mjs", ".css", ".json", ".txt"]);
const prohibitedExtensions = new Set([
  ".exe",
  ".dll",
  ".dylib",
  ".so",
  ".sh",
  ".bat",
  ".cmd",
  ".php",
  ".py",
  ".jar",
]);

function safeArchivePath(name: string): string {
  const normalized = name.replaceAll("\\", "/");
  if (
    !normalized ||
    normalized.startsWith("/") ||
    /^[A-Za-z]:/.test(normalized) ||
    normalized.includes("\0") ||
    normalized.split("/").includes("..")
  ) {
    throw new Error(`unsafe archive path: ${name}`);
  }
  return path.posix.normalize(normalized).replace(/^\.\//, "");
}

function preflightZip(archive: Uint8Array): void {
  const view = new DataView(
    archive.buffer,
    archive.byteOffset,
    archive.byteLength,
  );
  const minimumEocd = Math.max(0, archive.byteLength - 65_557);
  let eocd = -1;
  for (let offset = archive.byteLength - 22; offset >= minimumEocd; offset -= 1) {
    if (view.getUint32(offset, true) === 0x06054b50) {
      eocd = offset;
      break;
    }
  }
  if (eocd < 0) throw new Error("invalid ZIP central directory");
  const entryCount = view.getUint16(eocd + 10, true);
  if (entryCount === 0 || entryCount > 1_000) {
    throw new Error("archive must contain 1–1000 files");
  }
  let offset = view.getUint32(eocd + 16, true);
  let totalExpanded = 0;
  const decoder = new TextDecoder();
  for (let index = 0; index < entryCount; index += 1) {
    if (
      offset + 46 > archive.byteLength ||
      view.getUint32(offset, true) !== 0x02014b50
    ) {
      throw new Error("invalid ZIP central directory entry");
    }
    const flags = view.getUint16(offset + 8, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const expandedSize = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const externalAttributes = view.getUint32(offset + 38, true);
    const end = offset + 46 + nameLength + extraLength + commentLength;
    if (end > archive.byteLength) throw new Error("invalid ZIP entry length");
    const name = decoder.decode(archive.subarray(offset + 46, offset + 46 + nameLength));
    safeArchivePath(name);
    if ((flags & 1) !== 0) throw new Error(`encrypted ZIP entry is not allowed: ${name}`);
    const unixMode = externalAttributes >>> 16;
    if ((unixMode & 0o170000) === 0o120000) {
      throw new Error(`symbolic link is not allowed: ${name}`);
    }
    totalExpanded += expandedSize;
    if (
      expandedSize > 50 * 1024 * 1024 ||
      totalExpanded > 100 * 1024 * 1024 ||
      (expandedSize > 1024 * 1024 &&
        (compressedSize === 0 || expandedSize / compressedSize > 100))
    ) {
      throw new Error("ZIP expansion limits exceeded");
    }
    offset = end;
  }
}

function scanFiles(
  files: Map<string, Uint8Array>,
  manifest: GameManifest,
): ScanFinding[] {
  const findings: ScanFinding[] = [];
  const allowedOrigins = new Set(
    manifest.networkAllowlist.map((value) => new URL(value).origin),
  );
  for (const [name, bytes] of files) {
    const extension = path.posix.extname(name).toLowerCase();
    if (prohibitedExtensions.has(extension)) {
      findings.push({
        severity: "error",
        code: "PROHIBITED_FILE",
        file: name,
        message: `Executable or backend file type ${extension} is not hosted`,
      });
    }
    if (/(^|\/)(server|backend)(\.|\/)/i.test(name)) {
      findings.push({
        severity: "error",
        code: "BACKEND_SOURCE",
        file: name,
        message: "Loki accepts finished browser builds, not backend source",
      });
    }
    if (!textExtensions.has(extension) || bytes.byteLength > 2_000_000) continue;
    const source = strFromU8(bytes);
    if (
      /(-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|(?:api|secret)[_-]?key\s*[:=]\s*["'][A-Za-z0-9_-]{16,})/i.test(
        source,
      )
    ) {
      findings.push({
        severity: "error",
        code: "POSSIBLE_SECRET",
        file: name,
        message: "Possible embedded credential",
      });
    }
    if (/https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?/i.test(source)) {
      findings.push({
        severity: "warning",
        code: "LOCALHOST_REFERENCE",
        file: name,
        message: "Localhost will not resolve to a creator backend in production",
      });
    }
    if (/\b(?:eval|new\s+Function)\s*\(/.test(source)) {
      findings.push({
        severity: "error",
        code: "DANGEROUS_SCRIPT",
        file: name,
        message: "Dynamic code evaluation is not allowed",
      });
    }
    for (const outboundUrl of literalOutboundUrls(source)) {
      try {
        const url = new URL(outboundUrl);
        if (
          !["localhost", "127.0.0.1"].includes(url.hostname) &&
          !allowedOrigins.has(url.origin)
        ) {
          findings.push({
            severity: "error",
            code: "UNAPPROVED_NETWORK",
            file: name,
            message: `Outbound origin ${url.origin} is not declared`,
          });
        }
      } catch {
        // The compatibility scanner reports only syntactically valid URLs.
      }
    }
  }
  return findings;
}

export class DeploymentService {
  constructor(
    readonly platform: PlatformOperations,
    readonly artifacts: ArtifactWriteStore = new MemoryArtifactStore(),
    readonly repository: DeploymentRepository = new MemoryDeploymentRepository(),
    readonly securityReviewQueue?: {
      enqueueSecurityReview(deploymentId: string): Promise<void>;
      meter?(
        scopeType: "account" | "project",
        scopeId: string,
        metric: string,
        amount: number,
        periodSeconds: number,
      ): Promise<number>;
    },
  ) {}

  async deployZip(input: {
    credentialId: string;
    secret: string;
    archive: Uint8Array;
    activate?: boolean;
    now?: number;
  }): Promise<Deployment> {
    if (input.archive.byteLength > 25 * 1024 * 1024) {
      throw new Error("compressed build exceeds 25 MiB prototype limit");
    }
    preflightZip(input.archive);
    const auth = await this.platform.consumeDeploymentCredential(
      input.credentialId,
      input.secret,
      input.now,
    );
    const contentHash = createHash("sha256").update(input.archive).digest("hex");
    const existing = await this.repository.getByContentHash(
      auth.projectId,
      contentHash,
    );
    if (existing) {
      await this.activateIfRequested(auth.actorId, existing, input.activate);
      return structuredClone(existing);
    }
    let extracted: Record<string, Uint8Array>;
    try {
      extracted = unzipSync(input.archive);
    } catch {
      throw new Error("invalid ZIP archive");
    }
    const entries = Object.entries(extracted);
    if (entries.length === 0 || entries.length > 1_000) {
      throw new Error("archive must contain 1–1000 files");
    }
    const files = new Map<string, Uint8Array>();
    let totalSize = 0;
    for (const [rawName, bytes] of entries) {
      const name = safeArchivePath(rawName);
      if (name.endsWith("/")) continue;
      totalSize += bytes.byteLength;
      if (totalSize > 100 * 1024 * 1024) {
        throw new Error("expanded build exceeds 100 MiB prototype limit");
      }
      if (files.has(name)) throw new Error(`duplicate archive path: ${name}`);
      files.set(name, bytes);
    }
    await this.securityReviewQueue?.meter?.(
      "project",
      auth.projectId,
      "stored_bytes",
      totalSize,
      30 * 24 * 60 * 60,
    );
    await this.securityReviewQueue?.meter?.(
      "project",
      auth.projectId,
      "deployments",
      1,
      60 * 60,
    );
    const manifestBytes = files.get("game.json");
    if (!manifestBytes) throw new Error("game.json is required");
    let manifestInput: unknown;
    try {
      manifestInput = JSON.parse(strFromU8(manifestBytes));
    } catch {
      throw new Error("game.json is invalid JSON");
    }
    const manifest = GameManifestSchema.parse(manifestInput);
    if (!files.has(manifest.entrypoint)) {
      throw new Error(`entrypoint ${manifest.entrypoint} is missing`);
    }
    const findings = scanFiles(files, manifest);
    const deterministicStatus = findings.some((finding) => finding.severity === "error")
      ? "blocked"
      : findings.length
        ? "ready_with_warnings"
        : "ready";
    const status =
      deterministicStatus === "blocked" || !this.securityReviewQueue
        ? deterministicStatus
        : "security_review_pending";
    const deployment: Deployment = {
      id: randomUUID(),
      projectId: auth.projectId,
      contentHash,
      manifest,
      files: [...files.keys()].sort(),
      findings,
      status,
      createdAt: new Date().toISOString(),
    };
    const storedArtifacts = status !== "blocked";
    if (storedArtifacts) {
      await this.artifacts.putImmutable(deployment.id, files);
    }
    try {
      await this.repository.save(deployment);
      if (status === "security_review_pending") {
        await this.securityReviewQueue!.enqueueSecurityReview(deployment.id);
      }
    } catch (error) {
      if (storedArtifacts) {
        await this.artifacts.delete(deployment.id);
      }
      if (error instanceof DeploymentContentConflictError) {
        const winner = await this.repository.getByContentHash(
          auth.projectId,
          contentHash,
        );
        if (winner) {
          await this.activateIfRequested(auth.actorId, winner, input.activate);
          return structuredClone(winner);
        }
      }
      throw error;
    }
    await this.activateIfRequested(auth.actorId, deployment, input.activate);
    return structuredClone(deployment);
  }

  private async activateIfRequested(
    actorId: string,
    deployment: Deployment,
    activate = false,
  ): Promise<void> {
    if (
      !activate ||
      !["ready", "ready_with_warnings"].includes(deployment.status)
    ) return;
    const project = await this.platform.getProject(actorId, deployment.projectId);
    if (project.activeDeploymentId !== deployment.id) {
      await this.platform.setActiveDeployment(
        actorId,
        deployment.projectId,
        deployment.id,
      );
    }
  }

  async get(projectId: string, deploymentId: string): Promise<Deployment> {
    const deployment = await this.repository.get(projectId, deploymentId);
    if (!deployment) {
      throw new Error("deployment not found");
    }
    return structuredClone(deployment);
  }

  async activate(actorId: string, projectId: string, deploymentId: string): Promise<void> {
    const deployment = await this.get(projectId, deploymentId);
    if (!["ready", "ready_with_warnings"].includes(deployment.status)) {
      throw new Error("deployment is not approved for activation");
    }
    await this.platform.setActiveDeployment(actorId, projectId, deploymentId);
  }

  async delete(actorId: string, projectId: string, deploymentId: string): Promise<void> {
    const project = await this.platform.getProject(actorId, projectId);
    if (project.activeDeploymentId === deploymentId) {
      throw new Error("activate another deployment before deleting this release");
    }
    const deployment = await this.get(projectId, deploymentId);
    await this.artifacts.delete(deployment.id);
    await this.repository.delete(projectId, deployment.id);
  }
}
