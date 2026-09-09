ALTER TABLE security_review_jobs
  DROP CONSTRAINT security_review_jobs_state_check;
ALTER TABLE security_review_jobs
  ADD CONSTRAINT security_review_jobs_state_check CHECK (
    state IN (
      'pending', 'running', 'approved', 'quarantined', 'failed', 'needs_operator'
    )
  );
