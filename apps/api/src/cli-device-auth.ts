import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { Pool, type PoolClient } from "pg";

export type DeviceAuthorizationPollResult =
  | { status: "pending" }
  | { status: "complete"; accessToken: string };

export interface CliDeviceAuthorizationOperations {
  begin(now?: number): Promise<{
    deviceCode: string;
    userCode: string;
    verificationUri: string;
    interval: number;
    expiresIn: number;
  }>;
  approve(input: {
    userCode: string;
    actorId: string;
    accessToken: string;
    accessTokenExpiresAt: number;
    now?: number;
  }): Promise<void>;
  poll(deviceCode: string, now?: number): Promise<DeviceAuthorizationPollResult>;
}

export interface CliDeviceAuthorizationOptions {
  verificationUri: string;
  expiresInSeconds?: number;
  pollIntervalSeconds?: number;
  maximumAccessTokenLifetimeSeconds?: number;
}

type AuthorizationRow = {
  id: string;
  poll_interval_seconds: number;
  expires_at: Date | string;
  approved_at: Date | string | null;
  access_token_ciphertext: Buffer | null;
  access_token_iv: Buffer | null;
  access_token_auth_tag: Buffer | null;
  access_token_expires_at: Date | string | null;
  consumed_at: Date | string | null;
  last_polled_at: Date | string | null;
};

const USER_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const codeHash = (kind: "device" | "user", value: string): Buffer =>
  createHash("sha256").update(`loki:${kind}:`).update(value).digest();

const normalizeUserCode = (value: string): string =>
  value.trim().toUpperCase().replaceAll("-", "").replaceAll(" ", "");

const makeUserCode = (): string => {
  const bytes = randomBytes(8);
  let code = "";
  for (let index = 0; index < bytes.length; index += 1) {
    code += USER_CODE_ALPHABET[bytes[index]! % USER_CODE_ALPHABET.length];
  }
  return `${code.slice(0, 4)}-${code.slice(4)}`;
};

const seconds = (value: Date | string): number =>
  Math.floor(new Date(value).getTime() / 1_000);

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

async function audit(
  client: PoolClient,
  action: string,
  subjectId: string,
  actorId: string | null,
  detail: Record<string, unknown>,
): Promise<void> {
  await client.query(
    `INSERT INTO security_audit_records (actor_id, action, subject_id, detail)
     VALUES ($1, $2, $3, $4::jsonb)`,
    [actorId, action, subjectId, JSON.stringify(detail)],
  );
}

