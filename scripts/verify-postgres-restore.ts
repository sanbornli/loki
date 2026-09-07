import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { Pool } from "pg";

const sourceUrl = process.env.LOKI_BACKUP_SOURCE_DATABASE_URL;
const restoreUrl = process.env.LOKI_BACKUP_SCRATCH_DATABASE_URL;
const providerReference = process.env.LOKI_PROVIDER_BACKUP_REFERENCE;
const output =
  process.env.LOKI_BACKUP_EVIDENCE_OUTPUT ??
  "artifacts/release/postgres-backup-restore.json";
if (!sourceUrl || !restoreUrl || !providerReference) {
  throw new Error(
    "LOKI_BACKUP_SOURCE_DATABASE_URL, LOKI_BACKUP_SCRATCH_DATABASE_URL, and LOKI_PROVIDER_BACKUP_REFERENCE are required",
  );
}
if (
  sourceUrl === restoreUrl ||
  process.env.LOKI_ALLOW_SCRATCH_DATABASE_REPLACE !== "yes"
) {
  throw new Error(
    "restore target must differ from source and LOKI_ALLOW_SCRATCH_DATABASE_REPLACE=yes is required",
  );
}

async function run(command: string, args: string[]): Promise<void> {
  await new Promise<void>((resolveRun, reject) => {
    const child = spawn(command, args, { stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code) =>
      code === 0
        ? resolveRun()
        : reject(new Error(`${command} exited with ${code}`)),
    );
  });
}

const directory = await mkdtemp(join(tmpdir(), "loki-restore-"));
const dumpPath = join(directory, "backup.dump");
const marker = randomUUID();
const source = new Pool({ connectionString: sourceUrl });
const scratch = new Pool({ connectionString: restoreUrl });
const started = performance.now();
try {
  const sourceFingerprint = await source.query<{
    table_count: string;
    migration_count: string;
  }>(`
    SELECT
      (SELECT count(*)::text FROM information_schema.tables
        WHERE table_schema = 'public') AS table_count,
      (SELECT count(*)::text FROM loki_internal.schema_migrations) AS migration_count
  `);
  await run("pg_dump", [
    "--format=custom",
    "--no-owner",
    "--no-privileges",
    "--schema=public",
    "--schema=loki_internal",
    "--file",
    dumpPath,
    sourceUrl,
  ]);
  await run("pg_restore", [
    "--clean",
    "--if-exists",
    "--no-owner",
    "--no-privileges",
    "--dbname",
    restoreUrl,
    dumpPath,
  ]);
  const restoredFingerprint = await scratch.query<{
    table_count: string;
    migration_count: string;
  }>(`
    SELECT
      (SELECT count(*)::text FROM information_schema.tables
        WHERE table_schema = 'public') AS table_count,
      (SELECT count(*)::text FROM loki_internal.schema_migrations) AS migration_count
  `);
  if (
    JSON.stringify(sourceFingerprint.rows[0]) !==
    JSON.stringify(restoredFingerprint.rows[0])
  ) {
    throw new Error("restored database fingerprint does not match source");
  }
  await scratch.query(
    "CREATE TABLE IF NOT EXISTS loki_restore_verification (marker uuid PRIMARY KEY)",
  );
  await scratch.query(
    "INSERT INTO loki_restore_verification (marker) VALUES ($1)",
    [marker],
  );
  const verified = await scratch.query(
    "SELECT 1 FROM loki_restore_verification WHERE marker = $1",
    [marker],
  );
  if (verified.rowCount !== 1) throw new Error("scratch database is not writable");
  const artifact = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    providerBackupReference: providerReference,
    sourceFingerprint: sourceFingerprint.rows[0],
    restoredFingerprint: restoredFingerprint.rows[0],
    scratchWriteVerified: true,
    rtoSeconds: (performance.now() - started) / 1_000,
  };
  await mkdir(resolve(output, ".."), { recursive: true });
  await writeFile(resolve(output), `${JSON.stringify(artifact, null, 2)}\n`, {
    flag: "wx",
  });
  console.log(JSON.stringify(artifact, null, 2));
} finally {
  await Promise.allSettled([source.end(), scratch.end()]);
  await rm(directory, { recursive: true, force: true });
}
