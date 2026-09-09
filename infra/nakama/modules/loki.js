// Loki's authoritative Nakama runtime. All project identity, status, limits,
// and room defaults come from server-only storage provisioned with the HTTP key.
var PROTOCOL_VERSION = 1;
var MATCH_NAME = "loki_room";
var TENANT_COLLECTION = "_loki_tenants";
var TENANT_KEY = "membership";
var PROJECT_COLLECTION = "_loki_projects";
var INVITE_COLLECTION = "_loki_invites";
var ROOM_KEY_COLLECTION = "_loki_room_keys";
var DEFAULT_MAX_PLAYERS = 16;
var DEFAULT_TICK_RATE = 5;
var DEFAULT_INVITE_TTL_SECONDS = 900;
var DEFAULT_ROOM_QUOTA = 20;
var MAX_MESSAGE_BYTES = 16384;
var MAX_CHAT_BYTES = 500;
var MESSAGE_RATE_LIMIT = 20;
var CHAT_RATE_LIMIT = 5;
var CHAT_RATE_WINDOW_MS = 10000;
var EMPTY_ROOM_GRACE_SECONDS = 30;
var MAX_RECENT_ACTIONS = 64;
var RECENT_ACTION_TTL_MS = 600000;

var OP_ACTION = 10;
var OP_EVENT = 11;
var OP_HOST_STATE = 12;
var OP_SNAPSHOT = 13;
var OP_CHAT = 14;
var OP_SCORE = 15;
var OP_ACTION_REJECT = 16;

var nowMs = function () {
  return Date.now();
};

var codedError = function (code, message) {
  return Error(code + ": " + message);
};

var parsePayload = function (payload) {
  if (!payload) return {};
  try {
    return JSON.parse(payload);
  } catch (_) {
    throw codedError("INVALID_MESSAGE", "invalid JSON payload");
  }
};

var integerInRange = function (value, minimum, maximum) {
  return (
    typeof value === "number" &&
    isFinite(value) &&
    Math.floor(value) === value &&
    value >= minimum &&
    value <= maximum
  );
};

var validRoomKey = function (value) {
  return typeof value === "string" && /^[a-z0-9-]{1,64}$/.test(value);
};

var allocateRoomKey = function (nk) {
  return nk.uuidv4().replace(/-/g, "");
};

var normalizeInviteCode = function (value) {
  return typeof value === "string" ? value.toUpperCase() : "";
};

var validInviteCode = function (value) {
  return /^[A-F0-9]{16}$/.test(value);
};

var validActionId = function (value) {
  return typeof value === "string" && /^[A-Za-z0-9_-]{8,128}$/.test(value);
};

var validActionReject = function (input) {
  return (
    validActionId(input.actionId) &&
    (input.senderId === undefined ||
      (typeof input.senderId === "string" &&
        input.senderId.length >= 1 &&
        input.senderId.length <= 128)) &&
    (input.outcome === "rejected" || input.outcome === "invalid") &&
    typeof input.message === "string" &&
    input.message.length >= 1 &&
    input.message.length <= 200
  );
};

var ACTION_KEY_SEP = "\x1f";

var actionIdentityKey = function (senderId, actionId) {
  return senderId + ACTION_KEY_SEP + actionId;
};

var parseActionIdentityKey = function (key) {
  var index = key.indexOf(ACTION_KEY_SEP);
  if (index === -1) return { senderId: "", actionId: key, legacy: true };
  return {
    senderId: key.slice(0, index),
    actionId: key.slice(index + 1),
    legacy: false,
  };
};

var pruneExpiredActions = function (state) {
  Object.keys(state.recentActions || {}).forEach(function (key) {
    var entry = state.recentActions[key];
    if (!entry || nowMs() - entry.at > RECENT_ACTION_TTL_MS) {
      delete state.recentActions[key];
    }
  });
};

var findRecentActionMatches = function (state, actionId) {
  pruneExpiredActions(state);
  return Object.keys(state.recentActions || {}).filter(function (key) {
    var parsed = parseActionIdentityKey(key);
    var entry = state.recentActions[key];
    return (
      parsed.actionId === actionId ||
      (entry && entry.actionId === actionId)
    );
  });
};

var resolveRecentAction = function (state, senderId, actionId) {
  if (!validActionId(actionId) || !state.recentActions) {
    return { status: "", entry: null, key: "", ambiguous: false };
  }
  pruneExpiredActions(state);
  if (senderId) {
    var keyed = actionIdentityKey(senderId, actionId);
    if (state.recentActions[keyed]) {
      return {
        status: state.recentActions[keyed].status || "",
        entry: state.recentActions[keyed],
        key: keyed,
        ambiguous: false,
      };
    }
    var legacy = state.recentActions[actionId];
    if (
      legacy &&
      (!legacy.senderId || legacy.senderId === senderId)
    ) {
      return {
        status: legacy.status || "",
        entry: legacy,
        key: actionId,
        ambiguous: false,
      };
    }
    return { status: "", entry: null, key: "", ambiguous: false };
  }
  var matches = findRecentActionMatches(state, actionId);
  if (matches.length > 1) {
    return { status: "", entry: null, key: "", ambiguous: true };
  }
  if (matches.length === 1) {
    var key = matches[0];
    return {
      status: state.recentActions[key].status || "",
      entry: state.recentActions[key],
      key: key,
      ambiguous: false,
    };
  }
  return { status: "", entry: null, key: "", ambiguous: false };
};

var rememberAction = function (state, senderId, actionId, status, details) {
  if (!validActionId(actionId) || !senderId) return;
  if (!state.recentActions) state.recentActions = {};
  details = details || {};
  var resolved = resolveRecentAction(state, senderId, actionId);
  var key = resolved.key || actionIdentityKey(senderId, actionId);
  if (resolved.key && resolved.key !== actionIdentityKey(senderId, actionId)) {
    delete state.recentActions[resolved.key];
    key = actionIdentityKey(senderId, actionId);
  }
  var previous = resolved.entry || {};
  state.recentActions[key] = {
    status: status,
    at: nowMs(),
    hostId: state.hostId,
    senderId: senderId || details.senderId || previous.senderId,
    actionId: actionId,
    outcome: details.outcome || previous.outcome,
    message: details.message || previous.message,
  };
  var ids = Object.keys(state.recentActions);
  if (ids.length <= MAX_RECENT_ACTIONS) return;
  var terminalIds = ids.filter(function (id) {
    return state.recentActions[id].status !== "delivered";
  });
  if (terminalIds.length) ids = terminalIds;
  ids.sort(function (left, right) {
    return state.recentActions[left].at - state.recentActions[right].at;
  });
  delete state.recentActions[ids[0]];
};

var recentActionStatus = function (state, senderId, actionId) {
  return resolveRecentAction(state, senderId, actionId).status;
};

var deliveredActionCount = function (state) {
  pruneExpiredActions(state);
  return Object.keys(state.recentActions || {}).filter(function (key) {
    return state.recentActions[key] && state.recentActions[key].status === "delivered";
  }).length;
};

var runtimeCapabilities = function (state) {
  return {
    synchronized_rooms: true,
    minimumProtocolVersion: PROTOCOL_VERSION,
    limits: {
      maxPlayersPerRoom: state && state.maxPlayers ? state.maxPlayers : DEFAULT_MAX_PLAYERS,
      maxMessageBytes: MAX_MESSAGE_BYTES,
      maxChatBytes: MAX_CHAT_BYTES,
      messagesPerSecond: MESSAGE_RATE_LIMIT,
    },
  };
};

