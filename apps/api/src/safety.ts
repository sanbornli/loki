import { createHash, randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { isMasterTestAccount } from "./master-account.js";

export class ServiceError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "ServiceError";
  }
}

export interface ReportInput {
  reporterAccountId?: string;
  projectId?: string;
  deploymentId?: string;
  category: string;
  summary: string;
  evidenceRefs?: string[];
}

export interface SafetyOperations {
  rateLimit(key: string, operation: string, limit: number, windowSeconds: number): Promise<void>;
  meter(
    scopeType: "account" | "project",
    scopeId: string,
    metric: string,
    amount: number,
    periodSeconds: number,
    actorId?: string,
  ): Promise<number>;
  createReport(input: ReportInput): Promise<{ id: string; status: string }>;
  listReports(actorId: string, status?: string): Promise<unknown[]>;
  resolveReport(
    actorId: string,
    reportId: string,
    status: "resolved" | "dismissed",
    resolution: string,
  ): Promise<void>;
  setProjectSuspension(actorId: string, projectId: string, suspended: boolean, reason: string): Promise<void>;
  setAccountSuspension(actorId: string, accountId: string, suspended: boolean, reason: string): Promise<void>;
  setGlobalPlayDisabled(actorId: string, disabled: boolean, reason: string): Promise<void>;
  enqueueSecurityReview(deploymentId: string): Promise<void>;
  listSecurityReviews(actorId: string, state?: string): Promise<unknown[]>;
  resolveSecurityReview(
    actorId: string,
    deploymentId: string,
    approved: boolean,
    evidenceRefs: string[],
  ): Promise<void>;
}

const requireAdmin = async (client: Pool | PoolClient, actorId: string): Promise<void> => {
  const result = await client.query<{ platform_role: string }>(
    "SELECT platform_role FROM accounts WHERE id = $1",
    [actorId],
  );
  if (result.rows[0]?.platform_role !== "admin") {
    throw new ServiceError("ADMIN_REQUIRED", "admin required", 403);
  }
};

const periodStart = (nowSeconds: number, periodSeconds: number): Date =>
  new Date(Math.floor(nowSeconds / periodSeconds) * periodSeconds * 1000);

type SecurityReviewCompletion = {
  organizationId: string;
  projectId: string;
  activated: boolean;
};

async function finalizeSecurityReview(
  client: PoolClient,
  deploymentId: string,
  approved: boolean,
  evidenceRefs: string[],
): Promise<SecurityReviewCompletion> {
  const deploymentResult = await client.query<{
    organization_id: string;
    project_id: string;
    created_at: Date | string;
  }>(
    `SELECT projects.organization_id, projects.id AS project_id,
            deployment.created_at
       FROM deployments AS deployment
       JOIN projects ON projects.id = deployment.project_id
      WHERE deployment.id = $1
        AND deployment.status IN ('security_review_pending', 'quarantined', 'ready')
      FOR UPDATE OF deployment, projects`,
    [deploymentId],
  );
  const deployment = deploymentResult.rows[0];
  if (!deployment) {
    throw new ServiceError("DEPLOYMENT_NOT_FOUND", "deployment review not found", 404);
  }

  await client.query(
    `UPDATE deployments
        SET status = CASE WHEN $2 THEN 'ready' ELSE 'quarantined' END
      WHERE id = $1`,
    [deploymentId, approved],
  );
  await client.query(
    `UPDATE security_review_jobs
        SET state = $2, finding_refs = $3::jsonb, completed_at = now(),
            last_error = NULL
      WHERE deployment_id = $1`,
    [
      deploymentId,
      approved ? "approved" : "quarantined",
      JSON.stringify(evidenceRefs),
    ],
  );

  let activated = false;
  if (approved) {
    const activation = await client.query(
      `UPDATE projects
          SET active_deployment_id = $2,
              state = CASE
                WHEN state = 'draft' THEN 'unlisted'::project_state
                ELSE state
              END,
              updated_at = now()
        WHERE id = $1
          AND NOT EXISTS (
            SELECT 1
              FROM deployments AS newer
             WHERE newer.project_id = $1
               AND newer.status IN ('ready', 'ready_with_warnings')
               AND (newer.created_at, newer.id) >
                   ($3::timestamptz, $2::uuid)
          )`,
      [deployment.project_id, deploymentId, deployment.created_at],
    );
    activated = Boolean(activation.rowCount);
  } else {
    await client.query(
      `UPDATE projects
          SET active_deployment_id = NULL, updated_at = now()
        WHERE id = $1 AND active_deployment_id = $2`,
      [deployment.project_id, deploymentId],
    );
  }

  return {
    organizationId: deployment.organization_id,
    projectId: deployment.project_id,
    activated,
  };
}

