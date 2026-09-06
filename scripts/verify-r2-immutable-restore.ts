import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

const required = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
};
const accountId = required("LOKI_R2_ACCOUNT_ID");
const sourceBucket = required("LOKI_R2_BUCKET");
const accessKeyId = required("LOKI_R2_ACCESS_KEY_ID");
const secretAccessKey = required("LOKI_R2_SECRET_ACCESS_KEY");
const sourceKey = required("LOKI_R2_IMMUTABLE_RELEASE_KEY");
const sourceDigest = required("LOKI_R2_IMMUTABLE_RELEASE_SHA256");
const restoreBucket = required("LOKI_R2_RESTORE_SCRATCH_BUCKET");
const providerReference = required("LOKI_R2_BACKUP_REFERENCE");
if (
  sourceBucket === restoreBucket ||
  process.env.LOKI_ALLOW_R2_SCRATCH_WRITE !== "yes"
) {
  throw new Error(
    "a distinct scratch bucket and LOKI_ALLOW_R2_SCRATCH_WRITE=yes are required",
  );
}
if (!/^[a-f0-9]{64}$/.test(sourceDigest)) {
  throw new Error("LOKI_R2_IMMUTABLE_RELEASE_SHA256 must be lowercase SHA-256");
}

const client = new S3Client({
  region: "auto",
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId, secretAccessKey },
});
const started = performance.now();
const source = await client.send(
  new GetObjectCommand({ Bucket: sourceBucket, Key: sourceKey }),
);
if (!source.Body) throw new Error("immutable source object has no body");
const bytes = Buffer.from(await source.Body.transformToByteArray());
const actualDigest = createHash("sha256").update(bytes).digest("hex");
if (actualDigest !== sourceDigest) {
  throw new Error("immutable source object digest does not match recorded evidence");
}
const restoreKey = `loki-restore-verification/${randomUUID()}`;
try {
  await client.send(
    new PutObjectCommand({
      Bucket: restoreBucket,
      Key: restoreKey,
      Body: bytes,
      Metadata: {
        "source-bucket": sourceBucket,
        "source-key-sha256": createHash("sha256")
          .update(sourceKey)
          .digest("hex"),
        "content-sha256": sourceDigest,
      },
    }),
  );
  const [head, restored] = await Promise.all([
    client.send(
      new HeadObjectCommand({ Bucket: restoreBucket, Key: restoreKey }),
    ),
    client.send(
      new GetObjectCommand({ Bucket: restoreBucket, Key: restoreKey }),
    ),
  ]);
  if (!restored.Body) throw new Error("restored object has no body");
  const restoredBytes = Buffer.from(
    await restored.Body.transformToByteArray(),
  );
  const restoredDigest = createHash("sha256")
    .update(restoredBytes)
    .digest("hex");
  if (
    restoredDigest !== sourceDigest ||
    head.Metadata?.["content-sha256"] !== sourceDigest
  ) {
    throw new Error("restored object content or metadata is not identical");
  }
  const output =
    process.env.LOKI_R2_EVIDENCE_OUTPUT ??
    "artifacts/release/r2-immutable-restore.json";
  await mkdir(resolve(output, ".."), { recursive: true });
  const artifact = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    providerBackupReference: providerReference,
    source: {
      bucket: sourceBucket,
      keyReferenceSha256: createHash("sha256").update(sourceKey).digest("hex"),
      versionId: source.VersionId ?? null,
      etag: source.ETag ?? null,
      sha256: sourceDigest,
      bytes: bytes.length,
    },
    restore: {
      bucket: restoreBucket,
      etag: head.ETag ?? null,
      sha256: restoredDigest,
      rtoSeconds: (performance.now() - started) / 1_000,
    },
  };
  await writeFile(resolve(output), `${JSON.stringify(artifact, null, 2)}\n`, {
    flag: "wx",
  });
  console.log(JSON.stringify(artifact, null, 2));
} finally {
  await client.send(
    new DeleteObjectCommand({ Bucket: restoreBucket, Key: restoreKey }),
  );
}
