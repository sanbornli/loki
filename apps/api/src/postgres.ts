import { createHash, randomBytes, randomUUID } from "node:crypto";
import {
  GameManifestSchema,
  ProjectStateSchema,
  type PlayerSessionClaims,
  type ProjectState,
} from "../../../packages/protocol/src/index.js";
import { Pool, type PoolClient } from "pg";
import { DeploymentContentConflictError } from "./deployments.js";
import type {
  Deployment,
  DeploymentRepository,
  ScanFinding,
} from "./deployments.js";
import type {
  Account,
  AuditRecord,
  Organization,
  PlatformOperations,
  Project,
} from "./platform.js";
import { SessionTokenService } from "./tokens.js";

type ProjectRow = {
  id: string;
  organization_id: string;
  name: string;
  slug: string;
  state: ProjectState;
  active_deployment_id: string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

const iso = (value: Date | string): string =>
  value instanceof Date ? value.toISOString() : new Date(value).toISOString();

const projectFromRow = (row: ProjectRow): Project => ({
  id: row.id,
  organizationId: row.organization_id,
  name: row.name,
  slug: row.slug,
  state: ProjectStateSchema.parse(row.state),
  activeDeploymentId: row.active_deployment_id ?? undefined,
  createdAt: iso(row.created_at),
  updatedAt: iso(row.updated_at),
});

const digest = (value: string): Buffer =>
  createHash("sha256").update(value).digest();

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

async function requireMember(
  client: PoolClient,
  actorId: string,
  organizationId: string,
): Promise<void> {
  const membership = await client.query(
    `SELECT 1
       FROM organization_members
       JOIN accounts ON accounts.id = organization_members.account_id
      WHERE organization_id = $1 AND account_id = $2
        AND accounts.suspended_at IS NULL`,
    [organizationId, actorId],
  );
  if (!membership.rowCount) throw new Error("organization access denied");
}

async function recordAudit(
  client: PoolClient,
  input: {
    actorId: string;
    organizationId: string;
    projectId?: string;
    action: string;
    detail: Record<string, unknown>;
  },
): Promise<void> {
  await client.query(
    `INSERT INTO audit_records
       (actor_id, organization_id, project_id, action, detail)
     VALUES ($1, $2, $3, $4, $5::jsonb)`,
    [
      input.actorId,
      input.organizationId,
      input.projectId ?? null,
      input.action,
      JSON.stringify(input.detail),
    ],
  );
}

export class PostgresPlatformService implements PlatformOperations {
  constructor(
    readonly pool: Pool,
    readonly tokens: SessionTokenService,
  ) {}

  async ensureCreator(
    authSubject: string,
    email: string,
    legalVersions?: { terms: string; privacy: string; aup: string },
  ): Promise<Account> {
    const normalizedEmail = email.trim().toLowerCase();
    if (!authSubject || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalizedEmail)) {
      throw new Error("verified creator email required");
    }
    const existing = await this.pool.query<{
      id: string;
      email: string;
      platform_role: "creator" | "admin";
      created_at: Date | string;
    }>(
      `UPDATE accounts SET email = $2
        WHERE auth_subject = $1
        RETURNING id, email, platform_role, created_at`,
      [authSubject, normalizedEmail],
    );
    if (existing.rows[0]) {
      const account = existing.rows[0];
      if (
        (
          await this.pool.query(
            "SELECT 1 FROM accounts WHERE id = $1 AND suspended_at IS NULL",
            [account.id],
          )
        ).rowCount === 0
      ) {
        throw new Error("account suspended");
      }
      return {
        id: account.id,
        email: account.email,
        platformRole: account.platform_role,
        createdAt: iso(account.created_at),
      };
    }
    if (!legalVersions) throw new Error("legal acceptance required");
    return transaction(this.pool, async (client) => {
      const result = await client.query<{
        id: string;
        email: string;
        platform_role: "creator" | "admin";
        created_at: Date | string;
      }>(
        `INSERT INTO accounts (auth_subject, email)
         VALUES ($1, $2)
         ON CONFLICT (auth_subject)
         DO UPDATE SET email = EXCLUDED.email
         RETURNING id, email, platform_role, created_at`,
        [authSubject, normalizedEmail],
      );
      const row = result.rows[0]!;
      await client.query(
        `INSERT INTO legal_acceptances (account_id, document, version)
         VALUES ($1, 'terms', $2), ($1, 'privacy', $3), ($1, 'aup', $4)
         ON CONFLICT DO NOTHING`,
        [row.id, legalVersions.terms, legalVersions.privacy, legalVersions.aup],
      );
      return {
        id: row.id,
        email: row.email,
        platformRole: row.platform_role,
        createdAt: iso(row.created_at),
      };
    });
  }

  async createOrganization(actorId: string, name: string): Promise<Organization> {
    const normalizedName = name.trim();
    if (!normalizedName) throw new Error("organization name required");
    return transaction(this.pool, async (client) => {
      const result = await client.query<{
        id: string;
        name: string;
        created_at: Date | string;
      }>(
        `INSERT INTO organizations (name)
         VALUES ($1)
         RETURNING id, name, created_at`,
        [normalizedName],
      );
      const row = result.rows[0]!;
      await client.query(
        `INSERT INTO organization_members (organization_id, account_id, role)
         VALUES ($1, $2, 'owner')`,
        [row.id, actorId],
      );
      await recordAudit(client, {
        actorId,
        organizationId: row.id,
        action: "organization.created",
        detail: { name: row.name },
      });
      return { id: row.id, name: row.name, createdAt: iso(row.created_at) };
    });
  }

  async createProject(
    actorId: string,
    organizationId: string,
    input: { name: string; slug: string },
  ): Promise<Project> {
    const name = input.name.trim();
    if (!name) throw new Error("project name required");
    if (!/^[a-z0-9-]{3,48}$/.test(input.slug)) throw new Error("invalid slug");
    return transaction(this.pool, async (client) => {
      await requireMember(client, actorId, organizationId);
      const result = await client.query<ProjectRow>(
        `INSERT INTO projects (organization_id, name, slug)
         VALUES ($1, $2, $3)
         RETURNING *`,
        [organizationId, name, input.slug],
      );
      const project = projectFromRow(result.rows[0]!);
      await recordAudit(client, {
        actorId,
        organizationId,
        projectId: project.id,
        action: "project.created",
        detail: { slug: project.slug },
      });
      return project;
    });
  }

  async transitionProject(
    actorId: string,
    projectId: string,
    next: ProjectState,
  ): Promise<Project> {
    ProjectStateSchema.parse(next);
    const transitions: Record<ProjectState, ProjectState[]> = {
      draft: ["private"],
      private: ["draft", "unlisted", "review_requested"],
      unlisted: ["private", "review_requested"],
      review_requested: ["private"],
      published: ["unlisted", "suspended"],
      suspended: ["private"],
    };
    return transaction(this.pool, async (client) => {
      const result = await client.query<ProjectRow>(
        "SELECT * FROM projects WHERE id = $1 FOR UPDATE",
        [projectId],
      );
      const row = result.rows[0];
      if (!row) throw new Error("project not found");
      await requireMember(client, actorId, row.organization_id);
      const account = await client.query<{ platform_role: "creator" | "admin" }>(
        "SELECT platform_role FROM accounts WHERE id = $1",
        [actorId],
      );
      if (
        (next === "suspended" || row.state === "suspended") &&
        account.rows[0]?.platform_role !== "admin"
      ) {
        throw new Error("admin required for suspension changes");
      }
      if (next === "published") {
        throw new Error("Layer 2 publication is closed");
      }
      if (!transitions[row.state].includes(next)) {
        throw new Error(`invalid project transition ${row.state} -> ${next}`);
      }
      const updated = await client.query<ProjectRow>(
        `UPDATE projects
            SET state = $2, updated_at = now()
          WHERE id = $1
          RETURNING *`,
        [projectId, next],
      );
      await recordAudit(client, {
        actorId,
        organizationId: row.organization_id,
        projectId,
        action: "project.state_changed",
        detail: { previous: row.state, next },
      });
      return projectFromRow(updated.rows[0]!);
    });
  }

  async issueDeploymentCredential(
    actorId: string,
    projectId: string,
    now = Math.floor(Date.now() / 1_000),
  ): Promise<{ credentialId: string; secret: string; expiresAt: number }> {
    return transaction(this.pool, async (client) => {
      const projectResult = await client.query<ProjectRow>(
        `SELECT projects.* FROM projects
           CROSS JOIN platform_controls
          WHERE projects.id = $1
            AND projects.play_disabled_at IS NULL
            AND platform_controls.play_disabled_at IS NULL`,
        [projectId],
      );
      const project = projectResult.rows[0];
      if (!project) throw new Error("project not found");
      await requireMember(client, actorId, project.organization_id);
      if (project.state === "suspended") throw new Error("project suspended");
      const actor = await client.query(
        "SELECT 1 FROM accounts WHERE id = $1 AND suspended_at IS NULL",
        [actorId],
      );
      if (!actor.rowCount) throw new Error("account suspended");
      const credentialId = randomUUID();
      const secret = `loki_deploy_${randomBytes(32).toString("base64url")}`;
      const expiresAt = now + 600;
      await client.query(
        `INSERT INTO deployment_credentials
           (id, project_id, actor_id, secret_hash, expires_at)
         VALUES ($1, $2, $3, $4, to_timestamp($5))`,
        [credentialId, projectId, actorId, digest(secret), expiresAt],
      );
      await recordAudit(client, {
        actorId,
        organizationId: project.organization_id,
        projectId,
        action: "deployment_credential.issued",
        detail: { credentialId, expiresAt },
      });
      return { credentialId, secret, expiresAt };
    });
  }

  async consumeDeploymentCredential(
    credentialId: string,
    secret: string,
    now = Math.floor(Date.now() / 1_000),
  ): Promise<{ projectId: string; actorId: string }> {
    return transaction(this.pool, async (client) => {
      const result = await client.query<{
        project_id: string;
        actor_id: string;
        organization_id: string;
      }>(
        `UPDATE deployment_credentials AS credential
            SET used_at = to_timestamp($3)
           FROM projects
          WHERE credential.id = $1
            AND credential.secret_hash = $2
            AND credential.used_at IS NULL
            AND credential.revoked_at IS NULL
            AND credential.expires_at > to_timestamp($3)
            AND projects.id = credential.project_id
            AND projects.state <> 'suspended'
            AND projects.play_disabled_at IS NULL
            AND NOT EXISTS (
              SELECT 1 FROM platform_controls WHERE play_disabled_at IS NOT NULL
            )
            AND EXISTS (
              SELECT 1 FROM accounts
               WHERE accounts.id = credential.actor_id
                 AND accounts.suspended_at IS NULL
            )
          RETURNING credential.project_id, credential.actor_id,
                    projects.organization_id`,
        [credentialId, digest(secret), now],
      );
      const row = result.rows[0];
      if (!row) throw new Error("invalid deployment credential");
      await recordAudit(client, {
        actorId: row.actor_id,
        organizationId: row.organization_id,
        projectId: row.project_id,
        action: "deployment_credential.consumed",
        detail: { credentialId },
      });
      return { projectId: row.project_id, actorId: row.actor_id };
    });
  }

  async issuePlayerSession(
    projectId: string,
    playerId = randomUUID(),
    guest = true,
    now = Math.floor(Date.now() / 1_000),
  ): Promise<string> {
    const result = await this.pool.query<ProjectRow>(
      `SELECT projects.* FROM projects
        JOIN deployments
          ON deployments.id = projects.active_deployment_id
         AND deployments.project_id = projects.id
         AND deployments.status IN ('ready', 'ready_with_warnings')
       CROSS JOIN platform_controls
       WHERE projects.id = $1
         AND projects.play_disabled_at IS NULL
         AND platform_controls.play_disabled_at IS NULL`,
      [projectId],
    );
    const project = result.rows[0];
    if (!project) throw new Error("project not found");
    if (!["private", "unlisted", "published"].includes(project.state)) {
      throw new Error("project is not playable");
    }
    const claims: PlayerSessionClaims = {
      issuer: "lokiplay",
      audience: "lokiplay-game",
      subject: playerId,
      projectId,
      organizationId: project.organization_id,
      guest,
      issuedAt: now,
      expiresAt: now + 600,
      nonce: randomUUID(),
    };
    return this.tokens.issue(claims);
  }

  async setActiveDeployment(
    actorId: string,
    projectId: string,
    deploymentId: string,
  ): Promise<Project> {
    return transaction(this.pool, async (client) => {
      const projectResult = await client.query<ProjectRow>(
        "SELECT * FROM projects WHERE id = $1 FOR UPDATE",
        [projectId],
      );
      const project = projectResult.rows[0];
      if (!project) throw new Error("project not found");
      await requireMember(client, actorId, project.organization_id);
      const deployment = await client.query(
        `SELECT 1 FROM deployments
          CROSS JOIN platform_controls
          WHERE deployments.id = $1 AND project_id = $2
            AND status IN ('ready', 'ready_with_warnings')
            AND platform_controls.play_disabled_at IS NULL
            AND NOT EXISTS (
              SELECT 1 FROM projects
               WHERE projects.id = $2
                 AND (projects.state = 'suspended' OR projects.play_disabled_at IS NOT NULL)
            )`,
        [deploymentId, projectId],
      );
      if (!deployment.rowCount) throw new Error("deployment not found");
      const updated = await client.query<ProjectRow>(
        `UPDATE projects
            SET active_deployment_id = $2, updated_at = now()
          WHERE id = $1
          RETURNING *`,
        [projectId, deploymentId],
      );
      await recordAudit(client, {
        actorId,
        organizationId: project.organization_id,
        projectId,
        action: "deployment.activated",
        detail: { deploymentId },
      });
      return projectFromRow(updated.rows[0]!);
    });
  }

  async getProject(actorId: string, projectId: string): Promise<Project> {
    const result = await this.pool.query<ProjectRow>(
      `SELECT projects.*
         FROM projects
         JOIN organization_members
           ON organization_members.organization_id = projects.organization_id
          AND organization_members.account_id = $2
        WHERE projects.id = $1`,
      [projectId, actorId],
    );
    if (!result.rows[0]) throw new Error("project not found or access denied");
    return projectFromRow(result.rows[0]);
  }

  async playableProject(
    projectId: string,
  ): Promise<Pick<Project, "id" | "name" | "slug" | "state" | "activeDeploymentId">> {
    const result = await this.pool.query<ProjectRow>(
      `SELECT projects.* FROM projects
        JOIN deployments
          ON deployments.id = projects.active_deployment_id
         AND deployments.project_id = projects.id
         AND deployments.status IN ('ready', 'ready_with_warnings')
       CROSS JOIN platform_controls
        WHERE projects.id = $1
          AND projects.state IN ('private', 'unlisted', 'published')
          AND projects.active_deployment_id IS NOT NULL
          AND projects.play_disabled_at IS NULL
          AND platform_controls.play_disabled_at IS NULL`,
      [projectId],
    );
    const row = result.rows[0];
    if (!row) throw new Error("project is not playable");
    const project = projectFromRow(row);
    return {
      id: project.id,
      name: project.name,
      slug: project.slug,
      state: project.state,
      activeDeploymentId: project.activeDeploymentId,
    };
  }

  async auditLog(actorId: string, organizationId: string): Promise<AuditRecord[]> {
    const client = await this.pool.connect();
    try {
      await requireMember(client, actorId, organizationId);
      const result = await client.query<{
        id: string;
        actor_id: string;
        organization_id: string;
        project_id: string | null;
        action: string;
        detail: Record<string, unknown>;
        occurred_at: Date | string;
      }>(
        `SELECT * FROM audit_records
          WHERE organization_id = $1
          ORDER BY occurred_at`,
        [organizationId],
      );
      return result.rows.map((row) => ({
        id: row.id,
        actorId: row.actor_id,
        organizationId: row.organization_id,
        projectId: row.project_id ?? undefined,
        action: row.action,
        detail: row.detail,
        occurredAt: iso(row.occurred_at),
      }));
    } finally {
      client.release();
    }
  }
}

