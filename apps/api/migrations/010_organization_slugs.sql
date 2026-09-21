ALTER TABLE organizations
  ADD COLUMN slug text;

UPDATE organizations
   SET slug = left(
     trim(both '-' from lower(regexp_replace(name, '[^a-zA-Z0-9]+', '-', 'g'))),
     48
   );

UPDATE organizations
   SET slug = 'studio-' || substr(replace(id::text, '-', ''), 1, 8)
 WHERE slug IS NULL
    OR length(slug) < 3
    OR slug !~ '^[a-z0-9-]{3,48}$';

UPDATE organizations
   SET slug = left(slug, 39) || '-' || substr(replace(id::text, '-', ''), 1, 8)
 WHERE slug IN (
   'admin', 'api', 'app', 'assets', 'catalog', 'creator', 'device', 'docs',
   'games', 'health', 'login', 'operator', 'play', 'signup', 'www'
 );

WITH ranked AS (
  SELECT id,
         slug,
         row_number() OVER (PARTITION BY slug ORDER BY created_at, id) AS rn
    FROM organizations
)
UPDATE organizations AS organizations
   SET slug = left(ranked.slug, 39) || '-' || substr(replace(organizations.id::text, '-', ''), 1, 8)
  FROM ranked
 WHERE organizations.id = ranked.id
   AND ranked.rn > 1;

ALTER TABLE organizations
  ALTER COLUMN slug SET NOT NULL,
  ADD CONSTRAINT organizations_slug_format
    CHECK (slug ~ '^[a-z0-9-]{3,48}$'),
  ADD CONSTRAINT organizations_slug_key UNIQUE (slug);
