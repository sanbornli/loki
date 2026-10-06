import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import {
  hostedSdkImportMapCspSource,
  parseHostedSdkBanner,
} from "../../../packages/protocol/src/index.js";

export interface HostedSdkBundle {
  source: Buffer;
  version: string;
}

export interface HostedSdkConfig {
  stable: HostedSdkBundle;
  /** Absent when no candidate build exists; everyone then gets stable. */
  candidate?: HostedSdkBundle;
  /** "candidate" serves the candidate to every project. Anything else serves stable. */
  serve?: "stable" | "candidate";
  /** Projects that get the candidate while everyone else keeps stable. */
  canaryProjectIds?: readonly string[];
}

export type HostedSdkGeneration = "stable" | "candidate";

export function hostedSdkBundleFromSource(source: Buffer | string): HostedSdkBundle {
  const buffer = Buffer.isBuffer(source) ? source : Buffer.from(source, "utf8");
  const banner = parseHostedSdkBanner(buffer.subarray(0, 200).toString("utf8"));
  if (!banner) throw new Error("hosted SDK bundle is missing its version banner");
  return { source: buffer, version: banner.version };
}

async function readBundle(file: URL): Promise<HostedSdkBundle | undefined> {
  try {
    return hostedSdkBundleFromSource(await readFile(file));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

export async function loadHostedSdkConfig(input: {
  serve?: string;
  canaryProjectIds?: string;
}): Promise<HostedSdkConfig> {
  const stable = await readBundle(new URL("../hosted-sdk/stable.js", import.meta.url));
  if (!stable) throw new Error("hosted-sdk/stable.js is missing");
  const candidate = await readBundle(new URL("../hosted-sdk/candidate.js", import.meta.url));
  return {
    stable,
    ...(candidate ? { candidate } : {}),
    serve: input.serve === "candidate" ? "candidate" : "stable",
    canaryProjectIds: (input.canaryProjectIds ?? "")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  };
}

export function selectHostedSdk(
  config: HostedSdkConfig,
  projectId: string,
): { bundle: HostedSdkBundle; generation: HostedSdkGeneration } {
  if (
    config.candidate &&
    (config.serve === "candidate" ||
      config.canaryProjectIds?.includes(projectId.toLowerCase()))
  ) {
    return { bundle: config.candidate, generation: "candidate" };
  }
  return { bundle: config.stable, generation: "stable" };
}

export function contentEtag(body: Buffer): string {
  return `"${createHash("sha256").update(body).digest("hex").slice(0, 32)}"`;
}

/** Adds the import-map hash to the script-src of one entrypoint response. */
export function withImportMapCsp(contentSecurityPolicy: string): string {
  return contentSecurityPolicy.replace(
    /(^|;\s*)(script-src [^;]+)/,
    (_match, lead: string, directive: string) =>
      `${lead}${directive} ${hostedSdkImportMapCspSource()}`,
  );
}
