import {
  createHash,
  createHmac,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import type { IncomingMessage } from "node:http";
import type { Pool } from "pg";
import { ServiceError } from "./safety.js";

type InvitePayload = {
  id: string;
  projectId: string;
  expiresAt: number;
};

const encode = (value: string): string => Buffer.from(value).toString("base64url");

export class PlayInviteSigner {
  constructor(readonly secret: Uint8Array) {
    if (secret.byteLength < 32) throw new Error("play invite signing key must be 32 bytes");
  }

  issue(payload: InvitePayload): string {
    const body = encode(JSON.stringify(payload));
    const signature = createHmac("sha256", this.secret).update(body).digest("base64url");
    return `${body}.${signature}`;
  }

  verify(token: string, now = Math.floor(Date.now() / 1000)): InvitePayload {
    const [body, signature, extra] = token.split(".");
    if (!body || !signature || extra) throw new ServiceError("INVALID_PLAY_INVITE", "invalid play invite", 403);
    const expected = createHmac("sha256", this.secret).update(body).digest();
    const actual = Buffer.from(signature, "base64url");
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
      throw new ServiceError("INVALID_PLAY_INVITE", "invalid play invite", 403);
    }
    let payload: InvitePayload;
    try {
      payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as InvitePayload;
    } catch {
      throw new ServiceError("INVALID_PLAY_INVITE", "invalid play invite", 403);
    }
    if (
      typeof payload.id !== "string" ||
      typeof payload.projectId !== "string" ||
      !Number.isSafeInteger(payload.expiresAt) ||
      payload.expiresAt <= now
    ) {
      throw new ServiceError("EXPIRED_PLAY_INVITE", "play invite expired", 403);
    }
    return payload;
  }
}

export interface HostingAuthorization {
  createInvite(
    actorId: string,
    projectId: string,
    expiresInSeconds?: number,
  ): Promise<{ token: string; expiresAt: number }>;
  authorizeRequest(
    request: IncomingMessage,
    projectId: string,
    actorId?: string,
  ): Promise<string | undefined>;
}

export class PostgresHostingAuthorization implements HostingAuthorization {
  constructor(
    readonly pool: Pool,
    readonly signer: PlayInviteSigner,
  ) {}

  async createInvite(
    actorId: string,
    projectId: string,
    expiresInSeconds = 3600,
  ): Promise<{ token: string; expiresAt: number }> {
    if (!Number.isSafeInteger(expiresInSeconds) || expiresInSeconds < 60 || expiresInSeconds > 604800) {
      throw new ServiceError("INVALID_INVITE_TTL", "invite expiry must be between 60 seconds and 7 days");
    }
    const access = await this.pool.query<{ organization_id: string }>(
      `SELECT projects.organization_id FROM projects
        JOIN organization_members
          ON organization_members.organization_id = projects.organization_id
         AND organization_members.account_id = $2
       WHERE projects.id = $1 AND projects.state <> 'suspended'`,
      [projectId, actorId],
    );
    const project = access.rows[0];
    if (!project) throw new ServiceError("PROJECT_NOT_FOUND", "project not found", 404);
    const id = randomUUID();
    const expiresAt = Math.floor(Date.now() / 1000) + expiresInSeconds;
    const token = this.signer.issue({ id, projectId, expiresAt });
    await this.pool.query(
      `INSERT INTO play_invites
       (id, project_id, created_by, token_hash, expires_at)
       VALUES ($1, $2, $3, $4, to_timestamp($5))`,
      [id, projectId, actorId, createHash("sha256").update(token).digest(), expiresAt],
    );
    return { token, expiresAt };
  }

  async authorizeRequest(
    request: IncomingMessage,
    projectId: string,
    actorId?: string,
  ): Promise<string | undefined> {
    const result = await this.pool.query<{
      state: string;
      organization_id: string;
      active_deployment_id: string | null;
    }>(
      `SELECT projects.state, projects.organization_id, projects.active_deployment_id
         FROM projects
         JOIN deployments ON deployments.id = projects.active_deployment_id
        CROSS JOIN platform_controls
        WHERE projects.id = $1
          AND projects.play_disabled_at IS NULL
          AND platform_controls.play_disabled_at IS NULL
          AND deployments.status IN ('ready', 'ready_with_warnings')`,
      [projectId],
    );
    const project = result.rows[0];
    if (!project || !project.active_deployment_id) {
      throw new ServiceError("PLAY_UNAVAILABLE", "play unavailable", 404);
    }
    if (project.state === "unlisted" || project.state === "published") return undefined;
    if (project.state !== "private") {
      throw new ServiceError("PLAY_UNAVAILABLE", "play unavailable", 404);
    }
    if (actorId) {
      const membership = await this.pool.query(
        `SELECT 1 FROM organization_members
          WHERE organization_id = $1 AND account_id = $2`,
        [project.organization_id, actorId],
      );
      if (membership.rowCount) {
        return (await this.createInvite(actorId, projectId, 600)).token;
      }
    }
    const url = new URL(request.url ?? "/", "http://web.local");
    const token =
      url.searchParams.get("invite") ??
      (typeof request.headers["x-loki-play-invite"] === "string"
        ? request.headers["x-loki-play-invite"]
        : request.headers.cookie
            ?.split(";")
            .map((part) => part.trim())
            .find((part) => part.startsWith("loki_play_invite="))
            ?.slice("loki_play_invite=".length));
    if (!token) throw new ServiceError("PLAY_INVITE_REQUIRED", "play invite required", 403);
    const payload = this.signer.verify(token);
    if (payload.projectId !== projectId) {
      throw new ServiceError("INVALID_PLAY_INVITE", "invalid play invite", 403);
    }
    const invite = await this.pool.query(
      `SELECT 1 FROM play_invites
        WHERE id = $1 AND project_id = $2 AND token_hash = $3
          AND revoked_at IS NULL AND expires_at > now()`,
      [payload.id, projectId, createHash("sha256").update(token).digest()],
    );
    if (!invite.rowCount) throw new ServiceError("INVALID_PLAY_INVITE", "invalid play invite", 403);
    return token;
  }
}
