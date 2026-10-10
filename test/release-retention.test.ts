import assert from "node:assert/strict";
import test from "node:test";
import { strToU8, zipSync } from "fflate";
import {
  DeploymentService,
  MemoryArtifactStore,
  projectedRetainedBytes,
  releasesToKeep,
} from "../apps/api/src/deployments.js";
import { PlatformService } from "../apps/api/src/platform.js";

const manifest = {
  schemaVersion: 1 as const,
  name: "Retention",
  entrypoint: "index.html",
  networkAllowlist: [] as string[],
};

function buildZip(marker: string): Uint8Array {
  return zipSync({
    "game.json": strToU8(JSON.stringify(manifest)),
    "index.html": strToU8(`<!doctype html><main>${marker}</main>`),
  });
}

test("release retention keeps the newest three and the active release", () => {
  const keep = releasesToKeep(
    [
      { id: "a", totalBytes: 10, createdAt: "2026-01-01T00:00:00.000Z" },
      { id: "b", totalBytes: 10, createdAt: "2026-01-02T00:00:00.000Z" },
      { id: "c", totalBytes: 10, createdAt: "2026-01-03T00:00:00.000Z" },
      { id: "d", totalBytes: 10, createdAt: "2026-01-04T00:00:00.000Z" },
    ],
    "a",
  );
  assert.deepEqual([...keep].sort(), ["a", "b", "c", "d"].filter((id) => keep.has(id)).sort());
  assert.equal(keep.has("a"), true);
  assert.equal(keep.has("b"), true);
  assert.equal(keep.has("c"), true);
  assert.equal(keep.has("d"), true);
  assert.equal(keep.size, 4);

  const newest = releasesToKeep(
    [
      { id: "a", totalBytes: 10, createdAt: "2026-01-01T00:00:00.000Z" },
      { id: "b", totalBytes: 10, createdAt: "2026-01-02T00:00:00.000Z" },
      { id: "c", totalBytes: 10, createdAt: "2026-01-03T00:00:00.000Z" },
      { id: "d", totalBytes: 10, createdAt: "2026-01-04T00:00:00.000Z" },
    ],
    "d",
  );
  assert.equal(newest.has("a"), false);
  assert.equal(newest.size, 3);
});

test("projected storage counts bytes that pruning would free", () => {
  const projected = projectedRetainedBytes({
    accountBytes: 80,
    activeDeploymentId: "newish",
    incomingBytes: 30,
    projectReleases: [
      { id: "old", totalBytes: 40, createdAt: "2026-01-01T00:00:00.000Z" },
      { id: "mid", totalBytes: 20, createdAt: "2026-01-02T00:00:00.000Z" },
      { id: "newish", totalBytes: 20, createdAt: "2026-01-03T00:00:00.000Z" },
    ],
  });
  assert.equal(projected, 70);
});

test("a fourth ship drops the oldest release", async () => {
  const platform = new PlatformService();
  const creator = platform.registerCreator("owner@example.test", "Studio");
  platform.assignPlan(creator.account.id, "loki");
  const project = platform.createProject(creator.account.id, creator.organization.id, {
    name: "Retention",
    slug: "retention-game",
  });
  const artifacts = new MemoryArtifactStore();
  const deployments = new DeploymentService(platform, artifacts);
  const ids: string[] = [];
  for (const marker of ["one", "two", "three", "four"]) {
    const credential = platform.issueDeploymentCredential(creator.account.id, project.id);
    const release = await deployments.deployZip({
      ...credential,
      archive: buildZip(marker),
      activate: true,
    });
    ids.push(release.id);
  }
  assert.equal(await artifacts.get(ids[0]!, "index.html"), undefined);
  assert.ok(await artifacts.get(ids[3]!, "index.html"));
  const latest = await deployments.get(project.id, ids[3]!);
  assert.ok((latest.totalBytes ?? 0) > 0);
});

test("an account over its stored-build cap is rejected before upload", async () => {
  const platform = new PlatformService();
  const creator = platform.registerCreator("owner@example.test", "Studio");
  const project = platform.createProject(creator.account.id, creator.organization.id, {
    name: "Cap",
    slug: "cap-game",
  });
  platform.setRetainedBytes(100 * 1024 * 1024);
  const deployments = new DeploymentService(platform);
  const credential = platform.issueDeploymentCredential(creator.account.id, project.id);
  await assert.rejects(
    () => deployments.deployZip({
      ...credential,
      archive: buildZip("too-big"),
      activate: true,
    }),
    /Free allows 100 MiB of stored builds/,
  );
});
