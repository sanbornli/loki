import {
  createHmac,
  createSign,
  timingSafeEqual,
} from "node:crypto";

export interface GitHubRepository {
  id: string;
  owner: string;
  name: string;
  fullName: string;
  defaultBranch: string;
  private: boolean;
}

export interface GitHubArtifact {
  id: string;
  name: string;
  expired: boolean;
  archiveDownloadUrl: string;
}

export const LOKI_WORKFLOW_MARKER =
  "# Loki-owned workflow: lokiplay.github-actions.v1";

type Fetch = typeof fetch;

const githubId = (value: unknown, name: string): string => {
  const normalized = String(value ?? "");
  if (!/^[1-9][0-9]*$/.test(normalized)) throw new Error(`invalid GitHub ${name}`);
  return normalized;
};

const repositoryPart = (value: unknown, name: string): string => {
  if (typeof value !== "string" || !/^[A-Za-z0-9_.-]{1,100}$/.test(value)) {
    throw new Error(`invalid GitHub ${name}`);
  }
  return value;
};

const githubBranch = (value: unknown): string => {
  if (
    typeof value !== "string" ||
    !value ||
    value.length > 255 ||
    /[\s~^:?*[\]\\\x00-\x1F\x7F]/.test(value) ||
    value.startsWith("/") ||
    value.endsWith("/") ||
    value.endsWith(".") ||
    value.includes("..") ||
    value.includes("//") ||
    value.includes("@{")
  ) {
    throw new Error("invalid GitHub default branch");
  }
  return value;
};

const jsonBody = async <T>(response: Response): Promise<T> => {
  const length = Number(response.headers.get("content-length") ?? 0);
  if (length > 2 * 1024 * 1024) throw new Error("GitHub response too large");
  const text = await response.text();
  if (Buffer.byteLength(text) > 2 * 1024 * 1024) {
    throw new Error("GitHub response too large");
  }
  if (!response.ok) throw new Error(`GitHub API request failed (${response.status})`);
  return JSON.parse(text) as T;
};

const discardBoundedBody = async (response: Response): Promise<void> => {
  const length = Number(response.headers.get("content-length") ?? 0);
  if (length > 2 * 1024 * 1024) throw new Error("GitHub response too large");
  const text = await response.text();
  if (Buffer.byteLength(text) > 2 * 1024 * 1024) {
    throw new Error("GitHub response too large");
  }
};

const base64url = (value: string): string =>
  Buffer.from(value).toString("base64url");

export function createGitHubAppJwt(
  appId: string,
  privateKeyPem: string,
  now = Math.floor(Date.now() / 1_000),
): string {
  const issuer = githubId(appId, "app id");
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64url(
    JSON.stringify({ iat: now - 60, exp: now + 540, iss: issuer }),
  );
  const signingInput = `${header}.${payload}`;
  const signer = createSign("RSA-SHA256");
  signer.update(signingInput);
  signer.end();
  return `${signingInput}.${signer.sign(privateKeyPem, "base64url")}`;
}

