import {
  GameManifestSchema,
  ProjectStateSchema,
  type GameManifest,
  type ProjectState,
} from "../../../packages/protocol/src/index.js";
import { Pool, type PoolClient } from "pg";
import type {
  Deployment,
  ScanFinding,
  SecurityReviewState,
  SecurityReviewSummary,
} from "./deployments.js";
import type {
  Account,
  AuditRecord,
  Organization,
  Project,
} from "./platform.js";
import {
  allocateCosts,
  type CostAnalytics,
  type CostProjectRow,
  type VendorUsage,
  type VendorUsageService,
} from "./vendor-usage.js";
import { isPlanId, isPlanStatus, limitsFor, entitledPlan } from "./plans.js";

export type MembershipRole = "owner" | "member";

export interface OrganizationMembership extends Organization {
  role: MembershipRole;
}

export type DeploymentSummary = Pick<
  Deployment,
  | "id"
  | "projectId"
  | "contentHash"
  | "manifest"
  | "status"
  | "securityReview"
  | "createdAt"
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
  organization: Pick<Organization, "id" | "name" | "slug">;
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
  organization: Pick<Organization, "id" | "name" | "slug">;
}

export interface UsageMeter {
  scope: "account" | "project";
  scopeId: string;
  scopeLabel: string;
  metric: string;
  label: string;
  /** What the limit counts over: a rolling window or the plan itself. */
  period: string;
  used: number;
  /** null when no limit applies. */
  limit: number | null;
}

export interface OperatorUsage {
  generatedAt: string;
  meters: UsageMeter[];
}

export interface DashboardOperations {
  creatorOverview(actorId: string): Promise<CreatorOverview>;
  projectDeployments(actorId: string, projectId: string): Promise<Deployment[]>;
  publicCatalog(): Promise<PublicCatalogEntry[]>;
  operatorOverview(actorId: string): Promise<OperatorOverview>;
  operatorProjects(actorId: string): Promise<OperatorProject[]>;
  operatorUsage(actorId: string): Promise<OperatorUsage>;
  operatorVendorUsage(actorId: string, refresh?: boolean): Promise<VendorUsage>;
  operatorCosts(actorId: string): Promise<CostAnalytics>;
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
  plan: string;
  plan_status: string;
  plan_period_end: Date | string | null;
  stripe_customer_id: string | null;
};

type OrganizationRow = {
  id: string;
  name: string;
  slug: string;
  created_at: Date | string;
};

type ProjectRow = {
  id: string;
  organization_id: string;
  name: string;
  slug: string;
  state: ProjectState;
  active_deployment_id: string | null;
  play_disabled_reason?: string | null;
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
  security_review_state?: SecurityReviewState | null;
  security_review_finding_refs?: unknown | null;
  security_review_last_error?: string | null;
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
  latest_security_review_state: SecurityReviewState | null;
  latest_security_review_finding_refs: unknown | null;
  latest_security_review_last_error: string | null;
  latest_deployment_created_at: Date | string | null;
};

const projectStates = ProjectStateSchema.options;

const adminTransitions: Record<ProjectState, readonly ProjectState[]> = {
  draft: ["private", "inactive", "suspended"],
  private: ["unlisted", "inactive", "review_requested", "suspended"],
  unlisted: ["private", "inactive", "review_requested", "suspended"],
  inactive: ["unlisted", "private", "suspended"],
  review_requested: ["private", "inactive", "suspended"],
  published: ["unlisted", "inactive", "suspended"],
  suspended: ["private"],
};

const iso = (value: Date | string): string => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("invalid database timestamp");
  return date.toISOString();
};

const accountFromRow = (row: AccountRow): Account => {
  if (!isPlanId(row.plan) || !isPlanStatus(row.plan_status)) {
    throw new Error("invalid account plan");
  }
  const planPeriodEnd = row.plan_period_end ? iso(row.plan_period_end) : undefined;
  const plan = entitledPlan(row.email, {
    plan: row.plan,
    status: row.plan_status,
    periodEnd: planPeriodEnd,
  });
  return {
    id: row.id,
    email: row.email,
    platformRole: row.platform_role,
    createdAt: iso(row.created_at),
    plan,
    planStatus: row.plan_status,
    planPeriodEnd,
    manageBilling: Boolean(row.stripe_customer_id),
    limits: limitsFor(plan),
  };
};