export class PostgresSafetyService implements SafetyOperations {
  constructor(readonly pool: Pool) {}

  async rateLimit(
    key: string,
    operation: string,
    limit: number,
    windowSeconds: number,
  ): Promise<void> {
    const keyHash = createHash("sha256").update(key).digest();
    const result = await this.pool.query<{ request_count: number }>(
      `INSERT INTO rate_limit_buckets (key_hash, operation, window_start, request_count)
       VALUES ($1, $2, $3, 1)
       ON CONFLICT (key_hash, operation, window_start)
       DO UPDATE SET request_count = rate_limit_buckets.request_count + 1
       RETURNING request_count`,
      [keyHash, operation, periodStart(Date.now() / 1000, windowSeconds)],
    );
    if (Number(result.rows[0]?.request_count) > limit) {
      throw new ServiceError("RATE_LIMITED", "request rate limit exceeded", 429);
    }
  }

  async meter(
    scopeType: "account" | "project",
    scopeId: string,
    metric: string,
    amount: number,
    periodSeconds: number,
    actorId?: string,
  ): Promise<number> {
    if (!Number.isSafeInteger(amount) || amount < 0) {
      throw new ServiceError("INVALID_METER_AMOUNT", "meter amount must be a positive integer");
    }
    if (actorId && (await this.actorIsMasterTestAccount(actorId))) {
      return 0;
    }
    const result = await this.pool.query<{ quantity: string; hard_limit: string | null }>(
      `WITH quota AS (
         SELECT hard_limit FROM quota_limits
          WHERE metric = $3
            AND ((scope_type = $1 AND scope_id = $2) OR scope_type = 'global')
          ORDER BY scope_type = $1 DESC
          LIMIT 1
       ), usage AS (
         INSERT INTO usage_meters
           (scope_type, scope_id, metric, period_start, quantity)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (scope_type, scope_id, metric, period_start)
         DO UPDATE SET quantity = usage_meters.quantity + EXCLUDED.quantity,
                       updated_at = now()
         RETURNING quantity
       )
       SELECT usage.quantity, quota.hard_limit FROM usage LEFT JOIN quota ON true`,
      [
        scopeType,
        scopeId,
        metric,
        periodStart(Date.now() / 1000, periodSeconds),
        amount,
      ],
    );
    const quantity = Number(result.rows[0]?.quantity ?? 0);
    const limit = result.rows[0]?.hard_limit;
    if (limit !== null && limit !== undefined && quantity > Number(limit)) {
      await this.pool.query(
        `UPDATE usage_meters SET quantity = quantity - $5
          WHERE scope_type = $1 AND scope_id = $2 AND metric = $3 AND period_start = $4`,
        [
          scopeType,
          scopeId,
          metric,
          periodStart(Date.now() / 1000, periodSeconds),
          amount,
        ],
      );
      throw new ServiceError("QUOTA_EXCEEDED", `${metric} quota exceeded`, 429);
    }
    return quantity;
  }

  private async actorIsMasterTestAccount(actorId: string): Promise<boolean> {
    const result = await this.pool.query<{ email: string }>(
      "SELECT email FROM accounts WHERE id = $1",
      [actorId],
    );
    return isMasterTestAccount(result.rows[0]?.email);
  }

