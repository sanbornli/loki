import { GameManifestSchema } from "../../../packages/protocol/src/index.js";
import { Pool } from "pg";
import type { Deployment, ScanFinding } from "./deployments.js";

type DeploymentRow = {
  id: string | null;
  project_id: string;
  content_hash: string | null;
  manifest: unknown;
  files: unknown;
  findings: unknown;
  status: Deployment["status"] | null;
  created_at: Date | string | null;
};

const iso = (value: Date | string): string =>
  value instanceof Date ? value.toISOString() : new Date(value).toISOString();

const serializeDeployment = (row: DeploymentRow): Deployment | undefined => {
  if (!row.id) return undefined;
  if (
    !row.content_hash ||
    !row.status ||
    !row.created_at ||
    !Array.isArray(row.files) ||
    !row.files.every((file) => typeof file === "string") ||
    !Array.isArray(row.findings)
  ) {
    throw new Error("invalid deployment record");
  }
  return {
    id: row.id,
    projectId: row.project_id,
    contentHash: row.content_hash,
    manifest: GameManifestSchema.parse(row.manifest),
    files: row.files,
    findings: row.findings as ScanFinding[],
    status: row.status,
    createdAt: iso(row.created_at),
  };
};

export interface DeploymentDedupOperations {
  findExisting(
    actorId: string,
    projectId: string,
    contentHash: string,
  ): Promise<Deployment | undefined>;
}

export class PostgresDeploymentDedupService
  implements DeploymentDedupOperations
{
  constructor(readonly pool: Pool) {}

  async findExisting(
    actorId: string,
    projectId: string,
    contentHash: string,
  ): Promise<Deployment | undefined> {
    if (!/^[a-f0-9]{64}$/.test(contentHash)) {
      throw new Error("invalid deployment content hash");
    }
    const result = await this.pool.query<DeploymentRow>(
      `SELECT deployment.id,
              project.id AS project_id,
              deployment.content_hash,
              deployment.manifest,
              deployment.files,
              deployment.findings,
              deployment.status,
              deployment.created_at
         FROM projects AS project
         JOIN organization_members AS membership
           ON membership.organization_id = project.organization_id
          AND membership.account_id = $1
         LEFT JOIN deployments AS deployment
           ON deployment.project_id = project.id
          AND deployment.content_hash = $3
        WHERE project.id = $2`,
      [actorId, projectId, contentHash],
    );
    const row = result.rows[0];
    if (!row) throw new Error("project not found or access denied");
    return serializeDeployment(row);
  }
}

export const isDeploymentContentConflict = (error: unknown): boolean => {
  const candidate = error as { code?: unknown; constraint?: unknown };
  return (
    candidate?.code === "23505" &&
    candidate.constraint === "deployments_project_id_content_hash_key"
  );
};