const organizationFromRow = (row: OrganizationRow): Organization => ({
  id: row.id,
  name: row.name,
  slug: row.slug,
  createdAt: iso(row.created_at),
});

const projectFromRow = (row: ProjectRow): Project => ({
  id: row.id,
  organizationId: row.organization_id,
  name: row.name,
  slug: row.slug,
  state: ProjectStateSchema.parse(row.state),
  activeDeploymentId: row.active_deployment_id ?? undefined,
  ...(row.state === "suspended" && row.play_disabled_reason
    ? { suspensionReason: row.play_disabled_reason }
    : {}),
  createdAt: iso(row.created_at),
  updatedAt: iso(row.updated_at),
});

const securityReviewFromRow = (row: {
  security_review_state?: SecurityReviewState | null;
  security_review_finding_refs?: unknown | null;
  security_review_last_error?: string | null;
}): SecurityReviewSummary | undefined => {
  if (!row.security_review_state) return undefined;
  const findingRefs = row.security_review_finding_refs ?? [];
  if (
    !Array.isArray(findingRefs) ||
    !findingRefs.every((ref) => typeof ref === "string")
  ) {
    throw new Error("invalid security review record");
  }
  return {
    state: row.security_review_state,
    findingRefs,
    lastError: row.security_review_last_error ?? undefined,
  };
};

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
    securityReview: securityReviewFromRow(row),
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
    securityReview: securityReviewFromRow({
      security_review_state: row.latest_security_review_state,
      security_review_finding_refs: row.latest_security_review_finding_refs,
      security_review_last_error: row.latest_security_review_last_error,
    }),
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
         latest.security_review_state AS latest_security_review_state,
         latest.security_review_finding_refs AS latest_security_review_finding_refs,
         latest.security_review_last_error AS latest_security_review_last_error,
         latest.created_at AS latest_deployment_created_at
    FROM projects
    LEFT JOIN deployments ON deployments.project_id = projects.id
    LEFT JOIN LATERAL (
      SELECT candidate.id, candidate.project_id, candidate.content_hash,
             candidate.manifest, candidate.status, candidate.created_at,
             review.state AS security_review_state,
             review.finding_refs AS security_review_finding_refs,
             review.last_error AS security_review_last_error
        FROM deployments AS candidate
        LEFT JOIN security_review_jobs AS review
          ON review.deployment_id = candidate.id
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

const THIRTY_DAYS_SECONDS = 30 * 24 * 60 * 60;

/** Metering windows. Anything not listed here is metered over 30 days. */
const meterPeriodSeconds: Record<string, number> = {
  deployments: 60 * 60,
};

const meterLabels: Record<string, string> = {
  projects: "Projects created",
  stored_bytes: "30-day uploads",
  deployments: "Deployments",
  guest_sessions: "Guest sessions",
  player_sessions: "Player sessions",
  deployment_credentials: "Deployment credentials",
  plan_games: "Games",
  plan_play_links: "Play links",
};

const meterLabel = (metric: string): string =>
  meterLabels[metric] ?? metric.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

const meterPeriodLabel = (seconds: number): string =>
  seconds === 60 * 60 ? "per hour" : "per 30 days";

const currentPeriodStart = (nowMs: number, seconds: number): number =>
  Math.floor(nowMs / 1000 / seconds) * seconds * 1000;

const usageRatio = (meter: UsageMeter): number =>
  meter.limit === null ? -1 : meter.limit === 0 ? Infinity : meter.used / meter.limit;

function validateLimit(limit: number): void {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new Error("limit must be an integer between 1 and 100");
  }
}

export class DashboardService implements DashboardOperations {
  constructor(
    readonly pool: Pool,
    readonly vendors?: VendorUsageService,
  ) {}

