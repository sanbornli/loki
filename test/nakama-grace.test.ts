import assert from "node:assert/strict";
import test from "node:test";

const HOST_AUTHORITY_GRACE_SECONDS = 20;
const MEMBERSHIP_GRACE_SECONDS = 90;

type Member = {
  ordinal: number;
  sessionId: string;
  joinedAt: number;
  team?: number;
};

type Grace = {
  sessionId: string;
  membershipTicks: number;
  authorityTicks: number;
};

type RoomState = {
  hostId: string;
  members: Record<string, Member>;
  membershipRevision: number;
  disconnectGraces: Record<string, Grace>;
  tickRate: number;
  teamSize: number;
  nextJoinOrdinal: number;
  recentActions: Record<string, { status: string; senderId: string; actionId: string }>;
  events: Array<{ type: string; hostId?: string; leaves?: string[]; revision?: number }>;
};

const createState = (tickRate = 1, teamSize = 2): RoomState => ({
  hostId: "",
  members: {},
  membershipRevision: 0,
  disconnectGraces: {},
  tickRate,
  teamSize,
  nextJoinOrdinal: 0,
  recentActions: {},
  events: [],
});

const electHost = (
  members: Record<string, Member>,
  excludeUserId?: string,
  disconnectGraces?: Record<string, Grace>,
): string => {
  const users = Object.keys(members).sort((left, right) => {
    const difference = members[left]!.ordinal - members[right]!.ordinal;
    return difference === 0 ? left.localeCompare(right) : difference;
  });
  let fallback = "";
  for (const userId of users) {
    if (userId === excludeUserId) continue;
    if (disconnectGraces?.[userId]) {
      if (!fallback) fallback = userId;
      continue;
    }
    return userId;
  }
  return fallback;
};

const join = (state: RoomState, userId: string, sessionId = `${userId}-session`): void => {
  delete state.disconnectGraces[userId];
  const existing = state.members[userId];
  if (!existing) {
    const ordinal = state.nextJoinOrdinal;
    state.nextJoinOrdinal += 1;
    state.members[userId] = {
      ordinal,
      sessionId,
      joinedAt: 0,
      team: state.teamSize ? Math.floor(ordinal / state.teamSize) : undefined,
    };
    state.membershipRevision += 1;
  } else {
    existing.sessionId = sessionId;
  }
  if (!state.hostId || !state.members[state.hostId]) state.hostId = userId;
};

const applyLeaves = (state: RoomState, userIds: string[]): void => {
  const previousHostId = state.hostId;
  const leaves: string[] = [];
  for (const userId of userIds) {
    delete state.disconnectGraces[userId];
    if (!state.members[userId]) continue;
    leaves.push(userId);
    delete state.members[userId];
  }
  if (!leaves.length) return;
  state.membershipRevision += 1;
  if (!Object.keys(state.members).length) {
    state.hostId = "";
    state.events.push({ type: "leave", leaves, revision: state.membershipRevision });
    return;
  }
  if (!state.members[state.hostId]) state.hostId = electHost(state.members);
  state.events.push({ type: "leave", leaves, revision: state.membershipRevision });
  if (previousHostId !== state.hostId) {
    state.events.push({ type: "host_changed", hostId: state.hostId });
  }
};

const migrateHostAuthority = (state: RoomState, previousHostId: string): void => {
  if (!state.members[previousHostId] || state.hostId !== previousHostId) return;
  const nextHost = electHost(state.members, previousHostId, state.disconnectGraces);
  if (!nextHost || nextHost === previousHostId) return;
  state.hostId = nextHost;
  state.events.push({ type: "host_changed", hostId: state.hostId, revision: state.membershipRevision });
};

const queueDisconnect = (state: RoomState, userId: string): void => {
  const member = state.members[userId];
  if (!member) return;
  state.disconnectGraces[userId] = {
    sessionId: member.sessionId,
    membershipTicks: Math.max(1, state.tickRate * MEMBERSHIP_GRACE_SECONDS),
    authorityTicks:
      state.hostId === userId ? Math.max(1, state.tickRate * HOST_AUTHORITY_GRACE_SECONDS) : 0,
  };
};

