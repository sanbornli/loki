import {
  GameManifestSchema,
  ProjectStateSchema,
  type GameManifest,
  type ProjectState,
} from "../../../packages/protocol/src/index.js";
import { Pool, type PoolClient } from "pg";
import type { Deployment, ScanFinding } from "./deployments.js";
import type {
  Account,
  AuditRecord,
  Organization,
  Project,
} from "./platform.js";

export type MembershipRole = "owner" | "member";

export interface OrganizationMembership extends Organization {
  role: MembershipRole;
}

export type DeploymentSummary = Pick<
  Deployment,
  "id" | "projectId" | "contentHash" | "manifest" | "status" | "createdAt"
>;

export interface DashboardProject extends Project {
  deploymentCount: number;
  latestDeployment?: DeploymentSummary;
}

export interface CreatorOverview {
  account: Account;
  organizations: OrganizationMembership[];
  projects: DashboardProject[];
}

export interface PublicCatalogEntry {
  project: Pick<
    Project,
    "id" | "organizationId" | "name" | "slug" | "state" | "activeDeploymentId"
  >;
  organization: Pick<Organization, "id" | "name">;
  activeDeployment: DeploymentSummary;
  metadata: GameManifest;
}

export interface ProjectStateCount {
  state: ProjectState;
  count: number;
}

export interface OperatorOverview {
  counts: {
    accounts: number;
    projects: number;
    deployments: number;
  };
  projectsByState: ProjectStateCount[];
  recentAudits: AuditRecord[];
}

export interface OperatorProject extends DashboardProject {
  organization: Pick<Organization, "id" | "name">;
}

export interface DashboardOperations {
  creatorOverview(actorId: string): Promise<CreatorOverview>;
  projectDeployments(actorId: string, projectId: string): Promise<Deployment[]>;
  publicCatalog(): Promise<PublicCatalogEntry[]>;
  operatorOverview(actorId: string): Promise<OperatorOverview>;
  operatorProjects(actorId: string): Promise<OperatorProject[]>;
  operatorAudit(actorId: string, limit: number): Promise<AuditRecord[]>;
  operatorTransitionProject(
    actorId: string,
    projectId: string,
    nextState: ProjectState,
  ): Promise<Project>;
}

type AccountRow = {
  id: string;
  email: string;
  platform_role: "creator" | "admin";
  created_at: Date | string;
};

type OrganizationRow = {
  id: string;
  name: string;
  created_at: Date | string;
};

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

type DeploymentRow = {
  id: string;
  project_id: string;
  content_hash: string;
  manifest: unknown;
  files: unknown;
  findings: unknown;
  status: Deployment["status"];
  created_at: Date | string;
};

type AuditRow = {
  id: string;
  actor_id: string;
  organization_id: string;
  project_id: string | null;
  action: string;
  detail: Record<string, unknown>;
  occurred_at: Date | string;
};

type DashboardProjectRow = ProjectRow & {
  deployment_count: number | string;
  latest_deployment_id: string | null;
  latest_deployment_project_id: string | null;
  latest_deployment_content_hash: string | null;
  latest_deployment_manifest: unknown | null;
  latest_deployment_status: Deployment["status"] | null;
  latest_deployment_created_at: Date | string | null;
};

const projectStates = ProjectStateSchema.options;

const adminTransitions: Record<ProjectState, readonly ProjectState[]> = {
  draft: ["private", "suspended"],
  private: ["draft", "unlisted", "review_requested", "suspended"],
  unlisted: ["private", "review_requested", "suspended"],
  review_requested: ["private", "suspended"],
  published: ["unlisted", "suspended"],
  suspended: ["private"],
};

const iso = (value: Date | string): string => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("invalid database timestamp");
  return date.toISOString();
};

const accountFromRow = (row: AccountRow): Account => ({
  id: row.id,
  email: row.email,
  platformRole: row.platform_role,
  createdAt: iso(row.created_at),
});

const organizationFromRow = (row: OrganizationRow): Organization => ({
  id: row.id,
  name: row.name,
  createdAt: iso(row.created_at),
});

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

const deploymentFromRow = (row: DeploymentRow): Deployment => {
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
};