var validLeaderboardId = function (value) {
  return typeof value === "string" && /^[a-z0-9-]{1,64}$/.test(value);
};

var defaultProjectConfig = function (projectId) {
  return {
    projectId: projectId,
    status: "active",
    maxPlayers: DEFAULT_MAX_PLAYERS,
    tickRate: DEFAULT_TICK_RATE,
    visibility: "matchmaking",
    teamSize: 0,
    inviteTtlSeconds: DEFAULT_INVITE_TTL_SECONDS,
    concurrentRoomQuota: DEFAULT_ROOM_QUOTA,
    leaderboardNamespace: "",
  };
};

var validateProjectConfig = function (projectId, input, previous) {
  var config = previous || defaultProjectConfig(projectId);
  var next = {
    projectId: projectId,
    status: input.status === undefined ? config.status : input.status,
    maxPlayers:
      input.maxPlayers === undefined ? config.maxPlayers : input.maxPlayers,
    tickRate: input.tickRate === undefined ? config.tickRate : input.tickRate,
    visibility:
      input.visibility === undefined ? config.visibility : input.visibility,
    teamSize: input.teamSize === undefined ? config.teamSize : input.teamSize,
    inviteTtlSeconds:
      input.inviteTtlSeconds === undefined
        ? config.inviteTtlSeconds
        : input.inviteTtlSeconds,
    concurrentRoomQuota:
      input.concurrentRoomQuota === undefined
        ? config.concurrentRoomQuota
        : input.concurrentRoomQuota,
    leaderboardNamespace: config.leaderboardNamespace || "",
  };
  if (next.status !== "active" && next.status !== "suspended") {
    throw codedError("INVALID_MESSAGE", "status must be active or suspended");
  }
  if (!integerInRange(next.maxPlayers, 1, 16)) {
    throw codedError("INVALID_MESSAGE", "maxPlayers must be between 1 and 16");
  }
  if (!integerInRange(next.tickRate, 1, 10)) {
    throw codedError("INVALID_MESSAGE", "tickRate must be between 1 and 10");
  }
  if (
    next.visibility !== "private" &&
    next.visibility !== "unlisted" &&
    next.visibility !== "matchmaking"
  ) {
    throw codedError("INVALID_MESSAGE", "invalid visibility");
  }
  if (!integerInRange(next.teamSize, 0, 16)) {
    throw codedError("INVALID_MESSAGE", "teamSize must be between 0 and 16");
  }
  if (next.teamSize && next.maxPlayers % next.teamSize !== 0) {
    throw codedError("INVALID_MESSAGE", "teamSize must divide maxPlayers");
  }
  if (!integerInRange(next.inviteTtlSeconds, 30, 86400)) {
    throw codedError("INVALID_MESSAGE", "inviteTtlSeconds must be between 30 and 86400");
  }
  if (!integerInRange(next.concurrentRoomQuota, 1, 100)) {
    throw codedError("INVALID_MESSAGE", "concurrentRoomQuota must be between 1 and 100");
  }
  return next;
};

var readProjectConfig = function (nk, projectId) {
  var objects = nk.storageRead([
    { collection: PROJECT_COLLECTION, key: projectId },
  ]);
  if (!objects || objects.length !== 1 || !objects[0].value) {
    throw codedError("FORBIDDEN", "project not configured");
  }
  return validateProjectConfig(projectId, {}, objects[0].value);
};

var requireActiveProject = function (nk, projectId) {
  var config = readProjectConfig(nk, projectId);
  if (config.status !== "active") {
    throw codedError("PROJECT_SUSPENDED", "project suspended");
  }
  return config;
};

var tenantForUser = function (nk, userId, requireActive) {
  var objects = nk.storageRead([
    { collection: TENANT_COLLECTION, key: TENANT_KEY, userId: userId },
  ]);
  if (!objects || objects.length !== 1) {
    throw codedError("FORBIDDEN", "project not activated");
  }
  var projectId = objects[0].value && objects[0].value.projectId;
  if (!projectId || typeof projectId !== "string") {
    throw codedError("FORBIDDEN", "invalid tenant mapping");
  }
  if (requireActive !== false) requireActiveProject(nk, projectId);
  return projectId;
};

var rpcProvisionTenant = function (ctx, logger, nk, payload) {
  if (ctx.userId) {
    throw codedError("FORBIDDEN", "server authentication required");
  }
  var input = parsePayload(payload);
  if (typeof input.userId !== "string" || typeof input.projectId !== "string") {
    throw codedError("INVALID_MESSAGE", "userId and projectId are required");
  }

  var existingObjects = nk.storageRead([
    { collection: PROJECT_COLLECTION, key: input.projectId },
  ]);
  var existing =
    existingObjects && existingObjects.length === 1
      ? existingObjects[0].value
      : null;
  var hasConfig =
    input.status !== undefined ||
    input.maxPlayers !== undefined ||
    input.tickRate !== undefined ||
    input.visibility !== undefined ||
    input.teamSize !== undefined ||
    input.inviteTtlSeconds !== undefined ||
    input.concurrentRoomQuota !== undefined;
  var config = hasConfig || !existing
    ? validateProjectConfig(input.projectId, input, existing)
    : validateProjectConfig(input.projectId, {}, existing);
  if (!config.leaderboardNamespace) config.leaderboardNamespace = nk.uuidv4();

  nk.storageWrite([
    {
      collection: TENANT_COLLECTION,
      key: TENANT_KEY,
      userId: input.userId,
      value: { projectId: input.projectId },
      permissionRead: 0,
      permissionWrite: 0,
    },
    {
      collection: PROJECT_COLLECTION,
      key: input.projectId,
      value: config,
      permissionRead: 0,
      permissionWrite: 0,
    },
  ]);
  logger.info("Provisioned Loki tenant %s for user %s", input.projectId, input.userId);
  return JSON.stringify({
    ok: true,
    code: "OK",
    userId: input.userId,
    projectId: input.projectId,
    status: config.status,
    config: publicProjectConfig(config),
  });
};

var publicProjectConfig = function (config) {
  return {
    status: config.status,
    maxPlayers: config.maxPlayers,
    tickRate: config.tickRate,
    visibility: config.visibility,
    teamSize: config.teamSize,
    inviteTtlSeconds: config.inviteTtlSeconds,
    concurrentRoomQuota: config.concurrentRoomQuota,
  };
};

var rpcTenant = function (ctx, logger, nk) {
  if (!ctx.userId) throw codedError("UNAUTHORIZED", "authentication required");
  var projectId = tenantForUser(nk, ctx.userId);
  var config = requireActiveProject(nk, projectId);
  return JSON.stringify({
    projectId: projectId,
    userId: ctx.userId,
    status: config.status,
    config: publicProjectConfig(config),
  });
};

var activeRoomCount = function (nk, projectId, quota) {
  var escapedProjectId = projectId.replace(/([+\-=&|>])/g, "\\$1");
  var matches = nk.matchList(
    quota,
    true,
    "",
    0,
    DEFAULT_MAX_PLAYERS,
    "+label.projectId:" + escapedProjectId,
  );
  return matches ? matches.length : 0;
};

