CREATE TABLE cli_device_authorizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_code_hash bytea NOT NULL UNIQUE,
  user_code_hash bytea NOT NULL UNIQUE,
  poll_interval_seconds integer NOT NULL
    CHECK (poll_interval_seconds BETWEEN 1 AND 60),
  expires_at timestamptz NOT NULL,
  approved_by uuid REFERENCES accounts(id),
  approved_at timestamptz,
  access_token_ciphertext bytea,
  access_token_iv bytea,
  access_token_auth_tag bytea,
  access_token_expires_at timestamptz,
  consumed_at timestamptz,
  last_polled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (approved_at IS NULL
      AND approved_by IS NULL
      AND access_token_ciphertext IS NULL
      AND access_token_iv IS NULL
      AND access_token_auth_tag IS NULL
      AND access_token_expires_at IS NULL)
    OR
    (approved_at IS NOT NULL
      AND approved_by IS NOT NULL
      AND access_token_ciphertext IS NOT NULL
      AND octet_length(access_token_iv) = 12
      AND octet_length(access_token_auth_tag) = 16
      AND access_token_expires_at IS NOT NULL)
  ),
  CHECK (consumed_at IS NULL OR approved_at IS NOT NULL),
  CHECK (expires_at > created_at)
);

CREATE INDEX cli_device_authorizations_expiry
  ON cli_device_authorizations (expires_at)
  WHERE consumed_at IS NULL;

CREATE TABLE security_audit_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES accounts(id),
  action text NOT NULL,
  subject_id uuid,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

REVOKE UPDATE, DELETE ON security_audit_records FROM PUBLIC;
CREATE INDEX security_audit_records_actor_time
  ON security_audit_records (actor_id, occurred_at DESC);
