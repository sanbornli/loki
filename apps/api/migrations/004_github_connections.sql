CREATE TABLE github_connection_states (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  state_hash bytea NOT NULL UNIQUE,
  actor_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at > created_at)
);

CREATE INDEX github_connection_states_expiry
  ON github_connection_states (expires_at)
  WHERE consumed_at IS NULL;

CREATE TABLE github_project_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL UNIQUE REFERENCES projects(id) ON DELETE CASCADE,
  installation_id bigint NOT NULL,
  repository_id bigint NOT NULL,
  repository_owner text NOT NULL CHECK (length(repository_owner) BETWEEN 1 AND 100),
  repository_name text NOT NULL CHECK (length(repository_name) BETWEEN 1 AND 100),
  branch text NOT NULL CHECK (length(branch) BETWEEN 1 AND 255),
  root_directory text NOT NULL DEFAULT '.',
  build_command text NOT NULL CHECK (length(build_command) BETWEEN 1 AND 1000),
  output_directory text NOT NULL CHECK (length(output_directory) BETWEEN 1 AND 500),
  workflow_file text NOT NULL DEFAULT '.github/workflows/loki-deploy.yml',
  artifact_name text NOT NULL DEFAULT 'loki-finished-build'
    CHECK (length(artifact_name) BETWEEN 1 AND 255),
  created_by uuid NOT NULL REFERENCES accounts(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (installation_id > 0),
  CHECK (repository_id > 0),
  UNIQUE (installation_id, repository_id)
);

CREATE INDEX github_project_connections_repository
  ON github_project_connections (repository_id);

CREATE TABLE github_webhook_deliveries (
  delivery_id text PRIMARY KEY CHECK (length(delivery_id) BETWEEN 1 AND 255),
  connection_id uuid REFERENCES github_project_connections(id) ON DELETE SET NULL,
  event_name text NOT NULL CHECK (length(event_name) BETWEEN 1 AND 100),
  payload_sha256 bytea NOT NULL CHECK (octet_length(payload_sha256) = 32),
  status text NOT NULL DEFAULT 'received'
    CHECK (status IN ('received', 'processed', 'failed', 'ignored')),
  error_message text,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);

CREATE INDEX github_webhook_deliveries_received
  ON github_webhook_deliveries (received_at DESC);
