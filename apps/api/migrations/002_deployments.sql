CREATE TABLE deployments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  content_hash text NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  manifest jsonb NOT NULL,
  files jsonb NOT NULL,
  findings jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL
    CHECK (status IN ('ready', 'ready_with_warnings', 'blocked')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, content_hash)
);

ALTER TABLE projects
  ADD CONSTRAINT projects_active_deployment_fk
  FOREIGN KEY (active_deployment_id)
  REFERENCES deployments(id)
  DEFERRABLE INITIALLY DEFERRED;

CREATE INDEX deployments_project_created
  ON deployments (project_id, created_at DESC);