const deploymentSummaryFromProjectRow = (
  row: DashboardProjectRow,
): DeploymentSummary | undefined => {
  if (!row.latest_deployment_id) return undefined;
  if (
    !row.latest_deployment_project_id ||
    !row.latest_deployment_content_hash ||
    row.latest_deployment_manifest === null ||
    !row.latest_deployment_status ||
    !row.latest_deployment_created_at
  ) {
    throw new Error("invalid latest deployment record");
  }
  return {
    id: row.latest_deployment_id,
    projectId: row.latest_deployment_project_id,
    contentHash: row.latest_deployment_content_hash,
    manifest: GameManifestSchema.parse(row.latest_deployment_manifest),
    status: row.latest_deployment_status,
    createdAt: iso(row.latest_deployment_created_at),
  };
};

const dashboardProjectFromRow = (row: DashboardProjectRow): DashboardProject => ({
  ...projectFromRow(row),
  deploymentCount: Number(row.deployment_count),
  latestDeployment: deploymentSummaryFromProjectRow(row),
});

const auditFromRow = (row: AuditRow): AuditRecord => ({
  id: row.id,
  actorId: row.actor_id,
  organizationId: row.organization_id,
  projectId: row.project_id ?? undefined,
  action: row.action,
  detail: row.detail,
  occurredAt: iso(row.occurred_at),
});

const projectDashboardSelect = (additionalColumns = "") => `
  SELECT projects.*${additionalColumns},
         COUNT(deployments.id)::integer AS deployment_count,
         latest.id AS latest_deployment_id,
         latest.project_id AS latest_deployment_project_id,
         latest.content_hash AS latest_deployment_content_hash,
         latest.manifest AS latest_deployment_manifest,
         latest.status AS latest_deployment_status,
         latest.created_at AS latest_deployment_created_at
    FROM projects
    LEFT JOIN deployments ON deployments.project_id = projects.id
    LEFT JOIN LATERAL (
      SELECT id, project_id, content_hash, manifest, status, created_at
        FROM deployments AS candidate
       WHERE candidate.project_id = projects.id
       ORDER BY candidate.created_at DESC, candidate.id DESC
       LIMIT 1
    ) AS latest ON true`;

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

async function requireAdmin(client: Pool | PoolClient, actorId: string): Promise<void> {
  const result = await client.query<{ platform_role: "creator" | "admin" }>(
    "SELECT platform_role FROM accounts WHERE id = $1",
    [actorId],
  );
  if (result.rows[0]?.platform_role !== "admin") throw new Error("admin required");
}

function validateLimit(limit: number): void {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new Error("limit must be an integer between 1 and 100");
  }
}

export class DashboardService implements DashboardOperations {
  constructor(readonly pool: Pool) {}

  async creatorOverview(actorId: string): Promise<CreatorOverview> {
    const [accountResult, membershipResult, projectResult] = await Promise.all([
      this.pool.query<AccountRow>(
        "SELECT id, email, platform_role, created_at FROM accounts WHERE id = $1",
        [actorId],
      ),
      this.pool.query<OrganizationRow & { role: MembershipRole }>(
        `SELECT organizations.*, organization_members.role
           FROM organization_members
           JOIN organizations ON organizations.id = organization_members.organization_id
          WHERE organization_members.account_id = $1
          ORDER BY organizations.name, organizations.id`,
        [actorId],
      ),
      this.pool.query<DashboardProjectRow>(
        `${projectDashboardSelect()}
          JOIN organization_members
            ON organization_members.organization_id = projects.organization_id
           AND organization_members.account_id = $1
         GROUP BY projects.id, latest.id, latest.project_id, latest.content_hash,
                  latest.manifest, latest.status, latest.created_at
         ORDER BY projects.updated_at DESC, projects.id`,
        [actorId],
      ),
    ]);
    const account = accountResult.rows[0];
    if (!account) throw new Error("account not found");
    return {
      account: accountFromRow(account),
      organizations: membershipResult.rows.map((row) => ({
        ...organizationFromRow(row),
        role: row.role,
      })),
      projects: projectResult.rows.map(dashboardProjectFromRow),
    };
  }

  async projectDeployments(
    actorId: string,
    projectId: string,
  ): Promise<Deployment[]> {
    const result = await this.pool.query<DeploymentRow>(
      `SELECT deployments.*
         FROM deployments
         JOIN projects ON projects.id = deployments.project_id
         JOIN organization_members
           ON organization_members.organization_id = projects.organization_id
          AND organization_members.account_id = $1
        WHERE projects.id = $2
        ORDER BY deployments.created_at DESC, deployments.id DESC`,
      [actorId, projectId],
    );
    if (!result.rowCount) {
      const access = await this.pool.query(
        `SELECT 1
           FROM projects
           JOIN organization_members
             ON organization_members.organization_id = projects.organization_id
            AND organization_members.account_id = $1
          WHERE projects.id = $2`,
        [actorId, projectId],
      );
      if (!access.rowCount) throw new Error("project not found or access denied");
    }
    return result.rows.map(deploymentFromRow);
  }

