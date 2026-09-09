import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import {
  ProjectStateSchema,
  type PlayerSessionClaims,
  type ProjectState,
} from "../../../packages/protocol/src/index.js";
import { SessionTokenService } from "./tokens.js";

export interface Account {
  id: string;
  email: string;
  platformRole: "creator" | "admin";
  createdAt: string;
}

export interface Organization {
  id: string;
  name: string;
  createdAt: string;
}

export interface Project {
  id: string;
  organizationId: string;
  name: string;
  slug: string;
  state: ProjectState;
  activeDeploymentId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuditRecord {
  id: string;
  actorId: string;
  organizationId: string;
  projectId?: string;
  action: string;
  detail: Record<string, unknown>;
  occurredAt: string;
}

export type Awaitable<T> = T | Promise<T>;

export interface PlatformOperations {
  readonly tokens: SessionTokenService;
  createOrganization(actorId: string, name: string): Awaitable<Organization>;
  createProject(
    actorId: string,
    organizationId: string,
    input: { name: string; slug: string },
  ): Awaitable<Project>;
  transitionProject(
    actorId: string,
    projectId: string,
    next: ProjectState,
  ): Awaitable<Project>;
  issueDeploymentCredential(
    actorId: string,
    projectId: string,
    now?: number,
  ): Awaitable<{ credentialId: string; secret: string; expiresAt: number }>;
  consumeDeploymentCredential(
    credentialId: string,
    secret: string,
    now?: number,
  ): Awaitable<{ projectId: string; actorId: string }>;
  issuePlayerSession(
    projectId: string,
    playerId?: string,
    guest?: boolean,
    now?: number,
  ): Awaitable<string>;
  setActiveDeployment(
    actorId: string,
    projectId: string,
    deploymentId: string,
  ): Awaitable<Project>;
  getProject(actorId: string, projectId: string): Awaitable<Project>;
  playableProject(
    projectId: string,
  ): Awaitable<Pick<Project, "id" | "name" | "slug" | "state" | "activeDeploymentId">>;
  auditLog(actorId: string, organizationId: string): Awaitable<AuditRecord[]>;
}

interface DeploymentCredential {
  id: string;
  projectId: string;
  actorId: string;
  secretHash: string;
  expiresAt: number;
  usedAt?: number;
}

const transitions: Record<ProjectState, ProjectState[]> = {
  draft: ["private"],
  private: ["draft", "unlisted", "review_requested"],
  unlisted: ["private", "review_requested"],
  review_requested: ["private"],
  published: ["unlisted", "suspended"],
  suspended: ["private"],
};

const secretHash = (value: string): string =>
  createHash("sha256").update(value).digest("hex");

export class PlatformService {
  readonly #accounts = new Map<string, Account>();
  readonly #organizations = new Map<string, Organization>();
  readonly #members = new Map<string, Map<string, "owner" | "member">>();
  readonly #projects = new Map<string, Project>();
  readonly #credentials = new Map<string, DeploymentCredential>();
  readonly #audit: AuditRecord[] = [];

  constructor(readonly tokens = new SessionTokenService()) {}

