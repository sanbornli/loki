INSERT INTO quota_limits (scope_type, scope_id, metric, hard_limit)
VALUES ('global', NULL, 'deployment_credentials', 5)
ON CONFLICT DO NOTHING;