  async creatorOverview(actorId: string): Promise<CreatorOverview> {
    const [accountResult, membershipResult, projectResult] = await Promise.all([
      this.pool.query<AccountRow>(
        `SELECT id, email, platform_role, created_at, plan, plan_status,
                plan_period_end, stripe_customer_id
           FROM accounts WHERE id = $1`,
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
                  latest.manifest, latest.status, latest.security_review_state,
                  latest.security_review_finding_refs,
                  latest.security_review_last_error, latest.created_at
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
      `SELECT deployments.*, review.state AS security_review_state,
              review.finding_refs AS security_review_finding_refs,
              review.last_error AS security_review_last_error
         FROM deployments
         LEFT JOIN security_review_jobs AS review
           ON review.deployment_id = deployments.id
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
      DashboardProjectRow & { organization_name: string; organization_slug: string }
    >(
      `${projectDashboardSelect(", organizations.name AS organization_name, organizations.slug AS organization_slug")}
        JOIN organizations ON organizations.id = projects.organization_id
       GROUP BY projects.id, organizations.name, organizations.slug, latest.id,
                latest.project_id, latest.content_hash, latest.manifest,
                latest.status, latest.security_review_state,
                latest.security_review_finding_refs,
                latest.security_review_last_error, latest.created_at
       ORDER BY projects.updated_at DESC, projects.id`,
    );
    return result.rows.map((row) => ({
      ...dashboardProjectFromRow(row),
      organization: {
        id: row.organization_id,
        name: row.organization_name,
        slug: row.organization_slug,
      },
    }));
  }

  async operatorUsage(actorId: string): Promise<OperatorUsage> {
    await requireAdmin(this.pool, actorId);
    const now = Date.now();
    const [meterResult, planResult] = await Promise.all([
      this.pool.query<{
        scope_type: "account" | "project";
        scope_id: string;
        metric: string;
        period_start: Date | string;
        quantity: string | number;
        hard_limit: string | number | null;
        scope_label: string | null;
      }>(
        `SELECT meters.scope_type, meters.scope_id, meters.metric,
                meters.period_start, meters.quantity,
                COALESCE(own.hard_limit, platform.hard_limit) AS hard_limit,
                CASE WHEN meters.scope_type = 'account'
                     THEN accounts.email ELSE projects.name END AS scope_label
           FROM usage_meters AS meters
           LEFT JOIN quota_limits AS own
             ON own.metric = meters.metric
            AND own.scope_type = meters.scope_type
            AND own.scope_id = meters.scope_id
           LEFT JOIN quota_limits AS platform
             ON platform.metric = meters.metric
            AND platform.scope_type = 'global'
           LEFT JOIN accounts
             ON meters.scope_type = 'account' AND accounts.id = meters.scope_id
           LEFT JOIN projects
             ON meters.scope_type = 'project' AND projects.id = meters.scope_id
          WHERE meters.period_start > now() - interval '31 days'`,
      ),
      this.pool.query<{
        id: string;
        email: string;
        plan: string;
        plan_status: string;
        plan_period_end: Date | string | null;
        games: number | string;
        play_links: number | string;
      }>(
        `SELECT accounts.id, accounts.email, accounts.plan, accounts.plan_status,
                accounts.plan_period_end,
                COUNT(projects.id)::integer AS games,
                COUNT(projects.id) FILTER (
                  WHERE projects.state IN ('private', 'unlisted', 'published')
                )::integer AS play_links
           FROM accounts
           JOIN organization_members
             ON organization_members.account_id = accounts.id
            AND organization_members.role = 'owner'
           JOIN projects ON projects.organization_id = organization_members.organization_id
          GROUP BY accounts.id
         HAVING COUNT(projects.id) > 0`,
      ),
    ]);

    const meters: UsageMeter[] = [];
    for (const row of meterResult.rows) {
      const seconds = meterPeriodSeconds[row.metric] ?? THIRTY_DAYS_SECONDS;
      const start =
        row.period_start instanceof Date
          ? row.period_start.getTime()
          : new Date(row.period_start).getTime();
      if (start !== currentPeriodStart(now, seconds)) continue;
      meters.push({
        scope: row.scope_type,
        scopeId: row.scope_id,
        scopeLabel: row.scope_label ?? row.scope_id,
        metric: row.metric,
        label: meterLabel(row.metric),
        period: meterPeriodLabel(seconds),
        used: Number(row.quantity),
        limit: row.hard_limit === null ? null : Number(row.hard_limit),
      });
    }
    for (const row of planResult.rows) {
      if (!isPlanId(row.plan) || !isPlanStatus(row.plan_status)) continue;
      const planLimits = limitsFor(
        entitledPlan(row.email, {
          plan: row.plan,
          status: row.plan_status,
          periodEnd: row.plan_period_end ? iso(row.plan_period_end) : undefined,
        }),
      );
      meters.push(
        {
          scope: "account",
          scopeId: row.id,
          scopeLabel: row.email,
          metric: "plan_games",
          label: meterLabel("plan_games"),
          period: "plan cap",
          used: Number(row.games),
          limit: planLimits.games,
        },
        {
          scope: "account",
          scopeId: row.id,
          scopeLabel: row.email,
          metric: "plan_play_links",
          label: meterLabel("plan_play_links"),
          period: "plan cap",
          used: Number(row.play_links),
          limit: planLimits.playLinks,
        },
      );
    }
    meters.sort(
      (a, b) =>
        usageRatio(b) - usageRatio(a) ||
        a.scopeLabel.localeCompare(b.scopeLabel) ||
        a.metric.localeCompare(b.metric),
    );
    return { generatedAt: new Date(now).toISOString(), meters };
  }

  async operatorVendorUsage(actorId: string, refresh = false): Promise<VendorUsage> {
    await requireAdmin(this.pool, actorId);
    if (!this.vendors) throw new Error("vendor usage is not configured");
    return this.vendors.usage(refresh);
  }

  async operatorCosts(actorId: string): Promise<CostAnalytics> {
    await requireAdmin(this.pool, actorId);
    if (!this.vendors) throw new Error("vendor usage is not configured");
    const [usage, result] = await Promise.all([
      this.vendors.usage(),
      this.pool.query<{
        project_id: string;
        name: string;
        organization_name: string;
        owner_id: string | null;
        owner_email: string | null;
        stored_bytes: string | number;
        sessions: string | number;
        retained_bytes: string | number;
        release_count: string | number;
        owner_plan: string | null;
      }>(
        `SELECT projects.id AS project_id, projects.name,
                organizations.name AS organization_name,
                owner.account_id AS owner_id, accounts.email AS owner_email,
                accounts.plan AS owner_plan,
                COALESCE(SUM(meters.quantity)
                  FILTER (WHERE meters.metric = 'stored_bytes'), 0) AS stored_bytes,
                COALESCE(SUM(meters.quantity)
                  FILTER (WHERE meters.metric IN ('player_sessions', 'guest_sessions')
                            AND meters.period_start >= to_timestamp($1)), 0) AS sessions,
                COALESCE((
                  SELECT SUM(deployments.total_bytes)
                    FROM deployments
                   WHERE deployments.project_id = projects.id
                ), 0) AS retained_bytes,
                COALESCE((
                  SELECT COUNT(*)
                    FROM deployments
                   WHERE deployments.project_id = projects.id
                ), 0) AS release_count
           FROM projects
           JOIN organizations ON organizations.id = projects.organization_id
           LEFT JOIN LATERAL (
                  SELECT account_id FROM organization_members
                   WHERE organization_id = projects.organization_id AND role = 'owner'
                   LIMIT 1
                ) AS owner ON true
           LEFT JOIN accounts ON accounts.id = owner.account_id
           LEFT JOIN usage_meters AS meters
             ON meters.scope_type = 'project' AND meters.scope_id = projects.id
          GROUP BY projects.id, organizations.name, owner.account_id, accounts.email, accounts.plan`,
        [currentPeriodStart(Date.now(), THIRTY_DAYS_SECONDS) / 1000],
      ),
    ]);
    const rows: CostProjectRow[] = result.rows.map((row) => ({
      projectId: row.project_id,
      name: row.name,
      organizationName: row.organization_name,
      ownerId: row.owner_id,
      ownerEmail: row.owner_email,
      storedBytes: Number(row.stored_bytes),
      sessions: Number(row.sessions),
      retainedBytes: Number(row.retained_bytes),
      releaseCount: Number(row.release_count),
      ownerPlan: row.owner_plan,
    }));
    return allocateCosts(usage, rows);
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