export class PostgresDeploymentRepository implements DeploymentRepository {
  constructor(readonly pool: Pool) {}

  async save(deployment: Deployment): Promise<void> {
    try {
      await this.pool.query(
        `INSERT INTO deployments
         (id, project_id, content_hash, manifest, files, findings, status, created_at)
       VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6::jsonb, $7, $8)`,
        [
          deployment.id,
          deployment.projectId,
          deployment.contentHash,
          JSON.stringify(deployment.manifest),
          JSON.stringify(deployment.files),
          JSON.stringify(deployment.findings),
          deployment.status,
          deployment.createdAt,
        ],
      );
    } catch (error) {
      const postgresError = error as { code?: unknown; constraint?: unknown };
      if (
        postgresError.code === "23505" &&
        postgresError.constraint === "deployments_project_id_content_hash_key"
      ) {
        throw new DeploymentContentConflictError();
      }
      throw error;
    }
  }

  async get(
    projectId: string,
    deploymentId: string,
  ): Promise<Deployment | undefined> {
    const result = await this.pool.query<{
      id: string;
      project_id: string;
      content_hash: string;
      manifest: unknown;
      files: unknown;
      findings: unknown;
      status: Deployment["status"];
      created_at: Date | string;
    }>(
      "SELECT * FROM deployments WHERE id = $1 AND project_id = $2",
      [deploymentId, projectId],
    );
    const row = result.rows[0];
    if (!row) return undefined;
    if (
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
  }

  async getByContentHash(
    projectId: string,
    contentHash: string,
  ): Promise<Deployment | undefined> {
    const result = await this.pool.query<{ id: string }>(
      `SELECT id
         FROM deployments
        WHERE project_id = $1 AND content_hash = $2`,
      [projectId, contentHash],
    );
    const deploymentId = result.rows[0]?.id;
    return deploymentId ? this.get(projectId, deploymentId) : undefined;
  }

  async delete(projectId: string, deploymentId: string): Promise<void> {
    await this.pool.query(
      "DELETE FROM deployments WHERE id = $1 AND project_id = $2",
      [deploymentId, projectId],
    );
  }
}
