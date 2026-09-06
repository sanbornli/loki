import { createHash, randomBytes } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import { githubActionsWorkflow } from "./github-app.js";

export interface GitHubConnection {
  id: string;
  projectId: string;
  installationId: string;
  repositoryId: string;
  repositoryOwner: string;
  repositoryName: string;
  branch: string;
  rootDirectory: string;
  buildCommand: string;
  outputDirectory: string;
  workflowFile: string;
  artifactName: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface FinishedBuildDeploymentConfiguration {
  provider: "github_actions";
  connectionId: string;
  repository: string;
  ref: string;
  workingDirectory: string;
  buildCommand: string;
  outputDirectory: string;
  workflowFile: string;
  artifactName: string;
  buildExecution: "github_actions";
  lokiAccepts: "finished_build_artifact";
  workflowContent: string;
  workflowInstallation: "automatic";
}

export interface GitHubConnectionInput {
  installationId: string;
  repositoryId: string;
  repositoryOwner: string;
  repositoryName: string;
  branch: string;
  rootDirectory?: string;
  buildCommand: string;
  outputDirectory: string;
  workflowFile?: string;
  artifactName?: string;
}

export interface GitHubConnectionOperations {
  beginConnection(
    actorId: string,
    projectId: string,
    now?: number,
  ): Promise<{ state: string; expiresAt: number }>;
  getPendingConnection(
    state: string,
    installationId?: string,
    now?: number,
  ): Promise<{
    actorId: string;
    projectId: string;
    installationId?: string;
    expiresAt: number;
  }>;
  bindPendingInstallation(
    state: string,
    installationId: string,
    now?: number,
  ): Promise<void>;
  completeConnection(
    state: string,
    input: GitHubConnectionInput,
    now?: number,
  ): Promise<GitHubConnection>;
  getConnection(actorId: string, projectId: string): Promise<GitHubConnection>;
  actionsDeploymentConfiguration(
    actorId: string,
    projectId: string,
  ): Promise<FinishedBuildDeploymentConfiguration>;
  recordWebhookDelivery(input: {
    deliveryId: string;
    installationId: string;
    repositoryId: string;
    eventName: string;
    payload: Uint8Array;
  }): Promise<{
    accepted: boolean;
    connection?: GitHubConnection;
  }>;
  completeWebhookDelivery(
    deliveryId: string,
    status: "processed" | "failed" | "ignored",
    errorMessage?: string,
  ): Promise<boolean>;
}

type ConnectionRow = {
  id: string;
  project_id: string;
  installation_id: string;
  repository_id: string;
  repository_owner: string;
  repository_name: string;
  branch: string;
  root_directory: string;
  build_command: string;
  output_directory: string;
  workflow_file: string;
  artifact_name: string;
  created_by: string;
  created_at: Date | string;
  updated_at: Date | string;
};

const iso = (value: Date | string): string =>
  value instanceof Date ? value.toISOString() : new Date(value).toISOString();

const fromRow = (row: ConnectionRow): GitHubConnection => ({
  id: row.id,
  projectId: row.project_id,
  installationId: row.installation_id,
  repositoryId: row.repository_id,
  repositoryOwner: row.repository_owner,
  repositoryName: row.repository_name,
  branch: row.branch,
  rootDirectory: row.root_directory,
  buildCommand: row.build_command,
  outputDirectory: row.output_directory,
  workflowFile: row.workflow_file,
  artifactName: row.artifact_name,
  createdBy: row.created_by,
  createdAt: iso(row.created_at),
  updatedAt: iso(row.updated_at),
});

const stateHash = (state: string): Buffer =>
  createHash("sha256").update("loki:github-state:").update(state).digest();

const payloadHash = (payload: Uint8Array): Buffer =>
  createHash("sha256").update(payload).digest();

const positiveBigInt = (value: string, name: string): string => {
  if (!/^[1-9][0-9]*$/.test(value)) throw new Error(`invalid ${name}`);
  return value;
};

const repositoryPart = (value: string, name: string): string => {
  const normalized = value.trim();
  if (!/^[A-Za-z0-9_.-]{1,100}$/.test(normalized)) {
    throw new Error(`invalid GitHub ${name}`);
  }
  return normalized;
};

const branchName = (value: string): string => {
  const normalized = value.trim();
  if (
    !normalized ||
    normalized.length > 255 ||
    /[\s~^:?*[\]\\\x00-\x1F\x7F]/.test(normalized) ||
    normalized.startsWith("/") ||
    normalized.endsWith("/") ||
    normalized.endsWith(".") ||
    normalized.includes("..") ||
    normalized.includes("//") ||
    normalized.includes("@{")
  ) {
    throw new Error("invalid GitHub branch");
  }
  return normalized;
};

export const safeRepositoryPath = (
  value: string,
  options: { allowDot?: boolean } = {},
): string => {
  const normalized = value.trim().replaceAll("\\", "/").replace(/\/+$/, "");
  if (
    (normalized === "." && options.allowDot) ||
    (normalized &&
      normalized.length <= 500 &&
      !normalized.startsWith("/") &&
      !/^[A-Za-z]:/.test(normalized) &&
      !normalized.includes("\0") &&
      !normalized.split("/").some((part) => part === ".." || part === ""))
  ) {
    return normalized;
  }
  throw new Error("invalid repository-relative path");
};

async function transaction<T>(
  pool: Pool,
  operation: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await operation(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function projectOrganization(
  client: PoolClient,
  actorId: string,
  projectId: string,
): Promise<string> {
  const result = await client.query<{ organization_id: string }>(
    `SELECT project.organization_id
       FROM projects AS project
       JOIN organization_members AS membership
         ON membership.organization_id = project.organization_id
        AND membership.account_id = $1
      WHERE project.id = $2`,
    [actorId, projectId],
  );
  const organizationId = result.rows[0]?.organization_id;
  if (!organizationId) throw new Error("project not found or access denied");
  return organizationId;
}

async function auditProject(
  client: PoolClient,
  actorId: string,
  organizationId: string,
  projectId: string,
  action: string,
  detail: Record<string, unknown>,
): Promise<void> {
  await client.query(
    `INSERT INTO audit_records
       (actor_id, organization_id, project_id, action, detail)
     VALUES ($1, $2, $3, $4, $5::jsonb)`,
    [actorId, organizationId, projectId, action, JSON.stringify(detail)],
  );
}

async function auditSecurity(
  client: PoolClient,
  action: string,
  subjectId: string | null,
  detail: Record<string, unknown>,
): Promise<void> {
  await client.query(
    `INSERT INTO security_audit_records (action, subject_id, detail)
     VALUES ($1, $2, $3::jsonb)`,
    [action, subjectId, JSON.stringify(detail)],
  );
}

export const normalizeGitHubConnectionInput = (input: GitHubConnectionInput) => {
  const workflowFile = safeRepositoryPath(
    input.workflowFile ?? ".github/workflows/loki-deploy.yml",
  );
  if (!/^\.github\/workflows\/[^/]+\.ya?ml$/.test(workflowFile)) {
    throw new Error("workflow file must be under .github/workflows");
  }
  const buildCommand = input.buildCommand.trim();
  if (!buildCommand || buildCommand.length > 1000) {
    throw new Error("invalid GitHub Actions build command");
  }
  const artifactName = (input.artifactName ?? "loki-finished-build").trim();
  if (!artifactName || artifactName.length > 255 || /[\r\n]/.test(artifactName)) {
    throw new Error("invalid GitHub Actions artifact name");
  }
  return {
    installationId: positiveBigInt(input.installationId, "installation id"),
    repositoryId: positiveBigInt(input.repositoryId, "repository id"),
    repositoryOwner: repositoryPart(input.repositoryOwner, "repository owner"),
    repositoryName: repositoryPart(input.repositoryName, "repository name"),
    branch: branchName(input.branch),
    rootDirectory: safeRepositoryPath(input.rootDirectory ?? ".", {
      allowDot: true,
    }),
    buildCommand,
    outputDirectory: safeRepositoryPath(input.outputDirectory),
    workflowFile,
    artifactName,
  };
};

export class PostgresGitHubConnectionService
  implements GitHubConnectionOperations
{
  constructor(
    readonly pool: Pool,
    readonly stateLifetimeSeconds = 600,
  ) {
    if (stateLifetimeSeconds < 60 || stateLifetimeSeconds > 900) {
      throw new Error("GitHub connection state lifetime must be 60-900 seconds");
    }
  }

  async beginConnection(
    actorId: string,
    projectId: string,
    now = Math.floor(Date.now() / 1_000),
  ): Promise<{ state: string; expiresAt: number }> {
    const state = randomBytes(32).toString("base64url");
    const expiresAt = now + this.stateLifetimeSeconds;
    return transaction(this.pool, async (client) => {
      const organizationId = await projectOrganization(client, actorId, projectId);
      await client.query(
        `INSERT INTO github_connection_states
           (state_hash, actor_id, project_id, expires_at)
         VALUES ($1, $2, $3, to_timestamp($4))`,
        [stateHash(state), actorId, projectId, expiresAt],
      );
      await auditProject(
        client,
        actorId,
        organizationId,
        projectId,
        "github_connection.begun",
        { expiresAt },
      );
      return { state, expiresAt };
    });
  }

  async completeConnection(
    state: string,
    input: GitHubConnectionInput,
    now = Math.floor(Date.now() / 1_000),
  ): Promise<GitHubConnection> {
    const normalized = normalizeGitHubConnectionInput(input);
    return transaction(this.pool, async (client) => {
      const stateResult = await client.query<{
        id: string;
        actor_id: string;
        project_id: string;
      }>(
        `UPDATE github_connection_states
            SET consumed_at = to_timestamp($2)
          WHERE state_hash = $1
            AND consumed_at IS NULL
            AND expires_at > to_timestamp($2)
            AND installation_id = $3
          RETURNING id, actor_id, project_id`,
        [stateHash(state), now, normalized.installationId],
      );
      const connectionState = stateResult.rows[0];
      if (!connectionState) {
        const replayResult = await client.query<ConnectionRow>(
          `SELECT connection.*
             FROM github_connection_states AS state
             JOIN github_project_connections AS connection
               ON connection.project_id = state.project_id
            WHERE state.state_hash = $1
              AND state.consumed_at IS NOT NULL
              AND state.expires_at > to_timestamp($2)
              AND state.installation_id = $3
              AND connection.created_by = state.actor_id`,
          [stateHash(state), now, normalized.installationId],
        );
        const replay = replayResult.rows[0]
          ? fromRow(replayResult.rows[0])
          : undefined;
        if (
          replay &&
          replay.installationId === normalized.installationId &&
          replay.repositoryId === normalized.repositoryId &&
          replay.repositoryOwner === normalized.repositoryOwner &&
          replay.repositoryName === normalized.repositoryName &&
          replay.branch === normalized.branch &&
          replay.rootDirectory === normalized.rootDirectory &&
          replay.buildCommand === normalized.buildCommand &&
          replay.outputDirectory === normalized.outputDirectory &&
          replay.workflowFile === normalized.workflowFile &&
          replay.artifactName === normalized.artifactName
        ) {
          return replay;
        }
        throw new Error("invalid or expired GitHub state");
      }
      const organizationId = await projectOrganization(
        client,
        connectionState.actor_id,
        connectionState.project_id,
      );
      const result = await client.query<ConnectionRow>(
        `INSERT INTO github_project_connections
           (project_id, installation_id, repository_id, repository_owner,
            repository_name, branch, root_directory, build_command,
            output_directory, workflow_file, artifact_name, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         ON CONFLICT (project_id) DO UPDATE
           SET installation_id = EXCLUDED.installation_id,
               repository_id = EXCLUDED.repository_id,
               repository_owner = EXCLUDED.repository_owner,
               repository_name = EXCLUDED.repository_name,
               branch = EXCLUDED.branch,
               root_directory = EXCLUDED.root_directory,
               build_command = EXCLUDED.build_command,
               output_directory = EXCLUDED.output_directory,
               workflow_file = EXCLUDED.workflow_file,
               artifact_name = EXCLUDED.artifact_name,
               updated_at = now()
         RETURNING *`,
        [
          connectionState.project_id,
          normalized.installationId,
          normalized.repositoryId,
          normalized.repositoryOwner,
          normalized.repositoryName,
          normalized.branch,
          normalized.rootDirectory,
          normalized.buildCommand,
          normalized.outputDirectory,
          normalized.workflowFile,
          normalized.artifactName,
          connectionState.actor_id,
        ],
      );
      const connection = fromRow(result.rows[0]!);
      await auditProject(
        client,
        connectionState.actor_id,
        organizationId,
        connectionState.project_id,
        "github_connection.configured",
        {
          connectionId: connection.id,
          installationId: connection.installationId,
          repositoryId: connection.repositoryId,
          repository: `${connection.repositoryOwner}/${connection.repositoryName}`,
          branch: connection.branch,
        },
      );
      return connection;
    });
  }

  async getPendingConnection(
    state: string,
    installationId?: string,
    now = Math.floor(Date.now() / 1_000),
  ): Promise<{
    actorId: string;
    projectId: string;
    installationId?: string;
    expiresAt: number;
  }> {
    if (!/^[A-Za-z0-9_-]{40,100}$/.test(state)) {
      throw new Error("invalid or expired GitHub state");
    }
    const normalizedInstallationId = installationId
      ? positiveBigInt(installationId, "installation id")
      : undefined;
    const result = await this.pool.query<{
      actor_id: string;
      project_id: string;
      installation_id: string | null;
      expires_at: Date | string;
    }>(
      `SELECT actor_id, project_id, installation_id, expires_at
         FROM github_connection_states
        WHERE state_hash = $1
          AND consumed_at IS NULL
          AND expires_at > to_timestamp($2)
          AND ($3::bigint IS NULL OR installation_id = $3)`,
      [stateHash(state), now, normalizedInstallationId ?? null],
    );
    const pending = result.rows[0];
    if (!pending) throw new Error("invalid or expired GitHub state");
    return {
      actorId: pending.actor_id,
      projectId: pending.project_id,
      installationId: pending.installation_id ?? undefined,
      expiresAt: Math.floor(new Date(pending.expires_at).getTime() / 1_000),
    };
  }

  async bindPendingInstallation(
    state: string,
    installationId: string,
    now = Math.floor(Date.now() / 1_000),
  ): Promise<void> {
    const normalizedInstallationId = positiveBigInt(
      installationId,
      "installation id",
    );
    const result = await this.pool.query(
      `UPDATE github_connection_states
          SET installation_id = $3
        WHERE state_hash = $1
          AND consumed_at IS NULL
          AND expires_at > to_timestamp($2)
          AND (installation_id IS NULL OR installation_id = $3)`,
      [stateHash(state), now, normalizedInstallationId],
    );
    if (!result.rowCount) throw new Error("invalid or expired GitHub state");
  }

  async getConnection(
    actorId: string,
    projectId: string,
  ): Promise<GitHubConnection> {
    const result = await this.pool.query<ConnectionRow>(
      `SELECT connection.*
         FROM github_project_connections AS connection
         JOIN projects AS project ON project.id = connection.project_id
         JOIN organization_members AS membership
           ON membership.organization_id = project.organization_id
          AND membership.account_id = $1
        WHERE connection.project_id = $2`,
      [actorId, projectId],
    );
    const row = result.rows[0];
    if (!row) throw new Error("GitHub connection not found or access denied");
    return fromRow(row);
  }

  async actionsDeploymentConfiguration(
    actorId: string,
    projectId: string,
  ): Promise<FinishedBuildDeploymentConfiguration> {
    const connection = await this.getConnection(actorId, projectId);
    const configuration = {
      provider: "github_actions",
      connectionId: connection.id,
      repository: `${connection.repositoryOwner}/${connection.repositoryName}`,
      ref: connection.branch,
      workingDirectory: connection.rootDirectory,
      buildCommand: connection.buildCommand,
      outputDirectory: connection.outputDirectory,
      workflowFile: connection.workflowFile,
      artifactName: connection.artifactName,
      buildExecution: "github_actions",
      lokiAccepts: "finished_build_artifact",
      workflowInstallation: "automatic",
    } as const;
    return {
      ...configuration,
      workflowContent: githubActionsWorkflow({
        branch: connection.branch,
        rootDirectory: connection.rootDirectory,
        buildCommand: connection.buildCommand,
        outputDirectory: connection.outputDirectory,
        artifactName: connection.artifactName,
      }),
    };
  }

  async recordWebhookDelivery(input: {
    deliveryId: string;
    installationId: string;
    repositoryId: string;
    eventName: string;
    payload: Uint8Array;
  }): Promise<{ accepted: boolean; connection?: GitHubConnection }> {
    if (!input.deliveryId || input.deliveryId.length > 255) {
      throw new Error("invalid GitHub delivery id");
    }
    if (!input.eventName || input.eventName.length > 100) {
      throw new Error("invalid GitHub event name");
    }
    const installationId = /^[1-9][0-9]*$/.test(input.installationId)
      ? input.installationId
      : undefined;
    const repositoryId = /^[1-9][0-9]*$/.test(input.repositoryId)
      ? input.repositoryId
      : undefined;
    return transaction(this.pool, async (client) => {
      const connectionResult =
        installationId && repositoryId
          ? await client.query<ConnectionRow>(
              `SELECT *
                 FROM github_project_connections
                WHERE installation_id = $1 AND repository_id = $2`,
              [installationId, repositoryId],
            )
          : { rows: [] as ConnectionRow[] };
      const connectionRow = connectionResult.rows[0];
      const inserted = await client.query(
        `INSERT INTO github_webhook_deliveries
           (delivery_id, connection_id, event_name, payload_sha256, status)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (delivery_id) DO NOTHING`,
        [
          input.deliveryId,
          connectionRow?.id ?? null,
          input.eventName,
          payloadHash(input.payload),
          connectionRow ? "received" : "ignored",
        ],
      );
      if (!inserted.rowCount) return { accepted: false };
      await auditSecurity(
        client,
        "github_webhook.received",
        connectionRow?.id ?? null,
        {
          deliveryId: input.deliveryId,
          eventName: input.eventName,
          matchedConnection: Boolean(connectionRow),
        },
      );
      return {
        accepted: true,
        connection: connectionRow ? fromRow(connectionRow) : undefined,
      };
    });
  }

  async completeWebhookDelivery(
    deliveryId: string,
    status: "processed" | "failed" | "ignored",
    errorMessage?: string,
  ): Promise<boolean> {
    if (errorMessage && errorMessage.length > 2000) {
      throw new Error("webhook error message too long");
    }
    return transaction(this.pool, async (client) => {
      const updated = await client.query<{ connection_id: string | null }>(
        `UPDATE github_webhook_deliveries
            SET status = $2,
                error_message = $3,
                processed_at = now()
          WHERE delivery_id = $1 AND status = 'received'
          RETURNING connection_id`,
        [deliveryId, status, errorMessage ?? null],
      );
      const row = updated.rows[0];
      if (!row) return false;
      await auditSecurity(
        client,
        `github_webhook.${status}`,
        row.connection_id,
        { deliveryId },
      );
      return true;
    });
  }
}