  async publicCatalog(): Promise<PublicCatalogEntry[]> {
    return [];
  }

  async operatorOverview(actorId: string): Promise<OperatorOverview> {
    await requireAdmin(this.pool, actorId);
    const [countsResult, statesResult, auditsResult] = await Promise.all([
      this.pool.query<{
        accounts: number;
        projects: number;
        deployments: number;
      }>(
        `SELECT (SELECT COUNT(*)::integer FROM accounts) AS accounts,
                (SELECT COUNT(*)::integer FROM projects) AS projects,
                (SELECT COUNT(*)::integer FROM deployments) AS deployments`,
      ),
      this.pool.query<{ state: ProjectState; count: number }>(
        `SELECT state, COUNT(*)::integer AS count
           FROM projects
          GROUP BY state`,
      ),
      this.pool.query<AuditRow>(
        `SELECT *
           FROM audit_records
          ORDER BY occurred_at DESC, id DESC
          LIMIT 25`,
      ),
    ]);
    const counts = countsResult.rows[0]!;
    const countsByState = new Map(
      statesResult.rows.map((row) => [
        ProjectStateSchema.parse(row.state),
        Number(row.count),
      ]),
    );
    return {
      counts: {
        accounts: Number(counts.accounts),
        projects: Number(counts.projects),
        deployments: Number(counts.deployments),
      },
      projectsByState: projectStates.map((state) => ({
        state,
        count: countsByState.get(state) ?? 0,
      })),
      recentAudits: auditsResult.rows.map(auditFromRow),
    };
  }

  async operatorProjects(actorId: string): Promise<OperatorProject[]> {
    await requireAdmin(this.pool, actorId);
    const result = await this.pool.query<
      DashboardProjectRow & { organization_name: string }
    >(
      `${projectDashboardSelect(", organizations.name AS organization_name")}
        JOIN organizations ON organizations.id = projects.organization_id
       GROUP BY projects.id, organizations.name, latest.id, latest.project_id,
                latest.content_hash, latest.manifest, latest.status, latest.created_at
       ORDER BY projects.updated_at DESC, projects.id`,
    );
    return result.rows.map((row) => ({
      ...dashboardProjectFromRow(row),
      organization: {
        id: row.organization_id,
        name: row.organization_name,
      },
    }));
  }

  async operatorAudit(actorId: string, limit: number): Promise<AuditRecord[]> {
    validateLimit(limit);
    await requireAdmin(this.pool, actorId);
    const result = await this.pool.query<AuditRow>(
      `SELECT *
         FROM audit_records
        ORDER BY occurred_at DESC, id DESC
        LIMIT $1`,
      [limit],
    );
    return result.rows.map(auditFromRow);
  }

  async operatorTransitionProject(
    actorId: string,
    projectId: string,
    nextState: ProjectState,
  ): Promise<Project> {
    const next = ProjectStateSchema.parse(nextState);
    return transaction(this.pool, async (client) => {
      await requireAdmin(client, actorId);
      const projectResult = await client.query<ProjectRow>(
        "SELECT * FROM projects WHERE id = $1 FOR UPDATE",
        [projectId],
      );
      const current = projectResult.rows[0];
      if (!current) throw new Error("project not found");
      if (!adminTransitions[current.state].includes(next)) {
        throw new Error(`invalid project transition ${current.state} -> ${next}`);
      }
      const updatedResult = await client.query<ProjectRow>(
        `UPDATE projects
            SET state = $2, updated_at = now()
          WHERE id = $1
          RETURNING *`,
        [projectId, next],
      );
      await client.query(
        `INSERT INTO audit_records
           (actor_id, organization_id, project_id, action, detail)
         VALUES ($1, $2, $3, $4, $5::jsonb)`,
        [
          actorId,
          current.organization_id,
          projectId,
          "project.state_changed",
          JSON.stringify({ previous: current.state, next }),
        ],
      );
      return projectFromRow(updatedResult.rows[0]!);
    });
  }
}
