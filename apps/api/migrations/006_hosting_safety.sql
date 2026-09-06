ALTER TABLE accounts
  ADD COLUMN suspended_at timestamptz,
  ADD COLUMN suspension_reason text;

ALTER TABLE projects
  ADD COLUMN play_disabled_at timestamptz,
  ADD COLUMN play_disabled_reason text;

CREATE TABLE platform_controls (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  play_disabled_at timestamptz,
  play_disabled_reason text,
  updated_by uuid REFERENCES accounts(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO platform_controls (singleton) VALUES (true);

ALTER TABLE deployment_credentials
  ADD COLUMN revoked_at timestamptz,
  ADD COLUMN revocation_reason text;

CREATE TABLE play_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES accounts(id),
  token_hash bytea NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX play_invites_project_expires
  ON play_invites (project_id, expires_at);

CREATE TABLE legal_acceptances (
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  document text NOT NULL CHECK (document IN ('terms', 'privacy', 'aup')),
  version text NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, document, version)
);

CREATE TABLE usage_meters (
  scope_type text NOT NULL CHECK (scope_type IN ('account', 'project')),
  scope_id uuid NOT NULL,
  metric text NOT NULL,
  period_start timestamptz NOT NULL,
  quantity bigint NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (scope_type, scope_id, metric, period_start)
);

CREATE TABLE quota_limits (
  scope_type text NOT NULL CHECK (scope_type IN ('account', 'project', 'global')),
  scope_id uuid,
  metric text NOT NULL,
  hard_limit bigint NOT NULL CHECK (hard_limit >= 0),
  UNIQUE NULLS NOT DISTINCT (scope_type, scope_id, metric),
  CHECK ((scope_type = 'global') = (scope_id IS NULL))
);
INSERT INTO quota_limits (scope_type, scope_id, metric, hard_limit) VALUES
  ('global', NULL, 'projects', 100),
  ('global', NULL, 'stored_bytes', 1073741824),
  ('global', NULL, 'deployments', 100),
  ('global', NULL, 'guest_sessions', 100000),
  ('global', NULL, 'player_sessions', 100000);

CREATE TABLE rate_limit_buckets (
  key_hash bytea NOT NULL,
  operation text NOT NULL,
  window_start timestamptz NOT NULL,
  request_count integer NOT NULL DEFAULT 0,
  PRIMARY KEY (key_hash, operation, window_start)
);

CREATE TABLE reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_account_id uuid REFERENCES accounts(id),
  project_id uuid REFERENCES projects(id),
  deployment_id uuid REFERENCES deployments(id),
  category text NOT NULL,
  summary text NOT NULL CHECK (length(summary) BETWEEN 1 AND 2000),
  evidence_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'resolved', 'dismissed')),
  resolution text,
  resolved_by uuid REFERENCES accounts(id),
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX reports_status_created ON reports (status, created_at DESC);

ALTER TABLE deployments DROP CONSTRAINT deployments_status_check;
ALTER TABLE deployments ADD CONSTRAINT deployments_status_check CHECK (
  status IN (
    'ready', 'ready_with_warnings', 'blocked',
    'security_review_pending', 'quarantined'
  )
);

CREATE TABLE security_review_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deployment_id uuid NOT NULL UNIQUE REFERENCES deployments(id) ON DELETE CASCADE,
  state text NOT NULL DEFAULT 'pending'
    CHECK (state IN ('pending', 'running', 'approved', 'quarantined', 'failed')),
  attempts integer NOT NULL DEFAULT 0,
  finding_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  available_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX security_review_jobs_pending
  ON security_review_jobs (available_at, created_at)
  WHERE state IN ('pending', 'failed');

CREATE OR REPLACE FUNCTION revoke_credentials_on_play_disable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.play_disabled_at IS NOT NULL
     AND OLD.play_disabled_at IS DISTINCT FROM NEW.play_disabled_at THEN
    UPDATE deployment_credentials
       SET revoked_at = now(), revocation_reason = 'project_disabled'
     WHERE project_id = NEW.id AND used_at IS NULL AND revoked_at IS NULL;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER projects_revoke_credentials
AFTER UPDATE OF play_disabled_at ON projects
FOR EACH ROW EXECUTE FUNCTION revoke_credentials_on_play_disable();

CREATE OR REPLACE FUNCTION revoke_credentials_on_global_disable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.play_disabled_at IS NOT NULL
     AND OLD.play_disabled_at IS DISTINCT FROM NEW.play_disabled_at THEN
    UPDATE deployment_credentials
       SET revoked_at = now(), revocation_reason = 'global_disabled'
     WHERE used_at IS NULL AND revoked_at IS NULL;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER platform_revoke_credentials
AFTER UPDATE OF play_disabled_at ON platform_controls
FOR EACH ROW EXECUTE FUNCTION revoke_credentials_on_global_disable();
