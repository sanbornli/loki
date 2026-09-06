# Provider backup and restore

## PostgreSQL

1. Confirm Supabase PITR is enabled for both platform and Nakama databases and
   record the provider backup/PITR reference and target recovery timestamp.
2. Create isolated scratch projects with no production traffic or credentials.
3. Restore through the provider workflow. For logical verification, install
   matching PostgreSQL client tools and run:

   `LOKI_BACKUP_SOURCE_DATABASE_URL=... LOKI_BACKUP_SCRATCH_DATABASE_URL=... LOKI_PROVIDER_BACKUP_REFERENCE=... LOKI_ALLOW_SCRATCH_DATABASE_REPLACE=yes npx tsx scripts/verify-postgres-restore.ts`

4. Compare migrations and table inventory, then perform application-level row
   and relationship checks appropriate to the incident. Record RPO and RTO.
5. Delete scratch credentials and project after evidence retention is secured.

The script uses `pg_restore --clean` against the explicit scratch URL. It
refuses identical source/target URLs and missing provider evidence.

## R2 immutable releases

Choose a known immutable release key and its previously recorded SHA-256. Use a
distinct scratch bucket, then run:

`LOKI_R2_IMMUTABLE_RELEASE_KEY=... LOKI_R2_IMMUTABLE_RELEASE_SHA256=... LOKI_R2_RESTORE_SCRATCH_BUCKET=... LOKI_R2_BACKUP_REFERENCE=... LOKI_ALLOW_R2_SCRATCH_WRITE=yes npx tsx scripts/verify-r2-immutable-restore.ts`

Provide the standard R2 account/bucket credentials as well. The script downloads
and hashes the source, copies it to the scratch bucket, reads and hashes the
copy, records metadata/RTO, and deletes the scratch object. A missing reference,
digest mismatch, or provider credential fails closed.