var findRoomByKey = function (nk, projectId, roomKey) {
  var records = nk.storageRead([
    { collection: ROOM_KEY_COLLECTION, key: projectId + ":" + roomKey },
  ]);
  return records && records.length === 1 && records[0].value
    ? records[0].value
    : null;
};

var indexRoomKey = function (nk, projectId, roomKey, matchId) {
  nk.storageWrite([
    {
      collection: ROOM_KEY_COLLECTION,
      key: projectId + ":" + roomKey,
      value: { matchId: matchId, projectId: projectId, roomKey: roomKey },
      version: "*",
      permissionRead: 0,
      permissionWrite: 0,
    },
  ]);
};

var releaseRoomKey = function (nk, state) {
  var records = nk.storageRead([
    {
      collection: ROOM_KEY_COLLECTION,
      key: state.projectId + ":" + state.roomKey,
    },
  ]);
  if (
    records &&
    records.length === 1 &&
    records[0].value &&
    records[0].value.matchId === state.roomId
  ) {
    nk.storageDelete([
      {
        collection: ROOM_KEY_COLLECTION,
        key: state.projectId + ":" + state.roomKey,
        version: records[0].version,
      },
    ]);
  }
};

var createInvite = function (nk, matchId, projectId, ttlSeconds) {
  var expiresAt = nowMs() + ttlSeconds * 1000;
  for (var attempt = 0; attempt < 8; attempt += 1) {
    var inviteCode = nk.uuidv4().replace(/-/g, "").slice(0, 16).toUpperCase();
    try {
      nk.storageWrite([
        {
          collection: INVITE_COLLECTION,
          key: inviteCode,
          value: {
            matchId: matchId,
            projectId: projectId,
            expiresAt: expiresAt,
          },
          version: "*",
          permissionRead: 0,
          permissionWrite: 0,
        },
      ]);
      return { inviteCode: inviteCode, expiresAt: expiresAt };
    } catch (error) {
      if (attempt === 7) throw error;
    }
  }
  throw codedError("SERVICE_UNAVAILABLE", "invite allocation failed");
};

var roomParams = function (projectId, roomKey, creatorId, config, source) {
  return {
    projectId: projectId,
    roomKey: roomKey,
    creatorId: creatorId || "",
    maxPlayers: config.maxPlayers,
    tickRate: config.tickRate,
    visibility: source === "matchmaking" ? "matchmaking" : config.visibility,
    teamSize: config.teamSize,
    source: source,
  };
};

var rpcCreateRoom = function (ctx, logger, nk, payload) {
  if (!ctx.userId) throw codedError("UNAUTHORIZED", "authentication required");
  parsePayload(payload);
  var projectId = tenantForUser(nk, ctx.userId);
  var config = requireActiveProject(nk, projectId);
  if (activeRoomCount(nk, projectId, config.concurrentRoomQuota) >= config.concurrentRoomQuota) {
    throw codedError("QUOTA_EXCEEDED", "concurrent room quota exceeded");
  }
  var roomKey = "";
  var matchId = "";
  var params = null;
  var indexed = false;
  for (var attempt = 0; attempt < 8; attempt += 1) {
    roomKey = allocateRoomKey(nk);
    if (findRoomByKey(nk, projectId, roomKey)) continue;
    params = roomParams(projectId, roomKey, ctx.userId, config, "rpc");
    matchId = nk.matchCreate(MATCH_NAME, params);
    try {
      indexRoomKey(nk, projectId, roomKey, matchId);
      indexed = true;
      break;
    } catch (_) {
      // A generated-key collision is retried with a new opaque identifier.
    }
  }
  if (!indexed || !params) {
    throw codedError("SERVICE_UNAVAILABLE", "room allocation failed");
  }
  var invite = createInvite(nk, matchId, projectId, config.inviteTtlSeconds);
  return JSON.stringify({
    ok: true,
    code: "OK",
    matchId: matchId,
    projectId: projectId,
    roomKey: roomKey,
    inviteCode: invite.inviteCode,
    inviteExpiresAt: invite.expiresAt,
    maxPlayers: params.maxPlayers,
    tickRate: params.tickRate,
    visibility: params.visibility,
    teamSize: params.teamSize || undefined,
  });
};

var readInvite = function (nk, inviteCode) {
  var objects = nk.storageRead([
    { collection: INVITE_COLLECTION, key: inviteCode },
  ]);
  if (!objects || objects.length !== 1 || !objects[0].value) {
    throw codedError("INVITE_INVALID", "invite not found");
  }
  var invite = objects[0].value;
  if (!integerInRange(invite.expiresAt, 0, 9007199254740991) || invite.expiresAt <= nowMs()) {
    try {
      nk.storageDelete([
        { collection: INVITE_COLLECTION, key: inviteCode },
      ]);
    } catch (_) {
      // Expiry is enforced even if best-effort cleanup races another resolver.
    }
    throw codedError("INVITE_EXPIRED", "invite expired");
  }
  return invite;
};

var rpcJoinRoom = function (ctx, logger, nk, payload) {
  if (!ctx.userId) throw codedError("UNAUTHORIZED", "authentication required");
  var input = parsePayload(payload);
  var inviteCode = normalizeInviteCode(input.inviteCode);
  if (!validInviteCode(inviteCode)) {
    throw codedError("INVITE_INVALID", "invalid invite code");
  }
  var invite = readInvite(nk, inviteCode);
  var projectId = tenantForUser(nk, ctx.userId);
  if (invite.projectId !== projectId) {
    throw codedError("TENANT_MISMATCH", "tenant mismatch");
  }
  requireActiveProject(nk, projectId);
  return JSON.stringify({
    ok: true,
    code: "OK",
    matchId: invite.matchId,
    projectId: projectId,
    inviteCode: inviteCode,
    expiresAt: invite.expiresAt,
  });
};

var rpcResolveInvite = function (ctx, logger, nk, payload) {
  if (!ctx.userId) throw codedError("UNAUTHORIZED", "authentication required");
  var input = parsePayload(payload);
  var inviteCode = normalizeInviteCode(input.inviteCode);
  if (!validInviteCode(inviteCode)) {
    throw codedError("INVITE_INVALID", "invalid invite code");
  }
  var invite = readInvite(nk, inviteCode);
  var projectId = tenantForUser(nk, ctx.userId);
  if (invite.projectId !== projectId) {
    throw codedError("TENANT_MISMATCH", "tenant mismatch");
  }
  requireActiveProject(nk, projectId);
  return JSON.stringify({
    ok: true,
    code: "OK",
    matchId: invite.matchId,
    inviteCode: inviteCode,
    expiresAt: invite.expiresAt,
  });
};

var signalRoom = function (ctx, nk, payload, operation) {
  if (!ctx.userId) throw codedError("UNAUTHORIZED", "authentication required");
  var input = parsePayload(payload);
  if (typeof input.matchId !== "string") {
    throw codedError("INVALID_MESSAGE", "matchId is required");
  }
  var projectId = tenantForUser(nk, ctx.userId);
  return nk.matchSignal(
    input.matchId,
    JSON.stringify({
      operation: operation,
      projectId: projectId,
      actorId: ctx.userId,
      expectedVersion: input.expectedVersion,
      state: input.state,
    }),
  );
};

var rpcRoomSnapshot = function (ctx, logger, nk, payload) {
  return signalRoom(ctx, nk, payload, "snapshot");
};

