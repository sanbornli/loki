import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export interface ReleaseIdentity {
  version: string;
  commit: string;
}

/** Version and commit baked into the image. Missing file means a local run. */
export function releaseIdentity(): ReleaseIdentity {
  try {
    const file = fileURLToPath(new URL("../../../release-identity.json", import.meta.url));
    const parsed = JSON.parse(readFileSync(file, "utf8")) as {
      version?: unknown;
      commit?: unknown;
    };
    return {
      version: typeof parsed.version === "string" ? parsed.version : "unknown",
      commit: typeof parsed.commit === "string" ? parsed.commit : "unknown",
    };
  } catch {
    return { version: "unknown", commit: "unknown" };
  }
}
