-- Let a project be deleted without discarding audit history or reports.
-- Those rows keep their own record and drop the project reference.

ALTER TABLE audit_records
  DROP CONSTRAINT audit_records_project_id_fkey,
  ADD CONSTRAINT audit_records_project_id_fkey
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL;

ALTER TABLE reports
  DROP CONSTRAINT reports_project_id_fkey,
  ADD CONSTRAINT reports_project_id_fkey
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL;

ALTER TABLE reports
  DROP CONSTRAINT reports_deployment_id_fkey,
  ADD CONSTRAINT reports_deployment_id_fkey
    FOREIGN KEY (deployment_id) REFERENCES deployments(id) ON DELETE SET NULL;
