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
import {
  activationState,
  activeGameLimitMessage,
  assertPublicCatalog,
  assertRoomSize,
  assertServerAuthority,
  assertWithinCap,
  consumesPlayLink,
  entitledPlan,
  INACTIVE_DEPLOY_MESSAGE,
  limitsFor,
  PLAYABLE_PROJECT_STATES,
  PROJECT_TRANSITIONS,
  roomQuotaForPlan,
  storedGameLimitMessage,
  type BillingRecord,
  type PlanId,
  type PlanLimits,
  type PlanStatus,
} from "./plans.js";
import {
  allocateUniqueSlug,
  playablePath,
  validateOrganizationSlug,
  validateProjectSlug,
} from "./slugs.js";
import { SessionTokenService } from "./tokens.js";

export class InactiveProjectError extends Error {
  constructor() {
    super("project is inactive");
    this.name = "InactiveProjectError";
  }
}

export function isInactiveProject(error: unknown): boolean {
  return error instanceof InactiveProjectError ||
    (error instanceof Error && error.message === "project is inactive");
}

export interface Account {
  id: string;
  email: string;
  platformRole: "creator" | "admin";
  createdAt: string;
  plan: PlanId;
  planStatus: PlanStatus;
  planPeriodEnd?: string;
  manageBilling: boolean;
  limits: PlanLimits;
}

export interface SubscriptionUpdate {
  accountId: string;
  plan?: PlanId;
  status?: PlanStatus;
  periodEnd?: string;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
}

export interface Project {
  id: string;
  organizationId: string;
  name: string;
  slug: string;
  state: ProjectState;
  activeDeploymentId?: string;
  /** Why an operator suspended the project. Present only while suspended. */
  suspensionReason?: string;
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
  createOrganization(
    actorId: string,
    input: { name: string; slug: string },
  ): Awaitable<Organization>;
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
  deleteProject(actorId: string, projectId: string): Awaitable<void>;
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
  playableProjectBySlugs(
    organizationSlug: string,
    projectSlug: string,
  ): Awaitable<Pick<Project, "id" | "name" | "slug" | "state" | "activeDeploymentId">>;
  projectPlayPath(projectId: string): Awaitable<string>;
  auditLog(actorId: string, organizationId: string): Awaitable<AuditRecord[]>;
  billingContact(accountId: string): Awaitable<{ email: string; stripeCustomerId?: string }>;
  applySubscription(update: SubscriptionUpdate): Awaitable<void>;
  accountIdForStripeCustomer(
    customerId?: string,
    subscriptionId?: string,
  ): Awaitable<string | undefined>;
  projectRuntimeLimits(projectId: string): Awaitable<{
    plan: PlanId;
    maxPlayersPerRoom: number;
    simultaneousRooms: number;
    serverAuthority: boolean;
    storedBytes: number | null;
  }>;
  /** Retained build bytes for the account that owns this project. */
  retainedBytes(projectId: string): Awaitable<number>;
  assertManifestAllowed(
    projectId: string,
    manifest: { multiplayer?: { enabled?: boolean; authority: "host" | "server"; maxPlayers: number } },
  ): Awaitable<void>;
}

interface DeploymentCredential {
  id: string;
  projectId: string;
  actorId: string;
  secretHash: string;
  expiresAt: number;
  usedAt?: number;
}

const secretHash = (value: string): string =>
  createHash("sha256").update(value).digest("hex");

interface StoredAccount {
  id: string;
  email: string;
  platformRole: "creator" | "admin";
  createdAt: string;
  plan: PlanId;
  planStatus: PlanStatus;
  planPeriodEnd?: string;
}

interface StripeLink {
  customerId?: string;
  subscriptionId?: string;
}

export class PlatformService {
  readonly #accounts = new Map<string, StoredAccount>();
  readonly #organizations = new Map<string, Organization>();
  readonly #members = new Map<string, Map<string, "owner" | "member">>();
  readonly #projects = new Map<string, Project>();
  readonly #credentials = new Map<string, DeploymentCredential>();
  readonly #audit: AuditRecord[] = [];
  readonly #stripe = new Map<string, StripeLink>();
  readonly #customers = new Map<string, string>();
  readonly #subscriptions = new Map<string, string>();
  #retainedBytes = 0;

  constructor(readonly tokens = new SessionTokenService()) {}