var rpcRoomUpdate = function (ctx, logger, nk, payload) {
  return signalRoom(ctx, nk, payload, "update");
};

var beforeMatchmakerAdd = function (ctx, logger, nk, envelope) {
  if (!ctx.userId) throw codedError("UNAUTHORIZED", "authentication required");
  var projectId = tenantForUser(nk, ctx.userId);
  var config = requireActiveProject(nk, projectId);
  if (config.visibility !== "matchmaking") {
    throw codedError("FORBIDDEN", "project matchmaking is disabled");
  }
  envelope.matchmakerAdd.stringProperties =
    envelope.matchmakerAdd.stringProperties || {};
  envelope.matchmakerAdd.numericProperties =
    envelope.matchmakerAdd.numericProperties || {};
  envelope.matchmakerAdd.stringProperties.projectId = projectId;
  envelope.matchmakerAdd.stringProperties.lokiConfig = JSON.stringify(config);
  envelope.matchmakerAdd.numericProperties.teamSize = config.teamSize;
  envelope.matchmakerAdd.query = "+properties.projectId:" + projectId;
  return envelope;
};

var matchedProperty = function (entry, name) {
  if (!entry) return undefined;
  if (entry.properties && entry.properties[name] !== undefined) return entry.properties[name];
  if (entry.stringProperties && entry.stringProperties[name] !== undefined) {
    return entry.stringProperties[name];
  }
  if (entry.numericProperties && entry.numericProperties[name] !== undefined) {
    return entry.numericProperties[name];
  }
  return undefined;
};

var matchmakerMatched = function (ctx, logger, nk, matches) {
  if (!matches || !matches.length) {
    throw codedError("INVALID_MESSAGE", "empty matchmaker result");
  }
  var projectId = matchedProperty(matches[0], "projectId");
  if (typeof projectId !== "string") {
    throw codedError("FORBIDDEN", "trusted matchmaking properties missing");
  }
  for (var index = 1; index < matches.length; index += 1) {
    if (matchedProperty(matches[index], "projectId") !== projectId) {
      throw codedError("TENANT_MISMATCH", "matchmaker crossed tenant boundary");
    }
  }
  var config = requireActiveProject(nk, projectId);
  if (activeRoomCount(nk, projectId, config.concurrentRoomQuota) >= config.concurrentRoomQuota) {
    throw codedError("QUOTA_EXCEEDED", "concurrent room quota exceeded");
  }
  return nk.matchCreate(
    MATCH_NAME,
    roomParams(projectId, "match-" + nk.uuidv4().slice(0, 8), "", config, "matchmaking"),
  );
};

var orderedMemberIds = function (members) {
  var userIds = Object.keys(members);
  userIds.sort(function (left, right) {
    var difference = members[left].ordinal - members[right].ordinal;
    return difference === 0 ? left.localeCompare(right) : difference;
  });
  return userIds;
};

var electHost = function (members) {
  var users = orderedMemberIds(members);
  return users.length ? users[0] : "";
};

var memberPresence = function (userId, member, hostId) {
  var result = {
    playerId: userId,
    sessionId: member.sessionId,
    joinedAt: member.joinedAt,
    host: userId === hostId,
  };
  if (integerInRange(member.team, 0, DEFAULT_MAX_PLAYERS)) {
    result.team = member.team;
  }
  return result;
};

var presenceList = function (members, hostId) {
  return orderedMemberIds(members).map(function (userId) {
    return memberPresence(userId, members[userId], hostId);
  });
};

var memberTarget = function (userId, member) {
  return {
    userId: userId,
    sessionId: member.sessionId,
    username: member.username,
    node: member.node,
  };
};

var hostPresences = function (state) {
  var member = state.members[state.hostId];
  if (!member) return null;
  return [memberTarget(state.hostId, member)];
};

var acknowledgeState = function (dispatcher, state, opCode, actionId, senderId, presences) {
  broadcastEnvelope(
    dispatcher,
    state,
    opCode,
    "state",
    {
      hostId: state.hostId,
      state: state.sharedState,
      stateVersion: state.version,
      actionId: validActionId(actionId) ? actionId : undefined,
      senderId: senderId || undefined,
    },
    presences || null,
    null,
    true,
  );
};

var nextServerSequence = function (state) {
  var sequence = state.sequence;
  state.sequence += 1;
  return sequence;
};

var envelope = function (state, type, fields) {
  var result = {
    protocolVersion: PROTOCOL_VERSION,
    roomId: state.roomId,
    sequence: nextServerSequence(state),
    type: type,
  };
  Object.keys(fields || {}).forEach(function (key) {
    if (fields[key] !== undefined) result[key] = fields[key];
  });
  return result;
};

var broadcastEnvelope = function (
  dispatcher,
  state,
  opCode,
  type,
  fields,
  presences,
  sender,
  reliable
) {
  dispatcher.broadcastMessage(
    opCode,
    JSON.stringify(envelope(state, type, fields)),
    presences || null,
    sender || null,
    reliable !== false,
  );
};

var snapshotFields = function (state, actionId, senderId) {
  return {
    hostId: state.hostId,
    state: state.sharedState,
    stateVersion: state.version,
    actionId: validActionId(actionId) ? actionId : undefined,
    senderId: senderId || undefined,
    members: presenceList(state.members, state.hostId),
    capabilities: runtimeCapabilities(state),
  };
};

var hasSharedState = function (state) {
  return Boolean(
    state.sharedState &&
      typeof state.sharedState === "object" &&
      Object.keys(state.sharedState).length,
  );
};

// Host-authority clients often send the last snapshot sequence they saw,
// which can drift ahead of the stored version after presence envelopes.
// Accept that newer token, but still reject a true rollback.
var applyHostState = function (state, expectedVersion, nextState, expectedStateVersion) {
  if (integerInRange(expectedStateVersion, 0, 9007199254740991)) {
    if (expectedStateVersion !== state.version) return false;
    state.sharedState = nextState;
    state.version += 1;
    return true;
  }
  if (!integerInRange(expectedVersion, 0, 9007199254740991)) return false;
  if (expectedVersion < state.version) return false;
  state.sharedState = nextState;
  if (state.sequence <= expectedVersion) state.sequence = expectedVersion + 1;
  if (state.sequence <= state.version) state.sequence = state.version + 1;
  state.version = state.sequence;
  return true;
};

var legacySnapshot = function (state) {
  return {
    type: "snapshot",
    projectId: state.projectId,
    roomKey: state.roomKey,
    hostId: state.hostId,
    version: state.version,
    state: state.sharedState,
    members: orderedMemberIds(state.members),
  };
};

var updateLabel = function (dispatcher, state) {
  dispatcher.matchLabelUpdate(JSON.stringify({
    projectId: state.projectId,
    roomKey: state.roomKey,
    playerCount: Object.keys(state.members).length,
    maxPlayers: state.maxPlayers,
    tickRate: state.tickRate,
    visibility: state.visibility,
    teamSize: state.teamSize,
  }));
};

