-- Pin the trigger functions so a caller cannot shadow now() or
-- deployment_credentials by putting another schema first on the path.

ALTER FUNCTION public.revoke_credentials_on_play_disable()
  SET search_path = pg_catalog, public;

ALTER FUNCTION public.revoke_credentials_on_global_disable()
  SET search_path = pg_catalog, public;