  createOrganization(
    actorId: string,
    input: { name: string; slug: string },
  ): Organization {
    this.#requireAccount(actorId);
    const name = input.name.trim();
    if (!name) throw new Error("organization name required");
    const slug = validateOrganizationSlug(input.slug);
    if ([...this.#organizations.values()].some((organization) => organization.slug === slug)) {
      throw new Error("slug already exists");
    }
    const organization: Organization = {
      id: randomUUID(),
      name,
      slug,
      createdAt: new Date().toISOString(),
    };
    this.#organizations.set(organization.id, organization);
    this.#members.set(organization.id, new Map([[actorId, "owner"]]));
    this.#record(actorId, organization.id, undefined, "organization.created", {
      name: organization.name,
      slug: organization.slug,
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
    const account: StoredAccount = {
      id: randomUUID(),
      email: normalizedEmail,
      platformRole: "creator",
      createdAt: now,
      plan: "free",
      planStatus: "active",
    };
    const name = organizationName.trim();
    if (!name) throw new Error("organization name required");
    const organization: Organization = {
      id: randomUUID(),
      name,
      slug: allocateUniqueSlug(name, (slug) =>
        [...this.#organizations.values()].some((item) => item.slug === slug),
      ),
      createdAt: now,
    };
    this.#accounts.set(account.id, account);
    this.#organizations.set(organization.id, organization);
    this.#members.set(organization.id, new Map([[account.id, "owner"]]));
    this.#record(account.id, organization.id, undefined, "creator.registered", {
      email: normalizedEmail,
    });
    return { account: this.#present(account), organization: structuredClone(organization) };
  }

  assignPlan(
    accountId: string,
    plan: PlanId,
    status: PlanStatus = "active",
    periodEnd?: string,
  ): Account {
    const account = this.#requireAccount(accountId);
    account.plan = plan;
    account.planStatus = status;
    account.planPeriodEnd = periodEnd;
    return this.#present(account);
  }

  createProject(
    actorId: string,
    organizationId: string,
    input: { name: string; slug: string },
  ): Project {
    this.#requireMember(actorId, organizationId);
    const owner = this.#owner(organizationId);
    const limits = limitsFor(this.#plan(owner));
    assertWithinCap(
      this.#ownedProjects(owner.id).length,
      limits.games,
      storedGameLimitMessage(this.#plan(owner)),
    );
    validateProjectSlug(input.slug);
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
    if (!PROJECT_TRANSITIONS[project.state].includes(next)) {
      throw new Error(`invalid project transition ${project.state} -> ${next}`);
    }
    this.#assertTransitionAllowed(project, next);
    const previous = project.state;
    project.state = next;
    project.updatedAt = new Date().toISOString();
    this.#record(actorId, project.organizationId, project.id, "project.state_changed", {
      previous,
      next,
    });
    return structuredClone(project);
  }

  deleteProject(actorId: string, projectId: string): void {
    const project = this.#requireProject(projectId);
    this.#requireMember(actorId, project.organizationId);
    this.#projects.delete(projectId);
    for (const [id, credential] of this.#credentials) {
      if (credential.projectId === projectId) this.#credentials.delete(id);
    }
    this.#record(actorId, project.organizationId, undefined, "project.deleted", {
      projectId,
      name: project.name,
      slug: project.slug,
      state: project.state,
    });
  }

  issueDeploymentCredential(
    actorId: string,
    projectId: string,
    now = Math.floor(Date.now() / 1_000),
  ): { credentialId: string; secret: string; expiresAt: number } {
    const project = this.#requireProject(projectId);
    this.#requireMember(actorId, project.organizationId);
    if (project.state === "suspended") throw new Error("project suspended");
    if (project.state === "inactive") throw new Error(INACTIVE_DEPLOY_MESSAGE);
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
    const project = this.#requireProject(credential.projectId);
    if (project.state === "inactive") throw new Error(INACTIVE_DEPLOY_MESSAGE);
    if (project.state === "suspended") throw new Error("project suspended");
    credential.usedAt = now;
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
    if (project.state === "inactive") throw new InactiveProjectError();
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
    if (project.state === "inactive") throw new Error(INACTIVE_DEPLOY_MESSAGE);
    project.activeDeploymentId = deploymentId;
    if (project.state === "draft") {
      const plan = this.#plan(this.#owner(project.organizationId));
      const next = activationState(plan);
      this.#assertTransitionAllowed(project, next);
      project.state = next;
    }
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
    if (project.state === "inactive") throw new InactiveProjectError();
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

  playableProjectBySlugs(
    organizationSlug: string,
    projectSlug: string,
  ): Pick<Project, "id" | "name" | "slug" | "state" | "activeDeploymentId"> {
    const organization = [...this.#organizations.values()].find(
      (item) => item.slug === organizationSlug.toLowerCase(),
    );
    const project = organization
      ? [...this.#projects.values()].find(
          (item) =>
            item.organizationId === organization.id &&
            item.slug === projectSlug.toLowerCase(),
        )
      : undefined;
    if (!project) throw new Error("project is not playable");
    return this.playableProject(project.id);
  }

  projectPlayPath(projectId: string): string {
    const project = this.#requireProject(projectId);
    const organization = this.#organizations.get(project.organizationId);
    if (!organization) throw new Error("organization not found");
    return playablePath(organization.slug, project.slug);
  }

  auditLog(actorId: string, organizationId: string): AuditRecord[] {
    this.#requireMember(actorId, organizationId);
    return this.#audit
      .filter((record) => record.organizationId === organizationId)
      .map((record) => structuredClone(record));
  }

  billingContact(accountId: string): { email: string; stripeCustomerId?: string } {
    const account = this.#requireAccount(accountId);
    return { email: account.email, stripeCustomerId: this.#stripe.get(accountId)?.customerId };
  }

  applySubscription(update: SubscriptionUpdate): void {
    const account = this.#requireAccount(update.accountId);
    if (update.plan) account.plan = update.plan;
    if (update.status) account.planStatus = update.status;
    if (update.periodEnd) account.planPeriodEnd = update.periodEnd;
    const previous = this.#stripe.get(account.id);
    if (previous?.customerId) this.#customers.delete(previous.customerId);
    if (previous?.subscriptionId) this.#subscriptions.delete(previous.subscriptionId);
    const next: StripeLink = {
      customerId: update.stripeCustomerId ?? previous?.customerId,
      subscriptionId: update.stripeSubscriptionId ?? previous?.subscriptionId,
    };
    this.#stripe.set(account.id, next);
    if (next.customerId) this.#customers.set(next.customerId, account.id);
    if (next.subscriptionId) this.#subscriptions.set(next.subscriptionId, account.id);
  }

  accountIdForStripeCustomer(
    customerId?: string,
    subscriptionId?: string,
  ): string | undefined {
    if (customerId && this.#customers.has(customerId)) return this.#customers.get(customerId);
    if (subscriptionId) return this.#subscriptions.get(subscriptionId);
    return undefined;
  }

  projectRuntimeLimits(projectId: string): {
    plan: PlanId;
    maxPlayersPerRoom: number;
    simultaneousRooms: number;
    serverAuthority: boolean;
    storedBytes: number | null;
  } {
    const project = this.#requireProject(projectId);
    const plan = this.#plan(this.#owner(project.organizationId));
    const limits = limitsFor(plan);
    return {
      plan,
      maxPlayersPerRoom: limits.maxPlayersPerRoom,
      simultaneousRooms: roomQuotaForPlan(plan),
      serverAuthority: limits.serverAuthority,
      storedBytes: limits.storedBytes,
    };
  }

  retainedBytes(_projectId: string): number {
    return this.#retainedBytes;
  }

  /** Test hook. Production bytes come from the deployment rows. */
  setRetainedBytes(bytes: number): void {
    this.#retainedBytes = bytes;
  }

  assertManifestAllowed(
    projectId: string,
    manifest: { multiplayer?: { enabled?: boolean; authority: "host" | "server"; maxPlayers: number } },
  ): void {
    const multiplayer = manifest.multiplayer;
    if (!multiplayer?.enabled) return;
    const plan = this.projectRuntimeLimits(projectId).plan;
    if (multiplayer.authority === "server") assertServerAuthority(plan);
    assertRoomSize(plan, multiplayer.maxPlayers);
  }

  #requireAccount(accountId: string): StoredAccount {
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

  #owner(organizationId: string): StoredAccount {
    const members = this.#members.get(organizationId);
    for (const [accountId, role] of members ?? []) {
      if (role === "owner") return this.#requireAccount(accountId);
    }
    throw new Error("organization owner not found");
  }

  #plan(account: StoredAccount): PlanId {
    return entitledPlan(account.email, this.#billing(account));
  }

  #billing(account: StoredAccount): BillingRecord {
    return {
      plan: account.plan,
      status: account.planStatus,
      periodEnd: account.planPeriodEnd,
    };
  }

  #ownedProjects(ownerId: string): Project[] {
    return [...this.#projects.values()].filter(
      (project) => this.#owner(project.organizationId).id === ownerId,
    );
  }

  #assertTransitionAllowed(project: Project, next: ProjectState): void {
    const owner = this.#owner(project.organizationId);
    const plan = this.#plan(owner);
    const limits = limitsFor(plan);
    if (next === "published") assertPublicCatalog(plan);
    if (consumesPlayLink(project.state, next)) {
      const playable = this.#ownedProjects(owner.id).filter((item) =>
        (PLAYABLE_PROJECT_STATES as readonly string[]).includes(item.state),
      );
      const activeName = playable.find((item) => item.id !== project.id)?.name;
      assertWithinCap(
        playable.length,
        limits.playLinks,
        activeGameLimitMessage(plan, activeName),
      );
    }
  }

  #present(account: StoredAccount): Account {
    const plan = this.#plan(account);
    return {
      id: account.id,
      email: account.email,
      platformRole: account.platformRole,
      createdAt: account.createdAt,
      plan,
      planStatus: account.planStatus,
      planPeriodEnd: account.planPeriodEnd,
      manageBilling: Boolean(this.#stripe.get(account.id)?.customerId),
      limits: limitsFor(plan),
    };
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