export class PostgresCliDeviceAuthorizationService
  implements CliDeviceAuthorizationOperations
{
  readonly #key: Buffer;
  readonly #expiresIn: number;
  readonly #pollInterval: number;
  readonly #maximumAccessTokenLifetime: number;

  constructor(
    readonly pool: Pool,
    encryptionKey: Uint8Array,
    readonly options: CliDeviceAuthorizationOptions,
  ) {
    this.#key = Buffer.from(encryptionKey);
    if (this.#key.byteLength !== 32) {
      throw new Error("CLI device authorization AES-GCM key must be 32 bytes");
    }
    this.#expiresIn = options.expiresInSeconds ?? 600;
    this.#pollInterval = options.pollIntervalSeconds ?? 5;
    this.#maximumAccessTokenLifetime =
      options.maximumAccessTokenLifetimeSeconds ?? 900;
    if (!/^https:\/\//.test(options.verificationUri)) {
      throw new Error("CLI verification URI must use HTTPS");
    }
    if (this.#expiresIn < 60 || this.#expiresIn > 900) {
      throw new Error("CLI device authorization expiry must be 60-900 seconds");
    }
    if (this.#pollInterval < 1 || this.#pollInterval > 60) {
      throw new Error("CLI device poll interval must be 1-60 seconds");
    }
  }

  async begin(now = Math.floor(Date.now() / 1_000)) {
    const deviceCode = randomBytes(32).toString("base64url");
    const userCode = makeUserCode();
    return transaction(this.pool, async (client) => {
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO cli_device_authorizations
           (device_code_hash, user_code_hash, poll_interval_seconds, expires_at)
         VALUES ($1, $2, $3, to_timestamp($4))
         RETURNING id`,
        [
          codeHash("device", deviceCode),
          codeHash("user", normalizeUserCode(userCode)),
          this.#pollInterval,
          now + this.#expiresIn,
        ],
      );
      await audit(
        client,
        "cli_device_authorization.begun",
        inserted.rows[0]!.id,
        null,
        { expiresAt: now + this.#expiresIn },
      );
      return {
        deviceCode,
        userCode,
        verificationUri: this.options.verificationUri,
        interval: this.#pollInterval,
        expiresIn: this.#expiresIn,
      };
    });
  }

  async approve(input: {
    userCode: string;
    actorId: string;
    accessToken: string;
    accessTokenExpiresAt: number;
    now?: number;
  }): Promise<void> {
    const now = input.now ?? Math.floor(Date.now() / 1_000);
    if (!input.accessToken) throw new Error("access token required");
    if (
      input.accessTokenExpiresAt <= now ||
      input.accessTokenExpiresAt > now + this.#maximumAccessTokenLifetime
    ) {
      throw new Error("access token must be short-lived");
    }
    await transaction(this.pool, async (client) => {
      const selected = await client.query<AuthorizationRow>(
        `SELECT *
           FROM cli_device_authorizations
          WHERE user_code_hash = $1
          FOR UPDATE`,
        [codeHash("user", normalizeUserCode(input.userCode))],
      );
      const authorization = selected.rows[0];
      if (
        !authorization ||
        authorization.approved_at ||
        authorization.consumed_at ||
        seconds(authorization.expires_at) <= now
      ) {
        throw new Error("invalid or expired device user code");
      }
      const tokenExpiresAt = Math.min(
        input.accessTokenExpiresAt,
        seconds(authorization.expires_at),
      );
      if (tokenExpiresAt <= now) throw new Error("device authorization expired");
      const iv = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", this.#key, iv);
      cipher.setAAD(Buffer.from(authorization.id));
      const ciphertext = Buffer.concat([
        cipher.update(input.accessToken, "utf8"),
        cipher.final(),
      ]);
      const authTag = cipher.getAuthTag();
      await client.query(
        `UPDATE cli_device_authorizations
            SET approved_by = $2,
                approved_at = to_timestamp($3),
                access_token_ciphertext = $4,
                access_token_iv = $5,
                access_token_auth_tag = $6,
                access_token_expires_at = to_timestamp($7)
          WHERE id = $1`,
        [
          authorization.id,
          input.actorId,
          now,
          ciphertext,
          iv,
          authTag,
          tokenExpiresAt,
        ],
      );
      await audit(
        client,
        "cli_device_authorization.approved",
        authorization.id,
        input.actorId,
        { accessTokenExpiresAt: tokenExpiresAt },
      );
    });
  }

  async poll(
    deviceCode: string,
    now = Math.floor(Date.now() / 1_000),
  ): Promise<DeviceAuthorizationPollResult> {
    return transaction(this.pool, async (client) => {
      const selected = await client.query<AuthorizationRow>(
        `SELECT *
           FROM cli_device_authorizations
          WHERE device_code_hash = $1
          FOR UPDATE`,
        [codeHash("device", deviceCode)],
      );
      const authorization = selected.rows[0];
      if (
        !authorization ||
        authorization.consumed_at ||
        seconds(authorization.expires_at) <= now
      ) {
        throw new Error("invalid or expired device code");
      }
      if (
        authorization.last_polled_at &&
        seconds(authorization.last_polled_at) +
          authorization.poll_interval_seconds >
          now
      ) {
        return { status: "pending" };
      }
      await client.query(
        `UPDATE cli_device_authorizations
            SET last_polled_at = to_timestamp($2)
          WHERE id = $1`,
        [authorization.id, now],
      );
      if (!authorization.approved_at) return { status: "pending" };
      if (
        !authorization.access_token_ciphertext ||
        !authorization.access_token_iv ||
        !authorization.access_token_auth_tag ||
        !authorization.access_token_expires_at ||
        seconds(authorization.access_token_expires_at) <= now
      ) {
        throw new Error("device access token expired");
      }
      const decipher = createDecipheriv(
        "aes-256-gcm",
        this.#key,
        authorization.access_token_iv,
      );
      decipher.setAAD(Buffer.from(authorization.id));
      decipher.setAuthTag(authorization.access_token_auth_tag);
      const accessToken = Buffer.concat([
        decipher.update(authorization.access_token_ciphertext),
        decipher.final(),
      ]).toString("utf8");
      await client.query(
        `UPDATE cli_device_authorizations
            SET consumed_at = to_timestamp($2)
          WHERE id = $1 AND consumed_at IS NULL`,
        [authorization.id, now],
      );
      await audit(
        client,
        "cli_device_authorization.consumed",
        authorization.id,
        null,
        {},
      );
      return { status: "complete", accessToken };
    });
  }
}
