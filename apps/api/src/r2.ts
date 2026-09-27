import {
  DeleteObjectsCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import type { ArtifactReadStore, ArtifactWriteStore } from "./deployments.js";
import type { StepModuleStore } from "./step-module.js";

const indexKey = (deploymentId: string): string =>
  `releases/${deploymentId}/_loki-files.json`;
const objectKey = (deploymentId: string, file: string): string =>
  `releases/${deploymentId}/${file}`;
const stepModuleKey = (sha256: string): string => `step-modules/${sha256}`;

const statusCode = (error: unknown): number | undefined =>
  (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;

export interface R2ArtifactStoreOptions {
  accountId: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
}

export class R2ReadOnlyArtifactStore implements ArtifactReadStore {
  readonly #client: S3Client;
  readonly #bucket: string;

  constructor(options: R2ArtifactStoreOptions) {
    this.#bucket = options.bucket;
    this.#client = new S3Client({
      region: "auto",
      endpoint: `https://${options.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: options.accessKeyId,
        secretAccessKey: options.secretAccessKey,
      },
    });
  }

  async get(deploymentId: string, file: string): Promise<Uint8Array | undefined> {
    try {
      const response = await this.#client.send(
        new GetObjectCommand({
          Bucket: this.#bucket,
          Key: objectKey(deploymentId, file),
        }),
      );
      return response.Body
        ? new Uint8Array(await response.Body.transformToByteArray())
        : undefined;
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "$metadata" in error &&
        (error as { $metadata?: { httpStatusCode?: number } }).$metadata
          ?.httpStatusCode === 404
      ) {
        return undefined;
      }
      throw error;
    }
  }
}

/** Step modules addressed by sha256. Objects are immutable; a restarted API reads the same bytes the upload wrote. */
export class R2StepModuleStore implements StepModuleStore {
  readonly #client: S3Client;
  readonly #bucket: string;

  constructor(options: R2ArtifactStoreOptions) {
    this.#bucket = options.bucket;
    this.#client = new S3Client({
      region: "auto",
      endpoint: `https://${options.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: options.accessKeyId,
        secretAccessKey: options.secretAccessKey,
      },
    });
  }

  async putIfAbsent(sha256: string, bytes: Uint8Array): Promise<void> {
    try {
      await this.#client.send(
        new PutObjectCommand({
          Bucket: this.#bucket,
          Key: stepModuleKey(sha256),
          Body: bytes,
          IfNoneMatch: "*",
          ContentType: "application/wasm",
          CacheControl: "public, max-age=31536000, immutable",
        }),
      );
    } catch (error) {
      if (statusCode(error) === 412) return;
      throw error;
    }
  }

  async get(sha256: string): Promise<Uint8Array | undefined> {
    try {
      const response = await this.#client.send(
        new GetObjectCommand({
          Bucket: this.#bucket,
          Key: stepModuleKey(sha256),
        }),
      );
      return response.Body
        ? new Uint8Array(await response.Body.transformToByteArray())
        : undefined;
    } catch (error) {
      if (statusCode(error) === 404) return undefined;
      throw error;
    }
  }
}

export class R2ArtifactStore implements ArtifactWriteStore {
  readonly #client: S3Client;
  readonly #bucket: string;

  constructor(options: R2ArtifactStoreOptions) {
    this.#bucket = options.bucket;
    this.#client = new S3Client({
      region: "auto",
      endpoint: `https://${options.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: options.accessKeyId,
        secretAccessKey: options.secretAccessKey,
      },
    });
  }

  async putImmutable(
    deploymentId: string,
    files: Map<string, Uint8Array>,
  ): Promise<void> {
    const names = [...files.keys()].sort();
    for (const name of names) {
      await this.#client.send(
        new PutObjectCommand({
          Bucket: this.#bucket,
          Key: objectKey(deploymentId, name),
          Body: files.get(name),
          IfNoneMatch: "*",
          CacheControl: "public, max-age=31536000, immutable",
        }),
      );
    }
    await this.#client.send(
      new PutObjectCommand({
        Bucket: this.#bucket,
        Key: indexKey(deploymentId),
        Body: JSON.stringify(names),
        IfNoneMatch: "*",
        ContentType: "application/json",
      }),
    );
  }

  async get(deploymentId: string, file: string): Promise<Uint8Array | undefined> {
    try {
      const response = await this.#client.send(
        new GetObjectCommand({
          Bucket: this.#bucket,
          Key: objectKey(deploymentId, file),
        }),
      );
      return response.Body
        ? new Uint8Array(await response.Body.transformToByteArray())
        : undefined;
    } catch (error) {
      if ((error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404) {
        return undefined;
      }
      throw error;
    }
  }

  async delete(deploymentId: string): Promise<void> {
    const indexResponse = await this.#client.send(
      new GetObjectCommand({
        Bucket: this.#bucket,
        Key: indexKey(deploymentId),
      }),
    );
    const names = indexResponse.Body
      ? (JSON.parse(await indexResponse.Body.transformToString()) as string[])
      : [];
    await this.#client.send(
      new DeleteObjectsCommand({
        Bucket: this.#bucket,
        Delete: {
          Objects: [
            ...names.map((name) => ({ Key: objectKey(deploymentId, name) })),
            { Key: indexKey(deploymentId) },
          ],
          Quiet: true,
        },
      }),
    );
  }
}