var matchInit = function (ctx, logger, nk, params) {
  if (!params || !params.projectId || !params.roomKey) {
    throw codedError("FORBIDDEN", "trusted room parameters required");
  }
  var config = requireActiveProject(nk, params.projectId);
  var maxPlayers = integerInRange(params.maxPlayers, 1, 16)
    ? params.maxPlayers
    : config.maxPlayers;
  var tickRate = integerInRange(params.tickRate, 1, 10)
    ? params.tickRate
    : config.tickRate;
  var teamSize = integerInRange(params.teamSize, 0, maxPlayers)
    ? params.teamSize
    : config.teamSize;
  return {
    state: {
      roomId: ctx.matchId || "",
      projectId: params.projectId,
      roomKey: params.roomKey,
      maxPlayers: maxPlayers,
      tickRate: tickRate,
      visibility: params.visibility || config.visibility,
      teamSize: teamSize,
      hostId: "",
      version: 0,
      sequence: 0,
      sharedState: {},
      nextJoinOrdinal: 0,
      members: {},
      rateLimits: {},
      joinSyncs: [],
      recentActions: {},
      emptyTicks: 0,
      lastStatusCheckTick: -1,
    },
    tickRate: tickRate,
    label: JSON.stringify({
      projectId: params.projectId,
      roomKey: params.roomKey,
      playerCount: 0,
      maxPlayers: maxPlayers,
      tickRate: tickRate,
      visibility: params.visibility || config.visibility,
      teamSize: teamSize,
    }),
  };
};

var matchJoinAttempt = function (ctx, logger, nk, dispatcher, tick, state, presence) {
  var accepted = false;
  var reason = "TENANT_MISMATCH: tenant mismatch";
  try {
    accepted = tenantForUser(nk, presence.userId) === state.projectId;
    if (accepted && !state.members[presence.userId] &&
        Object.keys(state.members).length >= state.maxPlayers) {
      accepted = false;
      reason = "ROOM_FULL: room full";
    }
  } catch (error) {
    reason = String(error && error.message ? error.message : error);
  }
  return {
    state: state,
    accept: accepted,
    rejectMessage: accepted ? undefined : reason,
  };
};

var matchJoin = function (ctx, logger, nk, dispatcher, tick, state, presences) {
  var joins = [];
  var roomAlreadyOccupied = Object.keys(state.members).length > 0;
  for (var index = 0; index < presences.length; index += 1) {
    var presence = presences[index];
    var member = state.members[presence.userId];
    if (!member) {
      var ordinal = state.nextJoinOrdinal++;
      member = {
        ordinal: ordinal,
        sessionId: presence.sessionId,
        joinedAt: nowMs(),
        team: state.teamSize ? Math.floor(ordinal / state.teamSize) : undefined,
        lastSequence: -1,
        username: presence.username,
        node: presence.node || presence.nodeId,
      };
      state.members[presence.userId] = member;
    } else {
      member.sessionId = presence.sessionId;
      member.username = presence.username;
      member.node = presence.node || presence.nodeId;
    }
    if (!state.hostId || !state.members[state.hostId]) {
      state.hostId = presence.userId;
    }
    joins.push(memberPresence(presence.userId, member, state.hostId));
    if (roomAlreadyOccupied || index > 0) {
      state.joinSyncs.push({
        presence: presence,
        ticks: 2,
        attempts: 3,
      });
    }
  }

  // Legacy snapshots keep the existing SDK and Phase 0 tests compatible.
  dispatcher.broadcastMessage(
    2,
    JSON.stringify(legacySnapshot(state)),
    presences,
    null,
    true,
  );
  broadcastEnvelope(
    dispatcher,
    state,
    OP_SNAPSHOT,
    "snapshot",
    snapshotFields(state),
    presences,
    null,
    true,
  );
  broadcastEnvelope(
    dispatcher,
    state,
    OP_SNAPSHOT,
    "presence",
    {
      joins: joins,
      leaves: [],
      members: presenceList(state.members, state.hostId),
    },
    null,
    null,
    true,
  );
  updateLabel(dispatcher, state);
  return { state: state };
};

var matchLeave = function (ctx, logger, nk, dispatcher, tick, state, presences) {
  var previousHostId = state.hostId;
  var leaves = [];
  for (var index = 0; index < presences.length; index += 1) {
    var presence = presences[index];
    var member = state.members[presence.userId];
    // Ignore a delayed leave from the socket which a reconnect replaced.
    if (member && member.sessionId === presence.sessionId) {
      leaves.push(memberPresence(presence.userId, member, state.hostId));
      delete state.members[presence.userId];
      delete state.rateLimits[presence.userId];
    }
  }
  if (!Object.keys(state.members).length) {
    state.hostId = "";
    state.emptyTicks = 0;
    updateLabel(dispatcher, state);
    return { state: state };
  }
  if (!state.members[state.hostId]) state.hostId = electHost(state.members);

  broadcastEnvelope(
    dispatcher,
    state,
    OP_SNAPSHOT,
    "presence",
    {
      joins: [],
      leaves: leaves,
      members: presenceList(state.members, state.hostId),
    },
    null,
    null,
    true,
  );
  if (previousHostId !== state.hostId) {
    broadcastEnvelope(
      dispatcher,
      state,
      OP_SNAPSHOT,
      "host_changed",
      {
        previousHostId: previousHostId || undefined,
        hostId: state.hostId,
        stateVersion: state.version,
      },
      null,
      null,
      true,
    );
    // Repeat the same leave set after host migration. Remaining clients that
    // only apply presence once they are host still see who disconnected.
    broadcastEnvelope(
      dispatcher,
      state,
      OP_SNAPSHOT,
      "presence",
      {
        joins: [],
        leaves: leaves,
        members: presenceList(state.members, state.hostId),
      },
      null,
      null,
      true,
    );
  }
  updateLabel(dispatcher, state);
  return { state: state };
};

var rateLimit = function (state, userId, kind, timestamp) {
  var limits = state.rateLimits[userId];
  if (!limits) {
    limits = {
      messageStartedAt: timestamp,
      messageCount: 0,
      chatStartedAt: timestamp,
      chatCount: 0,
    };
    state.rateLimits[userId] = limits;
  }
  var windowMs = kind === "chat" ? CHAT_RATE_WINDOW_MS : 1000;
  var startedKey = kind + "StartedAt";
  var countKey = kind + "Count";
  if (timestamp - limits[startedKey] >= windowMs) {
    limits[startedKey] = timestamp;
    limits[countKey] = 0;
  }
  limits[countKey] += 1;
  var maximum = kind === "chat" ? CHAT_RATE_LIMIT : MESSAGE_RATE_LIMIT;
  if (limits[countKey] > maximum) {
    return Math.max(1, windowMs - (timestamp - limits[startedKey]));
  }
  return 0;
};

var sendProtocolError = function (
  dispatcher,
  state,
  opCode,
  presence,
  code,
  message,
  retryAfterMs,
  actionId,
  actionOutcome,
  senderId
) {
  broadcastEnvelope(
    dispatcher,
    state,
    opCode,
    "error",
    {
      code: code,
      message:
        typeof message === "string" && message.length > 200
          ? message.slice(0, 200)
          : message,
      retryAfterMs: retryAfterMs,
      actionId: validActionId(actionId) ? actionId : undefined,
      senderId: senderId || undefined,
      actionOutcome:
        actionOutcome === "rejected" || actionOutcome === "invalid"
          ? actionOutcome
          : undefined,
    },
    [presence],
    null,
    true,
  );
};

