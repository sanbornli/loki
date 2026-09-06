import { createHash, randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";

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
  ): Promise<number> {
    if (!Number.isSafeInteger(amount) || amount < 0) {
      throw new ServiceError("INVALID_METER_AMOUNT", "meter amount must be a positive integer");
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

  async resolveSecurityReview(
    actorId: string,
    deploymentId: string,
    approved: boolean,
    evidenceRefs: string[],
  ): Promise<void> {
    await requireAdmin(this.pool, actorId);
    const result = await this.pool.query<{ organization_id: string; project_id: string }>(
      `UPDATE deployments AS deployment
          SET status = CASE WHEN $2 THEN 'ready' ELSE 'quarantined' END
         FROM projects
        WHERE deployment.id = $1
          AND projects.id = deployment.project_id
          AND deployment.status IN ('security_review_pending', 'quarantined')
        RETURNING projects.organization_id, projects.id AS project_id`,
      [deploymentId, approved],
    );
    const row = result.rows[0];
    if (!row) throw new ServiceError("DEPLOYMENT_NOT_FOUND", "deployment review not found", 404);
    await this.pool.query(
      `UPDATE security_review_jobs
          SET state = $2, finding_refs = $3::jsonb, completed_at = now()
        WHERE deployment_id = $1`,
      [deploymentId, approved ? "approved" : "quarantined", JSON.stringify(evidenceRefs)],
    );
    await this.audit(
      actorId,
      row.organization_id,
      row.project_id,
      "deployment.security_review_resolved",
      { deploymentId, approved, evidenceRefs },
    );
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
      decision: "approved" | "quarantined";
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
      await this.pool.query(
        `UPDATE security_review_jobs SET state = $2, finding_refs = $3::jsonb,
                 completed_at = now() WHERE id = $1`,
        [job.id, result.decision, JSON.stringify(result.evidenceRefs ?? [])],
      );
      await this.pool.query(
        `UPDATE deployments SET status = $2 WHERE id = $1`,
        [
          job.deployment_id,
          result.decision === "approved" ? "ready" : "quarantined",
        ],
      );
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