export function verifyGitHubWebhookSignature(
  secret: string,
  payload: Uint8Array,
  signature: string | undefined,
): boolean {
  if (!signature?.startsWith("sha256=")) return false;
  const suppliedHex = signature.slice("sha256=".length);
  if (!/^[a-f0-9]{64}$/i.test(suppliedHex)) return false;
  const expected = createHmac("sha256", secret).update(payload).digest();
  const supplied = Buffer.from(suppliedHex, "hex");
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

export class GitHubAppClient {
  constructor(
    readonly options: {
      appId: string;
      privateKeyPem: string;
      webhookSecret: string;
      fetch?: Fetch;
    },
  ) {}

  verifyWebhook(payload: Uint8Array, signature: string | undefined): boolean {
    return verifyGitHubWebhookSignature(
      this.options.webhookSecret,
      payload,
      signature,
    );
  }

  async installationToken(installationId: string): Promise<string> {
    const id = githubId(installationId, "installation id");
    const response = await this.request(
      `https://api.github.com/app/installations/${id}/access_tokens`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${createGitHubAppJwt(
            this.options.appId,
            this.options.privateKeyPem,
          )}`,
        },
      },
    );
    const body = await jsonBody<{ token?: unknown }>(response);
    if (typeof body.token !== "string" || !body.token) {
      throw new Error("GitHub installation token response was invalid");
    }
    return body.token;
  }

  async listInstallationRepositories(
    installationId: string,
  ): Promise<GitHubRepository[]> {
    const token = await this.installationToken(installationId);
    const repositories: GitHubRepository[] = [];
    for (let page = 1; page <= 10; page += 1) {
      const response = await this.request(
        `https://api.github.com/installation/repositories?per_page=100&page=${page}`,
        { headers: { authorization: `Bearer ${token}` } },
      );
      const body = await jsonBody<{
        repositories?: unknown[];
        total_count?: number;
      }>(response);
      if (!Array.isArray(body.repositories)) {
        throw new Error("GitHub repository response was invalid");
      }
      repositories.push(...body.repositories.map(parseRepository));
      if (body.repositories.length < 100 || repositories.length >= (body.total_count ?? 0)) {
        break;
      }
    }
    return repositories;
  }

  async getInstallationRepository(
    installationId: string,
    repositoryId: string,
  ): Promise<GitHubRepository> {
    const id = githubId(repositoryId, "repository id");
    const repositories = await this.listInstallationRepositories(installationId);
    const repository = repositories.find((candidate) => candidate.id === id);
    if (!repository) throw new Error("repository is not accessible to installation");
    return repository;
  }

  async repositoryText(
    installationId: string,
    repository: GitHubRepository,
    filePath: string,
    ref = repository.defaultBranch,
  ): Promise<string | undefined> {
    if (!/^[A-Za-z0-9._/-]{1,500}$/.test(filePath) || filePath.includes("..")) {
      throw new Error("invalid repository content path");
    }
    const token = await this.installationToken(installationId);
    const response = await this.request(
      `https://api.github.com/repos/${encodeURIComponent(repository.owner)}/` +
        `${encodeURIComponent(repository.name)}/contents/${filePath
          .split("/")
          .map(encodeURIComponent)
          .join("/")}?ref=${encodeURIComponent(ref)}`,
      { headers: { authorization: `Bearer ${token}` } },
    );
    if (response.status === 404) return undefined;
    const body = await jsonBody<{
      type?: unknown;
      encoding?: unknown;
      content?: unknown;
      size?: unknown;
    }>(response);
    if (
      body.type !== "file" ||
      body.encoding !== "base64" ||
      typeof body.content !== "string" ||
      Number(body.size) > 1024 * 1024
    ) {
      return undefined;
    }
    return Buffer.from(body.content.replace(/\s/g, ""), "base64").toString("utf8");
  }

  async installWorkflow(input: {
    installationId: string;
    repository: GitHubRepository;
    branch: string;
    workflowFile: string;
    content: string;
  }): Promise<"created" | "updated" | "unchanged"> {
    const branch = githubBranch(input.branch);
    const workflowFile = input.workflowFile.replaceAll("\\", "/");
    if (
      !/^\.github\/workflows\/[A-Za-z0-9_.-]+\.ya?ml$/.test(workflowFile) ||
      workflowFile.length > 500
    ) {
      throw new Error("invalid GitHub workflow path");
    }
    if (
      !input.content.startsWith(LOKI_WORKFLOW_MARKER) ||
      Buffer.byteLength(input.content) > 128 * 1024
    ) {
      throw new Error("invalid Loki workflow content");
    }
    const token = await this.installationToken(input.installationId);
    const url =
      `https://api.github.com/repos/${encodeURIComponent(input.repository.owner)}/` +
      `${encodeURIComponent(input.repository.name)}/contents/${workflowFile
        .split("/")
        .map(encodeURIComponent)
        .join("/")}`;

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const existing = await this.readWorkflow(url, branch, token);
      if (existing?.content === input.content) return "unchanged";
      if (existing && !existing.content.startsWith(LOKI_WORKFLOW_MARKER)) {
        throw new Error("refusing to overwrite a non-Loki GitHub workflow");
      }
      const response = await this.request(url, {
        method: "PUT",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          message: existing
            ? "Update Loki deployment workflow"
            : "Add Loki deployment workflow",
          content: Buffer.from(input.content).toString("base64"),
          branch,
          ...(existing ? { sha: existing.sha } : {}),
        }),
      });
      if (response.status === 409 || response.status === 422) {
        await discardBoundedBody(response);
        if (attempt < 2) continue;
        throw new Error("GitHub workflow changed concurrently");
      }
      const body = await jsonBody<{
        content?: { sha?: unknown };
        commit?: { sha?: unknown };
      }>(response);
      if (
        typeof body.content?.sha !== "string" ||
        !/^[a-f0-9]{40,64}$/i.test(body.content.sha) ||
        typeof body.commit?.sha !== "string" ||
        !/^[a-f0-9]{40,64}$/i.test(body.commit.sha)
      ) {
        throw new Error("GitHub workflow write response was invalid");
      }
      return existing ? "updated" : "created";
    }
    throw new Error("GitHub workflow installation failed");
  }

  async findRunArtifact(
    installationId: string,
    repository: GitHubRepository,
    runId: string,
    artifactName: string,
  ): Promise<GitHubArtifact> {
    const token = await this.installationToken(installationId);
    const response = await this.request(
      `https://api.github.com/repos/${encodeURIComponent(repository.owner)}/` +
        `${encodeURIComponent(repository.name)}/actions/runs/${githubId(runId, "run id")}` +
        `/artifacts?name=${encodeURIComponent(artifactName)}&per_page=100`,
      { headers: { authorization: `Bearer ${token}` } },
    );
    const body = await jsonBody<{ artifacts?: unknown[] }>(response);
    if (!Array.isArray(body.artifacts)) throw new Error("GitHub artifact response was invalid");
    const matches = body.artifacts
      .map(parseArtifact)
      .filter((artifact) => artifact.name === artifactName && !artifact.expired);
    if (matches.length !== 1) {
      throw new Error(
        matches.length ? "multiple matching GitHub artifacts found" : "GitHub artifact not found",
      );
    }
    return matches[0]!;
  }

  async downloadArtifact(
    installationId: string,
    artifact: GitHubArtifact,
    limitBytes = 25 * 1024 * 1024,
  ): Promise<Uint8Array> {
    const token = await this.installationToken(installationId);
    const expectedPrefix = "https://api.github.com/";
    if (!artifact.archiveDownloadUrl.startsWith(expectedPrefix)) {
      throw new Error("invalid GitHub artifact download URL");
    }
    const response = await this.request(artifact.archiveDownloadUrl, {
      headers: { authorization: `Bearer ${token}` },
    });
    if (!response.ok) throw new Error(`GitHub artifact download failed (${response.status})`);
    const declared = Number(response.headers.get("content-length") ?? 0);
    if (declared > limitBytes) throw new Error("GitHub artifact exceeds size limit");
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > limitBytes) throw new Error("GitHub artifact exceeds size limit");
    return bytes;
  }

  private request(url: string, init: RequestInit): Promise<Response> {
    const headers = new Headers(init.headers);
    headers.set("accept", "application/vnd.github+json");
    headers.set("user-agent", "lokiplay-github-app");
    headers.set("x-github-api-version", "2022-11-28");
    return (this.options.fetch ?? fetch)(url, { ...init, headers });
  }

  private async readWorkflow(
    url: string,
    branch: string,
    token: string,
  ): Promise<{ sha: string; content: string } | undefined> {
    const response = await this.request(
      `${url}?ref=${encodeURIComponent(branch)}`,
      { headers: { authorization: `Bearer ${token}` } },
    );
    if (response.status === 404) return undefined;
    const body = await jsonBody<{
      type?: unknown;
      encoding?: unknown;
      content?: unknown;
      size?: unknown;
      sha?: unknown;
    }>(response);
    if (
      body.type !== "file" ||
      body.encoding !== "base64" ||
      typeof body.content !== "string" ||
      typeof body.sha !== "string" ||
      !/^[a-f0-9]{40,64}$/i.test(body.sha) ||
      !Number.isSafeInteger(body.size) ||
      Number(body.size) < 0 ||
      Number(body.size) > 128 * 1024
    ) {
      throw new Error("GitHub workflow response was invalid");
    }
    const encodedContent = body.content.replace(/\s/g, "");
    if (
      encodedContent.length % 4 !== 0 ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
        encodedContent,
      )
    ) {
      throw new Error("GitHub workflow response was invalid");
    }
    const content = Buffer.from(encodedContent, "base64");
    if (content.byteLength !== Number(body.size) || content.byteLength > 128 * 1024) {
      throw new Error("GitHub workflow response was invalid");
    }
    return { sha: body.sha, content: content.toString("utf8") };
  }
}

