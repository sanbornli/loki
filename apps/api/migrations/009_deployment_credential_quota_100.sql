UPDATE quota_limits
   SET hard_limit = 100
 WHERE scope_type = 'global'
   AND scope_id IS NULL
   AND metric = 'deployment_credentials';