var validClientEnvelope = function (state, message, input, expectedType) {
  return (
    input &&
    input.protocolVersion === PROTOCOL_VERSION &&
    input.roomId === state.roomId &&
    integerInRange(input.sequence, 0, 9007199254740991) &&
    input.type === expectedType &&
    message.sender &&
    state.members[message.sender.userId] &&
    state.members[message.sender.userId].sessionId === message.sender.sessionId
  );
};

var leaderboardName = function (nk, projectId, leaderboardId) {
  // The random server-only namespace prevents clients from bypassing these RPCs
  // with Nakama's generic leaderboard read endpoint.
  var config = requireActiveProject(nk, projectId);
  return "loki." + config.leaderboardNamespace + "." + leaderboardId;
};

var writeScore = function (nk, projectId, actorId, username, input) {
  if (!validLeaderboardId(input.leaderboardId)) {
    throw codedError("INVALID_MESSAGE", "invalid leaderboardId");
  }
  if (!integerInRange(input.score, -9007199254740991, 9007199254740991)) {
    throw codedError("INVALID_MESSAGE", "score must be a safe integer");
  }
  var subscore = input.subscore === undefined ? 0 : input.subscore;
  if (!integerInRange(subscore, -9007199254740991, 9007199254740991)) {
    throw codedError("INVALID_MESSAGE", "subscore must be a safe integer");
  }
  var internalId = leaderboardName(nk, projectId, input.leaderboardId);
  nk.leaderboardCreate(internalId, true, "desc", "best", "", {});
  // ownerId is always the authenticated actor; client-supplied identity fields
  // are deliberately ignored.
  return nk.leaderboardRecordWrite(
    internalId,
    actorId,
    username || "",
    input.score,
    subscore,
    {},
  );
};