  createOrganization(actorId: string, name: string): Organization {
    this.#requireAccount(actorId);
    const organization: Organization = {
      id: randomUUID(),
      name: name.trim(),
      createdAt: new Date().toISOString(),
    };
    if (!organization.name) throw new Error("organization name required");
    this.#organizations.set(organization.id, organization);
    this.#members.set(organization.id, new Map([[actorId, "owner"]]));
    this.#record(actorId, organization.id, undefined, "organization.created", {
      name: organization.name,
    });
    return structuredClone(organization);
  }

  registerCreator(
    email: string,
    organizationName: string,
  ): { account: Account; organization: Organization } {
    const normalizedEmail = email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalizedEmail)) {
      throw new Error("invalid email");
    }
    if ([...this.#accounts.values()].some((account) => account.email === normalizedEmail)) {
      throw new Error("email already registered");
    }
    const now = new Date().toISOString();
    const account: Account = {
      id: randomUUID(),
      email: normalizedEmail,
      platformRole: "creator",
      createdAt: now,
    };
    const organization: Organization = {
      id: randomUUID(),
      name: organizationName.trim(),
      createdAt: now,
    };
    if (!organization.name) throw new Error("organization name required");
    this.#accounts.set(account.id, account);
    this.#organizations.set(organization.id, organization);
    this.#members.set(organization.id, new Map([[account.id, "owner"]]));
    this.#record(account.id, organization.id, undefined, "creator.registered", {
      email: normalizedEmail,
    });
    return { account: structuredClone(account), organization: structuredClone(organization) };
  }

  createProject(
    actorId: string,
    organizationId: string,
    input: { name: string; slug: string },
  ): Project {
    this.#requireMember(actorId, organizationId);
    if (!/^[a-z0-9-]{3,48}$/.test(input.slug)) throw new Error("invalid slug");
    if (
      [...this.#projects.values()].some(
        (project) =>
          project.organizationId === organizationId && project.slug === input.slug,
      )
    ) {
      throw new Error("slug already exists");
    }
    const now = new Date().toISOString();
    const project: Project = {
      id: randomUUID(),
      organizationId,
      name: input.name.trim(),
      slug: input.slug,
      state: "draft",
      createdAt: now,
      updatedAt: now,
    };
    if (!project.name) throw new Error("project name required");
    this.#projects.set(project.id, project);
    this.#record(actorId, organizationId, project.id, "project.created", {
      slug: project.slug,
    });
    return structuredClone(project);
  }

  transitionProject(actorId: string, projectId: string, next: ProjectState): Project {
    ProjectStateSchema.parse(next);
    const project = this.#requireProject(projectId);
    this.#requireMember(actorId, project.organizationId);
    const actor = this.#requireAccount(actorId);
    if (
      (next === "suspended" || project.state === "suspended") &&
      actor.platformRole !== "admin"
    ) {
      throw new Error("admin required for suspension changes");
    }
    if (next === "published") {
      throw new Error("Layer 2 publication is closed");
    }
    if (!transitions[project.state].includes(next)) {
      throw new Error(`invalid project transition ${project.state} -> ${next}`);
    }
    const previous = project.state;
    project.state = next;
    project.updatedAt = new Date().toISOString();
    this.#record(actorId, project.organizationId, project.id, "project.state_changed", {
      previous,
      next,
    });
    return structuredClone(project);
  }

  issueDeploymentCredential(
    actorId: string,
    projectId: string,
    now = Math.floor(Date.now() / 1_000),
  ): { credentialId: string; secret: string; expiresAt: number } {
    const project = this.#requireProject(projectId);
    this.#requireMember(actorId, project.organizationId);
    if (project.state === "suspended") throw new Error("project suspended");
    const credentialId = randomUUID();
    const secret = `loki_deploy_${randomBytes(32).toString("base64url")}`;
    const credential: DeploymentCredential = {
      id: credentialId,
      projectId,
      actorId,
      secretHash: secretHash(secret),
      expiresAt: now + 600,
    };
    this.#credentials.set(credentialId, credential);
    this.#record(
      actorId,
      project.organizationId,
      projectId,
      "deployment_credential.issued",
      { credentialId, expiresAt: credential.expiresAt },
    );
    return { credentialId, secret, expiresAt: credential.expiresAt };
  }

  consumeDeploymentCredential(
    credentialId: string,
    secret: string,
    now = Math.floor(Date.now() / 1_000),
  ): { projectId: string; actorId: string } {
    const credential = this.#credentials.get(credentialId);
    if (!credential || credential.usedAt || credential.expiresAt <= now) {
      throw new Error("invalid deployment credential");
    }
    const actual = Buffer.from(secretHash(secret), "hex");
    const expected = Buffer.from(credential.secretHash, "hex");
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
      throw new Error("invalid deployment credential");
    }
    credential.usedAt = now;
    const project = this.#requireProject(credential.projectId);
    this.#record(
      credential.actorId,
      project.organizationId,
      project.id,
      "deployment_credential.consumed",
      { credentialId },
    );
    return { projectId: credential.projectId, actorId: credential.actorId };
  }

  issuePlayerSession(
    projectId: string,
    playerId: string = randomUUID(),
    guest = true,
    now = Math.floor(Date.now() / 1_000),
  ): string {
    const project = this.#requireProject(projectId);
    if (!["private", "unlisted", "published"].includes(project.state)) {
      throw new Error("project is not playable");
    }
    const claims: PlayerSessionClaims = {
      issuer: "lokiplay",
      audience: "lokiplay-game",
      subject: playerId,
      projectId: project.id,
      organizationId: project.organizationId,
      guest,
      issuedAt: now,
      expiresAt: now + 600,
      nonce: randomUUID(),
    };
    return this.tokens.issue(claims);
  }

  setActiveDeployment(actorId: string, projectId: string, deploymentId: string): Project {
    const project = this.#requireProject(projectId);
    this.#requireMember(actorId, project.organizationId);
    project.activeDeploymentId = deploymentId;
    if (project.state === "draft") project.state = "unlisted";
    project.updatedAt = new Date().toISOString();
    this.#record(actorId, project.organizationId, project.id, "deployment.activated", {
      deploymentId,
    });
    return structuredClone(project);
  }

  getProject(actorId: string, projectId: string): Project {
    const project = this.#requireProject(projectId);
    this.#requireMember(actorId, project.organizationId);
    return structuredClone(project);
  }

  playableProject(projectId: string): Pick<
    Project,
    "id" | "name" | "slug" | "state" | "activeDeploymentId"
  > {
    const project = this.#requireProject(projectId);
    if (
      !["private", "unlisted", "published"].includes(project.state) ||
      !project.activeDeploymentId
    ) {
      throw new Error("project is not playable");
    }
    return {
      id: project.id,
      name: project.name,
      slug: project.slug,
      state: project.state,
      activeDeploymentId: project.activeDeploymentId,
    };
  }

  auditLog(actorId: string, organizationId: string): AuditRecord[] {
    this.#requireMember(actorId, organizationId);
    return this.#audit
      .filter((record) => record.organizationId === organizationId)
      .map((record) => structuredClone(record));
  }

  #requireAccount(accountId: string): Account {
    const account = this.#accounts.get(accountId);
    if (!account) throw new Error("account not found");
    return account;
  }

  #requireMember(actorId: string, organizationId: string): void {
    this.#requireAccount(actorId);
    if (!this.#members.get(organizationId)?.has(actorId)) {
      throw new Error("organization access denied");
    }
  }

  #requireProject(projectId: string): Project {
    const project = this.#projects.get(projectId);
    if (!project) throw new Error("project not found");
    return project;
  }

  #record(
    actorId: string,
    organizationId: string,
    projectId: string | undefined,
    action: string,
    detail: Record<string, unknown>,
  ): void {
    this.#audit.push({
      id: randomUUID(),
      actorId,
      organizationId,
      projectId,
      action,
      detail: structuredClone(detail),
      occurredAt: new Date().toISOString(),
    });
  }
}
