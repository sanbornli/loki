ALTER TABLE github_connection_states
  ADD COLUMN installation_id bigint;

ALTER TABLE github_connection_states
  ADD CONSTRAINT github_connection_states_installation_positive
  CHECK (installation_id IS NULL OR installation_id > 0);