var processRealtimeMessage = function (logger, nk, dispatcher, state, message) {
  // Nakama exposes int64 opcodes as numeric wrapper values in the JS runtime.
  var opCode = parseInt(String(message.opCode), 10);
  var expectedTypes = {};
  expectedTypes[OP_ACTION] = "action";
  expectedTypes[OP_EVENT] = "event";
  expectedTypes[OP_HOST_STATE] = "host_state";
  expectedTypes[OP_SNAPSHOT] = "snapshot_request";
  expectedTypes[OP_CHAT] = "chat";
  expectedTypes[OP_SCORE] = "score_submit";
  expectedTypes[OP_ACTION_REJECT] = "action_reject";
  var expectedType = expectedTypes[opCode];
  if (!expectedType || !message.sender) return;

  var raw =
    typeof message.data === "string"
      ? message.data
      : nk.binaryToString(message.data);
  if (raw.length > MAX_MESSAGE_BYTES) {
    sendProtocolError(
      dispatcher,
      state,
      opCode,
      message.sender,
      "INVALID_MESSAGE",
      "message exceeds maximum size",
    );
    return;
  }

  var input;
  try {
    input = parsePayload(raw);
  } catch (_) {
    sendProtocolError(
      dispatcher,
      state,
      opCode,
      message.sender,
      "INVALID_MESSAGE",
      "invalid JSON payload",
    );
    return;
  }
  if (input.protocolVersion !== PROTOCOL_VERSION) {
    sendProtocolError(
      dispatcher,
      state,
      opCode,
      message.sender,
      "UNSUPPORTED_VERSION",
      "protocol version 1 required",
    );
    return;
  }
  if (!validClientEnvelope(state, message, input, expectedType)) {
    sendProtocolError(
      dispatcher,
      state,
      opCode,
      message.sender,
      "INVALID_MESSAGE",
      "invalid protocol envelope",
    );
    return;
  }

  try {
    if (tenantForUser(nk, message.sender.userId) !== state.projectId) {
      sendProtocolError(
        dispatcher,
        state,
        opCode,
        message.sender,
        "TENANT_MISMATCH",
        "tenant mismatch",
      );
      return;
    }
  } catch (error) {
    var suspended = String(error).indexOf("PROJECT_SUSPENDED") !== -1;
    sendProtocolError(
      dispatcher,
      state,
      opCode,
      message.sender,
      suspended ? "PROJECT_SUSPENDED" : "FORBIDDEN",
      suspended ? "project suspended" : "project not activated",
    );
    return;
  }

  var member = state.members[message.sender.userId];
  if (input.sequence <= member.lastSequence) {
    sendProtocolError(
      dispatcher,
      state,
      opCode,
      message.sender,
      "INVALID_MESSAGE",
      "sequence must increase",
    );
    return;
  }
  member.lastSequence = input.sequence;

  var retryAfterMs =
    opCode === OP_ACTION_REJECT
      ? 0
      : rateLimit(state, message.sender.userId, "message", nowMs());
  if (retryAfterMs) {
    sendProtocolError(
      dispatcher,
      state,
      opCode,
      message.sender,
      "RATE_LIMITED",
      "message rate exceeded",
      retryAfterMs,
      input.actionId,
    );
    return;
  }

  if (opCode === OP_ACTION) {
    var actionSenderId = message.sender.userId;
    var actionLookup = resolveRecentAction(state, actionSenderId, input.actionId);
    var actionStatus = actionLookup.status;
    if (validActionId(input.actionId) && actionStatus === "committed") {
      acknowledgeState(
        dispatcher,
        state,
        OP_HOST_STATE,
        input.actionId,
        actionSenderId,
        [message.sender],
      );
      return;
    }
    if (validActionId(input.actionId) && actionStatus === "rejected") {
      var rejected = actionLookup.entry || {};
      sendProtocolError(
        dispatcher,
        state,
        OP_ACTION,
        message.sender,
        "INVALID_MESSAGE",
        rejected.message || "action rejected",
        undefined,
        input.actionId,
        rejected.outcome === "invalid" ? "invalid" : "rejected",
        actionSenderId,
      );
      return;
    }
    if (validActionId(input.actionId) && actionStatus === "delivered") {
      var delivered = actionLookup.entry;
      if (delivered && delivered.hostId === state.hostId) {
        sendProtocolError(
          dispatcher,
          state,
          OP_ACTION,
          message.sender,
          "INVALID_MESSAGE",
          "duplicate action",
          undefined,
          input.actionId,
          undefined,
          actionSenderId,
        );
        return;
      }
    }
    if (
      validActionId(input.actionId) &&
      !actionStatus &&
      deliveredActionCount(state) >= MAX_RECENT_ACTIONS
    ) {
      sendProtocolError(
        dispatcher,
        state,
        OP_ACTION,
        message.sender,
        "RATE_LIMITED",
        "host action queue is full",
        1,
        input.actionId,
        undefined,
        actionSenderId,
      );
      return;
    }
    if (validActionId(input.actionId)) {
      rememberAction(state, actionSenderId, input.actionId, "delivered");
    }
    var targets = hostPresences(state);
    if (!targets) {
      sendProtocolError(
        dispatcher,
        state,
        OP_ACTION,
        message.sender,
        "HOST_REQUIRED",
        "host required",
        undefined,
        input.actionId,
        undefined,
        actionSenderId,
      );
      return;
    }
    broadcastEnvelope(
      dispatcher,
      state,
      OP_ACTION,
      "action",
      {
        senderId: actionSenderId,
        payload: input.payload,
        actionId: validActionId(input.actionId) ? input.actionId : undefined,
      },
      targets,
      null,
      true,
    );
    return;
  }
  if (opCode === OP_EVENT) {
    broadcastEnvelope(
      dispatcher,
      state,
      OP_EVENT,
      "event",
      {
        senderId: message.sender.userId,
        reliable: input.reliable !== false,
        payload: input.payload,
      },
      null,
      null,
      input.reliable !== false,
    );
    return;
  }
  if (opCode === OP_HOST_STATE) {
    var hostActionSender =
      typeof input.senderId === "string" && input.senderId.length
        ? input.senderId
        : "";
    var hostActionLookup = validActionId(input.actionId)
      ? resolveRecentAction(state, hostActionSender, input.actionId)
      : { status: "", entry: null, key: "", ambiguous: false };
    if (validActionId(input.actionId) && !hostActionSender) {
      if (hostActionLookup.ambiguous) {
        sendProtocolError(
          dispatcher,
          state,
          OP_HOST_STATE,
          message.sender,
          "INVALID_MESSAGE",
          "ambiguous action identity",
          undefined,
          input.actionId,
        );
        return;
      }
      hostActionSender =
        (hostActionLookup.entry && hostActionLookup.entry.senderId) ||
        message.sender.userId;
    }
    if (message.sender.userId !== state.hostId) {
      sendProtocolError(
        dispatcher,
        state,
        OP_HOST_STATE,
        message.sender,
        "HOST_REQUIRED",
        "host required",
        undefined,
        input.actionId,
        undefined,
        hostActionSender,
      );
      return;
    }
    if (validActionId(input.actionId) && hostActionLookup.status === "committed") {
      acknowledgeState(
        dispatcher,
        state,
        OP_HOST_STATE,
        input.actionId,
        hostActionSender,
        [message.sender],
      );
      return;
    }
    if (validActionId(input.actionId) && hostActionLookup.status === "rejected") {
      sendProtocolError(
        dispatcher,
        state,
        OP_HOST_STATE,
        message.sender,
        "INVALID_MESSAGE",
        "action already rejected",
        undefined,
        input.actionId,
        "rejected",
        hostActionSender,
      );
      return;
    }
    if (
      !applyHostState(
        state,
        input.expectedVersion,
        input.state,
        input.expectedStateVersion,
      )
    ) {
      sendProtocolError(
        dispatcher,
        state,
        OP_HOST_STATE,
        message.sender,
        "STALE_VERSION",
        "stale version",
        undefined,
        input.actionId,
        undefined,
        hostActionSender,
      );
      return;
    }
    if (validActionId(input.actionId) && hostActionSender) {
      rememberAction(state, hostActionSender, input.actionId, "committed");
    }
    broadcastEnvelope(
      dispatcher,
      state,
      OP_HOST_STATE,
      "state",
      {
        hostId: state.hostId,
        state: state.sharedState,
        stateVersion: state.version,
        actionId: validActionId(input.actionId) ? input.actionId : undefined,
        senderId: hostActionSender || undefined,
      },
      null,
      null,
      true,
    );
    return;
  }
  if (opCode === OP_ACTION_REJECT) {
    if (!validActionReject(input)) {
      sendProtocolError(
        dispatcher,
        state,
        OP_ACTION_REJECT,
        message.sender,
        "INVALID_MESSAGE",
        "invalid action rejection",
      );
      return;
    }
    if (message.sender.userId !== state.hostId) {
      sendProtocolError(
        dispatcher,
        state,
        OP_ACTION_REJECT,
        message.sender,
        "HOST_REQUIRED",
        "host required",
        undefined,
        input.actionId,
        undefined,
        input.senderId,
      );
      return;
    }
    var rejectSenderId =
      typeof input.senderId === "string" && input.senderId.length
        ? input.senderId
        : "";
    var rejectLookup = resolveRecentAction(state, rejectSenderId, input.actionId);
    if (rejectLookup.ambiguous) {
      sendProtocolError(
        dispatcher,
        state,
        OP_ACTION_REJECT,
        message.sender,
        "INVALID_MESSAGE",
        "ambiguous action identity",
        undefined,
        input.actionId,
      );
      return;
    }
    var rejectedAction = rejectLookup.entry;
    if (!rejectedAction || rejectedAction.status !== "delivered") {
      sendProtocolError(
        dispatcher,
        state,
        OP_ACTION_REJECT,
        message.sender,
        "INVALID_MESSAGE",
        "action is not pending",
        undefined,
        input.actionId,
        undefined,
        rejectSenderId || undefined,
      );
      return;
    }
    rejectSenderId = rejectedAction.senderId || rejectSenderId;
    rememberAction(state, rejectSenderId, input.actionId, "rejected", {
      senderId: rejectSenderId,
      outcome: input.outcome,
      message: input.message,
    });
    var rejectedMember = state.members[rejectSenderId];
    if (rejectedMember) {
      sendProtocolError(
        dispatcher,
        state,
        OP_ACTION,
        memberTarget(rejectSenderId, rejectedMember),
        "INVALID_MESSAGE",
        input.message,
        undefined,
        input.actionId,
        input.outcome,
        rejectSenderId,
      );
    }
    return;
  }
  if (opCode === OP_SNAPSHOT) {
    broadcastEnvelope(
      dispatcher,
      state,
      OP_SNAPSHOT,
      "snapshot",
      snapshotFields(state),
      [message.sender],
      null,
      true,
    );
    return;
  }
  if (opCode === OP_CHAT) {
    if (
      (input.channel !== "lobby" && input.channel !== "match") ||
      typeof input.text !== "string" ||
      !input.text.trim() ||
      input.text.length > MAX_CHAT_BYTES
    ) {
      sendProtocolError(
        dispatcher,
        state,
        OP_CHAT,
        message.sender,
        "INVALID_MESSAGE",
        "invalid chat message",
      );
      return;
    }
    retryAfterMs = rateLimit(state, message.sender.userId, "chat", nowMs());
    if (retryAfterMs) {
      sendProtocolError(
        dispatcher,
        state,
        OP_CHAT,
        message.sender,
        "RATE_LIMITED",
        "chat rate exceeded",
        retryAfterMs,
      );
      return;
    }
    broadcastEnvelope(
      dispatcher,
      state,
      OP_CHAT,
      "chat",
      {
        channel: input.channel,
        messageId: nk.uuidv4(),
        senderId: message.sender.userId,
        text: input.text.trim(),
        sentAt: nowMs(),
      },
      null,
      message.sender,
      true,
    );
    return;
  }
  if (opCode === OP_SCORE) {
    try {
      var record = writeScore(
        nk,
        state.projectId,
        message.sender.userId,
        message.sender.username,
        input,
      );
      broadcastEnvelope(
        dispatcher,
        state,
        OP_SCORE,
        "leaderboard",
        {
          leaderboardId: input.leaderboardId,
          records: [{
            playerId: message.sender.userId,
            score: record.score,
            subscore: record.subscore,
            rank: record.rank || 1,
          }],
        },
        [message.sender],
        null,
        true,
      );
    } catch (error) {
      sendProtocolError(
        dispatcher,
        state,
        OP_SCORE,
        message.sender,
        "INVALID_MESSAGE",
        String(error && error.message ? error.message : error).slice(0, 200),
      );
    }
  }
};