const expireDisconnectGraces = (state: RoomState): void => {
  const expired: string[] = [];
  const migrate: string[] = [];
  for (const [userId, grace] of Object.entries(state.disconnectGraces)) {
    const member = state.members[userId];
    if (!member || member.sessionId !== grace.sessionId) {
      delete state.disconnectGraces[userId];
      continue;
    }
    if (grace.authorityTicks > 0) {
      grace.authorityTicks -= 1;
      if (grace.authorityTicks <= 0 && state.hostId === userId) migrate.push(userId);
    }
    grace.membershipTicks -= 1;
    if (grace.membershipTicks <= 0) expired.push(userId);
  }
  for (const userId of migrate) {
    if (!expired.includes(userId)) migrateHostAuthority(state, userId);
  }
  if (expired.length) applyLeaves(state, expired);
};

const tick = (state: RoomState, times: number): void => {
  for (let index = 0; index < times; index += 1) expireDisconnectGraces(state);
};

const rememberAction = (
  state: RoomState,
  senderId: string,
  actionId: string,
): "applied" | "duplicate" => {
  const key = `${senderId}\u001f${actionId}`;
  if (state.recentActions[key]?.status === "committed") return "duplicate";
  state.recentActions[key] = { status: "committed", senderId, actionId };
  return "applied";
};

test("host return before authority grace does not migrate", () => {
  const state = createState();
  join(state, "host");
  join(state, "member");
  const revision = state.membershipRevision;
  queueDisconnect(state, "host");
  tick(state, HOST_AUTHORITY_GRACE_SECONDS - 1);
  assert.equal(state.hostId, "host");
  assert.ok(state.members.host);
  join(state, "host", "host-session-2");
  tick(state, 5);
  assert.equal(state.hostId, "host");
  assert.equal(state.membershipRevision, revision);
  assert.equal(state.events.filter((event) => event.type === "host_changed").length, 0);
});

test("host absence past authority grace migrates without membership removal", () => {
  const state = createState();
  join(state, "host");
  join(state, "member");
  const revision = state.membershipRevision;
  queueDisconnect(state, "host");
  tick(state, HOST_AUTHORITY_GRACE_SECONDS);
  assert.equal(state.hostId, "member");
  assert.ok(state.members.host);
  assert.ok(state.members.member);
  assert.equal(state.membershipRevision, revision);
  assert.deepEqual(
    state.events.filter((event) => event.type === "leave"),
    [],
  );
  assert.equal(state.events.some((event) => event.type === "host_changed"), true);
});

test("return before membership expiry keeps ordinal, team, and revision", () => {
  const state = createState();
  join(state, "host");
  join(state, "member");
  const member = state.members.member!;
  const revision = state.membershipRevision;
  queueDisconnect(state, "member");
  tick(state, MEMBERSHIP_GRACE_SECONDS - 1);
  join(state, "member", "member-session-2");
  assert.equal(state.members.member?.ordinal, member.ordinal);
  assert.equal(state.members.member?.team, member.team);
  assert.equal(state.membershipRevision, revision);
  assert.equal(state.disconnectGraces.member, undefined);
});

test("membership grace expiry emits one leave and one revision bump", () => {
  const state = createState();
  join(state, "host");
  join(state, "member");
  const revision = state.membershipRevision;
  queueDisconnect(state, "member");
  tick(state, MEMBERSHIP_GRACE_SECONDS);
  assert.equal(state.members.member, undefined);
  assert.equal(state.membershipRevision, revision + 1);
  assert.equal(state.events.filter((event) => event.type === "leave").length, 1);
  tick(state, 10);
  assert.equal(state.events.filter((event) => event.type === "leave").length, 1);
});

test("explicit leave removes the member immediately", () => {
  const state = createState();
  join(state, "host");
  join(state, "member");
  queueDisconnect(state, "member");
  applyLeaves(state, ["member"]);
  assert.equal(state.members.member, undefined);
  assert.equal(state.disconnectGraces.member, undefined);
  assert.equal(state.events[0]?.type, "leave");
});

test("replayed actions are applied at most once", () => {
  const state = createState();
  join(state, "host");
  assert.equal(rememberAction(state, "host", "act_same"), "applied");
  assert.equal(rememberAction(state, "host", "act_same"), "duplicate");
  assert.equal(rememberAction(state, "member", "act_same"), "applied");
});