  async createReport(input: ReportInput): Promise<{ id: string; status: string }> {
    if (!input.category.trim() || !input.summary.trim()) {
      throw new ServiceError("INVALID_REPORT", "report category and summary are required");
    }
    const evidenceRefs = input.evidenceRefs ?? [];
    if (!evidenceRefs.every((ref) => /^https:\/\/|^[a-z][a-z0-9_-]*:[^\s]+$/i.test(ref))) {
      throw new ServiceError("INVALID_EVIDENCE_REF", "invalid evidence reference");
    }
    const id = randomUUID();
    await this.pool.query(
      `INSERT INTO reports
       (id, reporter_account_id, project_id, deployment_id, category, summary, evidence_refs)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
      [
        id,
        input.reporterAccountId ?? null,
        input.projectId ?? null,
        input.deploymentId ?? null,
        input.category.trim(),
        input.summary.trim(),
        JSON.stringify(evidenceRefs),
      ],
    );
    return { id, status: "open" };
  }

  async listReports(actorId: string, status = "open"): Promise<unknown[]> {
    await requireAdmin(this.pool, actorId);
    if (!["open", "resolved", "dismissed"].includes(status)) {
      throw new ServiceError("INVALID_REPORT_STATUS", "invalid report status");
    }
    const result = await this.pool.query(
      `SELECT id, reporter_account_id, project_id, deployment_id, category,
              summary, evidence_refs, status, resolution, resolved_by,
              resolved_at, created_at
         FROM reports WHERE status = $1
        ORDER BY created_at DESC LIMIT 100`,
      [status],
    );
    return result.rows;
  }

  async resolveReport(
    actorId: string,
    reportId: string,
    status: "resolved" | "dismissed",
    resolution: string,
  ): Promise<void> {
    await requireAdmin(this.pool, actorId);
    const result = await this.pool.query(
      `UPDATE reports SET status = $2, resolution = $3, resolved_by = $4,
                          resolved_at = now()
        WHERE id = $1 AND status = 'open'`,
      [reportId, status, resolution.trim(), actorId],
    );
    if (!result.rowCount) throw new ServiceError("REPORT_NOT_FOUND", "report not found", 404);
    await this.audit(actorId, null, null, "report.resolved", { reportId, status });
  }

  async setProjectSuspension(
    actorId: string,
    projectId: string,
    suspended: boolean,
    reason: string,
  ): Promise<void> {
    await requireAdmin(this.pool, actorId);
    const result = await this.pool.query<{ organization_id: string }>(
      `UPDATE projects
          SET play_disabled_at = CASE WHEN $2 THEN now() ELSE NULL END,
              play_disabled_reason = CASE WHEN $2 THEN $3 ELSE NULL END,
              state = CASE WHEN $2 THEN 'suspended'::project_state
                           WHEN state = 'suspended' THEN 'private'::project_state
                           ELSE state END,
              updated_at = now()
        WHERE id = $1 RETURNING organization_id`,
      [projectId, suspended, reason],
    );
    const row = result.rows[0];
    if (!row) throw new ServiceError("PROJECT_NOT_FOUND", "project not found", 404);
    await this.audit(actorId, row.organization_id, projectId, "project.suspension_changed", {
      suspended,
      reason,
    });
  }

  async setAccountSuspension(
    actorId: string,
    accountId: string,
    suspended: boolean,
    reason: string,
  ): Promise<void> {
    await requireAdmin(this.pool, actorId);
    const result = await this.pool.query(
      `UPDATE accounts
          SET suspended_at = CASE WHEN $2 THEN now() ELSE NULL END,
              suspension_reason = CASE WHEN $2 THEN $3 ELSE NULL END
        WHERE id = $1`,
      [accountId, suspended, reason],
    );
    if (!result.rowCount) throw new ServiceError("ACCOUNT_NOT_FOUND", "account not found", 404);
    if (suspended) {
      await this.pool.query(
        `UPDATE deployment_credentials SET revoked_at = now(),
                revocation_reason = 'account_suspended'
          WHERE actor_id = $1 AND used_at IS NULL AND revoked_at IS NULL`,
        [accountId],
      );
    }
    await this.pool.query(
      `INSERT INTO audit_records
       (actor_id, organization_id, action, detail)
       SELECT $1, organization_id, 'account.suspension_changed', $3::jsonb
         FROM organization_members WHERE account_id = $2`,
      [actorId, accountId, JSON.stringify({ accountId, suspended, reason })],
    );
  }

  async setGlobalPlayDisabled(
    actorId: string,
    disabled: boolean,
    reason: string,
  ): Promise<void> {
    await requireAdmin(this.pool, actorId);
    await this.pool.query(
      `UPDATE platform_controls
          SET play_disabled_at = CASE WHEN $1 THEN now() ELSE NULL END,
              play_disabled_reason = CASE WHEN $1 THEN $2 ELSE NULL END,
              updated_by = $3, updated_at = now()
        WHERE singleton`,
      [disabled, reason, actorId],
    );
    await this.pool.query(
      `INSERT INTO audit_records
       (actor_id, organization_id, action, detail)
       SELECT $1, organization_id, 'platform.play_switch_changed', $2::jsonb
         FROM organization_members WHERE account_id = $1`,
      [actorId, JSON.stringify({ disabled, reason })],
    );
  }

  async enqueueSecurityReview(deploymentId: string): Promise<void> {
    await this.pool.query(
      `INSERT INTO security_review_jobs (deployment_id) VALUES ($1)
       ON CONFLICT (deployment_id) DO NOTHING`,
      [deploymentId],
    );
  }

  async listSecurityReviews(
    actorId: string,
    state = "needs_operator",
  ): Promise<unknown[]> {
    await requireAdmin(this.pool, actorId);
    if (
      ![
        "pending",
        "running",
        "approved",
        "quarantined",
        "failed",
        "needs_operator",
      ].includes(state)
    ) {
      throw new ServiceError("INVALID_REVIEW_STATE", "invalid review state");
    }
    const result = await this.pool.query(
      `SELECT job.id, job.deployment_id, job.state, job.finding_refs,
              job.attempts, job.created_at, job.completed_at,
              deployment.project_id, deployment.status AS deployment_status
         FROM security_review_jobs AS job
         JOIN deployments AS deployment ON deployment.id = job.deployment_id
        WHERE job.state = $1
        ORDER BY job.created_at DESC LIMIT 100`,
      [state],
    );
    return result.rows;
  }

  async resolveSecurityReview(
    actorId: string,
    deploymentId: string,
    approved: boolean,
    evidenceRefs: string[],
  ): Promise<void> {
    await requireAdmin(this.pool, actorId);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await finalizeSecurityReview(
        client,
        deploymentId,
        approved,
        evidenceRefs,
      );
      await client.query(
        `INSERT INTO audit_records
         (actor_id, organization_id, project_id, action, detail)
         VALUES ($1, $2, $3, $4, $5::jsonb)`,
        [
          actorId,
          result.organizationId,
          result.projectId,
          "deployment.security_review_resolved",
          JSON.stringify({
            deploymentId,
            approved,
            activated: result.activated,
            evidenceRefs,
          }),
        ],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  private async audit(
    actorId: string,
    organizationId: string | null,
    projectId: string | null,
    action: string,
    detail: Record<string, unknown>,
  ): Promise<void> {
    if (!organizationId) return;
    await this.pool.query(
      `INSERT INTO audit_records
       (actor_id, organization_id, project_id, action, detail)
       VALUES ($1, $2, $3, $4, $5::jsonb)`,
      [actorId, organizationId, projectId, action, JSON.stringify(detail)],
    );
  }
}

export class SecurityReviewWorker {
  constructor(
    readonly pool: Pool,
    readonly review: (deploymentId: string) => Promise<{
      decision: "approved" | "quarantined" | "needs_operator";
      evidenceRefs?: string[];
    }>,
  ) {}

  async runOne(): Promise<boolean> {
    const client = await this.pool.connect();
    let job: { id: string; deployment_id: string } | undefined;
    try {
      await client.query("BEGIN");
      const claimed = await client.query<{ id: string; deployment_id: string }>(
        `SELECT id, deployment_id FROM security_review_jobs
          WHERE state IN ('pending', 'failed') AND available_at <= now()
          ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1`,
      );
      job = claimed.rows[0];
      if (!job) {
        await client.query("COMMIT");
        return false;
      }
      await client.query(
        `UPDATE security_review_jobs SET state = 'running', attempts = attempts + 1,
                 started_at = now(), last_error = NULL WHERE id = $1`,
        [job.id],
      );
      await client.query("COMMIT");
    } finally {
      client.release();
    }
    try {
      const result = await this.review(job.deployment_id);
      if (result.decision === "needs_operator") {
        await this.pool.query(
          `UPDATE security_review_jobs
              SET state = 'needs_operator', finding_refs = $2::jsonb,
                  completed_at = NULL, last_error = NULL
            WHERE id = $1`,
          [job.id, JSON.stringify(result.evidenceRefs ?? [])],
        );
      } else {
        const completion = await this.pool.connect();
        try {
          await completion.query("BEGIN");
          await finalizeSecurityReview(
            completion,
            job.deployment_id,
            result.decision === "approved",
            result.evidenceRefs ?? [],
          );
          await completion.query("COMMIT");
        } catch (error) {
          await completion.query("ROLLBACK");
          throw error;
        } finally {
          completion.release();
        }
      }
      return true;
    } catch (error) {
      await this.pool.query(
        `UPDATE security_review_jobs SET state = 'failed', last_error = $2,
                 available_at = now() + interval '5 minutes' WHERE id = $1`,
        [job.id, error instanceof Error ? error.message.slice(0, 1000) : "review failed"],
      );
      throw error;
    }
  }
}