var matchLoop = function (ctx, logger, nk, dispatcher, tick, state, messages) {
  // A project suspension terminates active rooms on the next authoritative tick.
  try {
    requireActiveProject(nk, state.projectId);
  } catch (error) {
    broadcastEnvelope(
      dispatcher,
      state,
      OP_SNAPSHOT,
      "room_closed",
      { reason: "suspended" },
      null,
      null,
      true,
    );
    releaseRoomKey(nk, state);
    return null;
  }

  if (!Object.keys(state.members).length) {
    state.emptyTicks += 1;
    if (state.emptyTicks >= state.tickRate * EMPTY_ROOM_GRACE_SECONDS) {
      releaseRoomKey(nk, state);
      return null;
    }
    return { state: state };
  }
  state.emptyTicks = 0;
  for (var index = 0; messages && index < messages.length; index += 1) {
    processRealtimeMessage(logger, nk, dispatcher, state, messages[index]);
  }
  for (var syncIndex = state.joinSyncs.length - 1; syncIndex >= 0; syncIndex -= 1) {
    var sync = state.joinSyncs[syncIndex];
    var syncedMember = state.members[sync.presence.userId];
    if (!syncedMember || syncedMember.sessionId !== sync.presence.sessionId) {
      state.joinSyncs.splice(syncIndex, 1);
      continue;
    }
    sync.ticks -= 1;
    if (sync.ticks > 0) continue;
    broadcastEnvelope(
      dispatcher,
      state,
      OP_SNAPSHOT,
      "snapshot",
      snapshotFields(state),
      [sync.presence],
      null,
      true,
    );
    if (hasSharedState(state)) {
      broadcastEnvelope(
        dispatcher,
        state,
        OP_HOST_STATE,
        "state",
        {
          hostId: state.hostId,
          state: state.sharedState,
          stateVersion: state.version,
        },
        [sync.presence],
        null,
        true,
      );
    }
    if (sync.attempts === 3) {
      broadcastEnvelope(
        dispatcher,
        state,
        OP_SNAPSHOT,
        "presence",
        {
          joins: [],
          leaves: [],
          members: presenceList(state.members, state.hostId),
        },
        null,
        null,
        true,
      );
    }
    sync.attempts -= 1;
    if (sync.attempts > 0) {
      sync.ticks = 2;
    } else {
      state.joinSyncs.splice(syncIndex, 1);
    }
  }
  return { state: state };
};

var matchTerminate = function (ctx, logger, nk, dispatcher, tick, state, graceSeconds) {
  if (Object.keys(state.members).length) {
    broadcastEnvelope(
      dispatcher,
      state,
      OP_SNAPSHOT,
      "room_closed",
      { reason: "shutdown" },
      null,
      null,
      true,
    );
  }
  releaseRoomKey(nk, state);
  return { state: state };
};

var matchSignal = function (ctx, logger, nk, dispatcher, tick, state, data) {
  var signal = parsePayload(data);
  try {
    requireActiveProject(nk, state.projectId);
  } catch (_) {
    return {
      state: state,
      data: JSON.stringify({ ok: false, error: "project suspended" }),
    };
  }
  if (signal.projectId !== state.projectId) {
    return {
      state: state,
      data: JSON.stringify({ ok: false, error: "tenant mismatch" }),
    };
  }
  if (signal.operation === "update") {
    if (signal.actorId !== state.hostId) {
      return {
        state: state,
        data: JSON.stringify({ ok: false, error: "host required" }),
      };
    }
    if (signal.expectedVersion !== state.version) {
      return {
        state: state,
        data: JSON.stringify({ ok: false, error: "stale version" }),
      };
    }
    state.sharedState = signal.state;
    state.version += 1;
    dispatcher.broadcastMessage(
      1,
      JSON.stringify({
        type: "state",
        projectId: state.projectId,
        roomKey: state.roomKey,
        hostId: state.hostId,
        version: state.version,
        state: state.sharedState,
      }),
      null,
      null,
      true,
    );
    broadcastEnvelope(
      dispatcher,
      state,
      OP_HOST_STATE,
      "state",
      {
        hostId: state.hostId,
        state: state.sharedState,
        stateVersion: state.version,
      },
      null,
      null,
      true,
    );
  }
  return {
    state: state,
    data: JSON.stringify({
      ok: true,
      projectId: state.projectId,
      roomKey: state.roomKey,
      hostId: state.hostId,
      version: state.version,
      stateVersion: state.version,
      state: state.sharedState,
      members: orderedMemberIds(state.members),
      capabilities: runtimeCapabilities(state),
    }),
  };
};

var rpcLeaderboardSubmit = function (ctx, logger, nk, payload) {
  if (!ctx.userId) throw codedError("UNAUTHORIZED", "authentication required");
  var input = parsePayload(payload);
  var projectId = tenantForUser(nk, ctx.userId);
  var record = writeScore(nk, projectId, ctx.userId, ctx.username, input);
  return JSON.stringify({
    ok: true,
    code: "OK",
    leaderboardId: input.leaderboardId,
    record: {
      playerId: ctx.userId,
      score: record.score,
      subscore: record.subscore,
      rank: record.rank || 1,
    },
  });
};

var rpcLeaderboardList = function (ctx, logger, nk, payload) {
  if (!ctx.userId) throw codedError("UNAUTHORIZED", "authentication required");
  var input = parsePayload(payload);
  if (!validLeaderboardId(input.leaderboardId)) {
    throw codedError("INVALID_MESSAGE", "invalid leaderboardId");
  }
  var limit = input.limit === undefined ? 20 : input.limit;
  if (!integerInRange(limit, 1, 100)) {
    throw codedError("INVALID_MESSAGE", "limit must be between 1 and 100");
  }
  var projectId = tenantForUser(nk, ctx.userId);
  var result = nk.leaderboardRecordsList(
    leaderboardName(nk, projectId, input.leaderboardId),
    [],
    limit,
    input.cursor || null,
  );
  var records = (result.records || []).map(function (record) {
    return {
      playerId: record.ownerId,
      score: record.score,
      subscore: record.subscore,
      rank: record.rank,
    };
  });
  return JSON.stringify({
    ok: true,
    code: "OK",
    leaderboardId: input.leaderboardId,
    records: records,
    nextCursor: result.nextCursor || undefined,
  });
};

var InitModule = function (ctx, logger, nk, initializer) {
  initializer.registerRpc("loki_provision_tenant", rpcProvisionTenant);
  initializer.registerRpc("loki_tenant", rpcTenant);
  initializer.registerRpc("loki_create_room", rpcCreateRoom);
  initializer.registerRpc("loki_join_room", rpcJoinRoom);
  initializer.registerRpc("loki_resolve_invite", rpcResolveInvite);
  initializer.registerRpc("loki_room_snapshot", rpcRoomSnapshot);
  initializer.registerRpc("loki_room_update", rpcRoomUpdate);
  initializer.registerRpc("loki_leaderboard_submit", rpcLeaderboardSubmit);
  initializer.registerRpc("loki_leaderboard_list", rpcLeaderboardList);
  initializer.registerRtBefore("MatchmakerAdd", beforeMatchmakerAdd);
  initializer.registerMatchmakerMatched(matchmakerMatched);
  initializer.registerMatch(MATCH_NAME, {
    matchInit: matchInit,
    matchJoinAttempt: matchJoinAttempt,
    matchJoin: matchJoin,
    matchLeave: matchLeave,
    matchLoop: matchLoop,
    matchTerminate: matchTerminate,
    matchSignal: matchSignal,
  });
  logger.info("Loki protocol-v1 authoritative runtime loaded");
};