const parseRepository = (value: unknown): GitHubRepository => {
  const input = value as Record<string, unknown>;
  const owner = (input.owner ?? {}) as Record<string, unknown>;
  const repositoryOwner = repositoryPart(owner.login, "repository owner");
  const name = repositoryPart(input.name, "repository name");
  return {
    id: githubId(input.id, "repository id"),
    owner: repositoryOwner,
    name,
    fullName: `${repositoryOwner}/${name}`,
    defaultBranch: githubBranch(input.default_branch),
    private: input.private === true,
  };
};

const parseArtifact = (value: unknown): GitHubArtifact => {
  const input = value as Record<string, unknown>;
  if (
    typeof input.name !== "string" ||
    !input.name ||
    input.name.length > 255 ||
    /[\r\n]/.test(input.name) ||
    typeof input.archive_download_url !== "string"
  ) {
    throw new Error("GitHub artifact response was invalid");
  }
  return {
    id: githubId(input.id, "artifact id"),
    name: input.name,
    expired: input.expired === true,
    archiveDownloadUrl: input.archive_download_url,
  };
};

export function githubActionsWorkflow(input: {
  branch: string;
  rootDirectory: string;
  buildCommand: string;
  outputDirectory: string;
  artifactName: string;
}): string {
  const yamlString = (value: string) => JSON.stringify(value);
  return [
    LOKI_WORKFLOW_MARKER,
    "name: Loki Deploy",
    "on:",
    "  push:",
    "    branches:",
    `      - ${yamlString(input.branch)}`,
    "  workflow_dispatch:",
    "permissions:",
    "  contents: read",
    "jobs:",
    "  build:",
    "    runs-on: ubuntu-latest",
    "    steps:",
    "      - uses: actions/checkout@v4",
    "      - uses: actions/setup-node@v4",
    "        with:",
    "          node-version: 22",
    "      - uses: oven-sh/setup-bun@v2",
    "      - name: Install dependencies",
    "        run: |",
    "          if [ -f bun.lock ] || [ -f bun.lockb ]; then bun install --frozen-lockfile",
    "          elif [ -f pnpm-lock.yaml ]; then corepack enable && pnpm install --frozen-lockfile",
    "          elif [ -f yarn.lock ]; then corepack enable && yarn install --immutable",
    "          elif [ -f package-lock.json ]; then npm ci",
    "          else npm install",
    "          fi",
    `        working-directory: ${yamlString(input.rootDirectory)}`,
    `      - run: ${yamlString(input.buildCommand)}`,
    `        working-directory: ${yamlString(input.rootDirectory)}`,
    "      - uses: actions/upload-artifact@v4",
    "        with:",
    `          name: ${yamlString(input.artifactName)}`,
    `          path: ${yamlString(
      input.rootDirectory === "."
        ? input.outputDirectory
        : `${input.rootDirectory}/${input.outputDirectory}`,
    )}`,
    "          if-no-files-found: error",
    "          retention-days: 7",
    "",
  ].join("\n");
}
