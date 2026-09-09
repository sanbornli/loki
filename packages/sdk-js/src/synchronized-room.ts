import {
  actionIdentityKey,
  canonicalJson,
  PROTOCOL_VERSION,
  type Presence,
  type ServerEnvelope,
} from "../../protocol/src/index.js";

type JoinedRoom = {
  roomId: string;
  inviteCode: string;
  snapshot: ServerEnvelope;
};

export const SYNCHRONIZED_ROOM_MAX_MESSAGE_BYTES = 16_384;
export const SYNCHRONIZED_ROOM_MAX_PENDING = 32;
export const SYNCHRONIZED_ROOM_MAX_RECENT_ACTIONS = 64;
export const SYNCHRONIZED_ROOM_ACTION_TTL_MS = 600_000;
export const SYNCHRONIZED_ROOM_MAX_REDUCER_MS = 50;
export const SYNCHRONIZED_ROOM_COMMIT_TIMEOUT_MS = 10_000;

export type ConnectionState =
  | "idle"
  | "joining"
  | "connected"
  | "reconnecting"
  | "resynchronizing"
  | "leaving"
  | "leave_failed"
  | "closed"
  | "failed";

export type SynchronizedRoomOutcome =
  | "committed"
  | "rejected"
  | "duplicate"
  | "invalid"
  | "rate_limited"
  | "state_conflict"
  | "authority_changed"
  | "room_closed"
  | "indeterminate";

export class SynchronizedRoomError extends Error {
  constructor(
    readonly outcome: SynchronizedRoomOutcome,
    message: string,
  ) {
    super(message);
    this.name = "SynchronizedRoomError";
  }
}

export type RoomMember = {
  playerId: string;
  sessionId: string;
  joinedAt: number;
  team?: number;
  host: boolean;
};

export type ActionContext = {
  actionId: string;
  senderId: string;
  hostId: string;
  members: readonly RoomMember[];
};

export type Schema<T> = {
  parse(value: unknown): T;
};

export type SynchronizedRoomSnapshot<State> = {
  roomId: string;
  inviteCode: string;
  playerId: string;
  hostId: string;
  members: RoomMember[];
  state: State;
  stateVersion: number;
  connection: ConnectionState;
  lastError?: SynchronizedRoomError;
};

export type CommittedTransition<State, Action> = {
  actionId: string;
  action: Action;
  senderId: string;
  previousState: State;
  state: State;
  stateVersion: number;
};

export type SynchronizedRoomOptions<State, Action> = {
  initialState: State;
  reduce(
    state: State,
    action: Action,
    context: ActionContext,
  ): State;
  stateSchema?: Schema<State>;
  actionSchema?: Schema<Action>;
};

export type ConnectionEvent = "disconnected" | "connected" | "reconnect_failed";

export interface SynchronizedRoomHost {
  playerId(): string | undefined;
  sendAction(payload: unknown, options?: { actionId?: string }): Promise<void>;
  sendHostState(
    expectedVersion: number,
    state: unknown,
    options?: { actionId?: string; expectedStateVersion?: number; senderId?: string },
  ): Promise<void>;
  sendActionRejection(
    actionId: string,
    outcome: "rejected" | "invalid",
    message: string,
    options?: { senderId?: string },
  ): Promise<void>;
  requestSnapshot(): Promise<void>;
  createRoom(): Promise<JoinedRoom>;
  joinRoom(input: { inviteCode: string }): Promise<JoinedRoom>;
  leaveRoom(roomId?: string): Promise<void>;
  reconnect(): Promise<void>;
  close?(): Promise<void>;
  onMessage(listener: (message: ServerEnvelope) => void): () => void;
  onConnection?(listener: (event: ConnectionEvent) => void): () => void;
}

type Pending<Action> = {
  actionId: string;
  action: Action;
  senderId: string;
  epoch: number;
  resolve: (snapshot: SynchronizedRoomSnapshot<unknown>) => void;
  reject: (error: SynchronizedRoomError) => void;
};

type Queued<Action> = {
  actionId: string;
  action: Action;
  senderId: string;
  epoch: number;
};

type Prepared<State, Action> = {
  identity: string;
  item: Queued<Action>;
  next: State;
  expectedVersion: number;
};

type CommitResult = "committed" | "aborted" | "timeout";

type CommitWaiter = {
  resolve: (result: CommitResult) => void;
};

const ACTION_ID = /^[A-Za-z0-9_-]{8,128}$/;

const cloneJson = <T>(value: T): T => {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
};

const createActionId = (): string => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `act_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
};

const asMembers = (list: Presence[], hostId: string): RoomMember[] =>
  list.map((member) => ({
    playerId: member.playerId,
    sessionId: member.sessionId,
    joinedAt: member.joinedAt,
    team: member.team,
    host: member.playerId === hostId || member.host,
  }));

const mergeMembers = (
  current: RoomMember[],
  message: Extract<ServerEnvelope, { type: "presence" }>,
  hostId: string,
): RoomMember[] => {
  const byId = new Map(current.map((member) => [member.playerId, member]));
  for (const leave of message.leaves) byId.delete(leave.playerId);
  for (const join of message.joins) {
    byId.set(join.playerId, {
      playerId: join.playerId,
      sessionId: join.sessionId,
      joinedAt: join.joinedAt,
      team: join.team,
      host: join.playerId === hostId || join.host,
    });
  }
  if (message.members.length) {
    return asMembers(message.members, hostId);
  }
  return [...byId.values()].map((member) => ({
    ...member,
    host: member.playerId === hostId,
  }));
};

const outcomeFromError = (
  code: string,
  message: string,
  actionOutcome?: "rejected" | "invalid",
): SynchronizedRoomOutcome => {
  if (actionOutcome) return actionOutcome;
  if (code === "STALE_VERSION") return "state_conflict";
  if (code === "HOST_REQUIRED") return "authority_changed";
  if (code === "RATE_LIMITED") return "rate_limited";
  if (code === "ROOM_NOT_FOUND") return "room_closed";
  if (message.includes("duplicate action")) return "duplicate";
  if (code === "INVALID_MESSAGE") return "invalid";
  return "rejected";
};

const assertJsonCompatible = (value: unknown): void => {
  canonicalJson(value);
};

const isEmptyObject = (value: unknown): boolean =>
  Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.keys(value as object).length === 0,
  );

const isUncommittedEmptyState = (message: ServerEnvelope): boolean =>
  (message.type === "snapshot" || message.type === "state") &&
  (message.stateVersion === undefined || message.stateVersion === 0) &&
  isEmptyObject(message.state);

const protocolRejectionMessage = (message: string): string => {
  const text = message.trim() || "action rejected";
  return text.length > 200 ? text.slice(0, 200) : text;
};

const serializedBytes = (value: unknown): number =>
  new TextEncoder().encode(JSON.stringify(value)).length;

const monotonicNow = (): number =>
  typeof performance !== "undefined" ? performance.now() : Date.now();

export class SynchronizedRoom<State, Action> {
  readonly #host: SynchronizedRoomHost;
  readonly #options: SynchronizedRoomOptions<State, Action>;
  readonly #listeners = new Set<(snapshot: SynchronizedRoomSnapshot<State>) => void>();
  readonly #committed = new Set<(result: CommittedTransition<State, Action>) => void>();
  readonly #pending = new Map<string, Pending<Action>>();
  readonly #inflight = new Map<string, Queued<Action>>();
  readonly #recent = new Map<string, number>();
  readonly #queue: Queued<Action>[] = [];
  readonly #waiters = new Map<string, CommitWaiter[]>();
  readonly #commitTimers = new Map<string, ReturnType<typeof setTimeout>>();
  readonly #prepared = new Map<string, Prepared<State, Action>>();
  #unsubscribe?: () => void;
  #unsubscribeConnection?: () => void;
  #playerId = "";
  #roomId = "";
  #inviteCode = "";
  #hostId = "";
  #members: RoomMember[] = [];
  #state: State;
  #stateVersion = 0;
  #connection: ConnectionState = "idle";
  #lastError?: SynchronizedRoomError;
  #epoch = 0;
  #generation = 0;
  #processing = false;
  #resyncing = false;
  #explicitReconnect = false;
  #previousState: State;

  constructor(host: SynchronizedRoomHost, options: SynchronizedRoomOptions<State, Action>) {
    this.#host = host;
    this.#options = options;
    this.#state = this.#parseState(options.initialState);
    assertJsonCompatible(this.#state);
    this.#previousState = this.#state;
  }

  get isHost(): boolean {
    return Boolean(this.#playerId) && this.#playerId === this.#hostId;
  }

  get members(): RoomMember[] {
    return this.#members.map((member) => ({ ...member }));
  }

  getSnapshot(): SynchronizedRoomSnapshot<State> {
    return {
      roomId: this.#roomId,
      inviteCode: this.#inviteCode,
      playerId: this.#playerId,
      hostId: this.#hostId,
      members: this.members,
      state: cloneJson(this.#state),
      stateVersion: this.#stateVersion,
      connection: this.#connection,
      lastError: this.#lastError,
    };
  }

  subscribe(listener: (snapshot: SynchronizedRoomSnapshot<State>) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  onCommitted(listener: (result: CommittedTransition<State, Action>) => void): () => void {
    this.#committed.add(listener);
    return () => this.#committed.delete(listener);
  }

  async create(): Promise<SynchronizedRoomSnapshot<State>> {
    return this.#enter(() => this.#host.createRoom(), { bootstrap: true });
  }

  async join(input: { inviteCode: string }): Promise<SynchronizedRoomSnapshot<State>> {
    return this.#enter(() => this.#host.joinRoom(input), { bootstrap: false });
  }

  async dispatch(action: Action): Promise<SynchronizedRoomSnapshot<State>> {
    if (
      this.#connection !== "connected" &&
      this.#connection !== "resynchronizing"
    ) {
      throw new SynchronizedRoomError("rejected", "room is not connected");
    }
    if (this.#pending.size >= SYNCHRONIZED_ROOM_MAX_PENDING) {
      throw new SynchronizedRoomError("rejected", "pending queue is full");
    }
    const parsed = this.#parseAction(action);
    assertJsonCompatible(parsed);
    const actionId = createActionId();
    if (
      serializedBytes({ type: "action", actionId, payload: parsed }) >
      SYNCHRONIZED_ROOM_MAX_MESSAGE_BYTES
    ) {
      throw new SynchronizedRoomError("invalid", "action exceeds maximum size");
    }
    const senderId = this.#requirePlayerId();
    return new Promise((resolve, reject) => {
      this.#pending.set(actionId, {
        actionId,
        action: parsed,
        senderId,
        epoch: this.#epoch,
        resolve: resolve as Pending<Action>["resolve"],
        reject,
      });
      this.#armCommitTimeout(actionId);
      void this.#submit(actionId, parsed, senderId).catch((error) => {
        this.#failPending(
          actionId,
          error instanceof SynchronizedRoomError
            ? error
            : new SynchronizedRoomError("indeterminate", String(error)),
        );
      });
    });
  }

  async leave(): Promise<void> {
    this.#generation += 1;
    this.#setConnection("leaving");
    this.#epoch += 1;
    this.#rejectAll("room_closed", "room left");
    this.#queue.length = 0;
    this.#inflight.clear();
    this.#prepared.clear();
    this.#clearAllCommitTimeouts();
    this.#releaseWaiters();
    const roomId = this.#roomId;
    try {
      await this.#host.leaveRoom(roomId || undefined);
      this.#clearIdentity();
      this.#unbind();
      this.#setConnection("closed");
    } catch (error) {
      this.#setConnection("leave_failed");
      throw error;
    }
  }

  async close(): Promise<void> {
    this.#generation += 1;
    this.#epoch += 1;
    this.#rejectAll("room_closed", "room closed");
    this.#queue.length = 0;
    this.#inflight.clear();
    this.#prepared.clear();
    this.#clearAllCommitTimeouts();
    this.#releaseWaiters();
    const roomId = this.#roomId;
    this.#clearIdentity();
    this.#unbind();
    this.#setConnection("closed");
    try {
      await this.#host.leaveRoom(roomId || undefined);
    } catch {
      // close() may abandon an unresolved leave.
    }
  }

  async reconnect(): Promise<void> {
    if (this.#isTerminal()) {
      throw new SynchronizedRoomError("rejected", "cannot reconnect from a terminal state");
    }
    this.#explicitReconnect = true;
    this.#bind();
    this.#setConnection("reconnecting");
    this.#epoch += 1;
    this.#resyncing = true;
    this.#queue.length = 0;
    this.#releaseWaiters();
    this.#refreshPendingTimers();
    try {
      await this.#host.reconnect();
      if (
        this.#resyncing &&
        (this.#connection === "reconnecting" ||
          this.#connection === "resynchronizing")
      ) {
        this.#setConnection("resynchronizing");
      }
    } catch (error) {
      this.#failRoom(
        "indeterminate",
        error instanceof Error ? error.message : "reconnect failed",
      );
      throw error;
    } finally {
      this.#explicitReconnect = false;
    }
  }

  #requirePlayerId(): string {
    const playerId = this.#playerId || this.#host.playerId();
    if (!playerId) throw new SynchronizedRoomError("rejected", "authenticate before dispatching");
    this.#playerId = playerId;
    return playerId;
  }

  async #enter(
    join: () => Promise<JoinedRoom>,
    options: { bootstrap: boolean },
  ): Promise<SynchronizedRoomSnapshot<State>> {
    if (this.#connection === "leave_failed") {
      throw new SynchronizedRoomError("rejected", "resolve the failed leave before joining");
    }
    const generation = ++this.#generation;
    this.#epoch += 1;
    this.#queue.length = 0;
    this.#inflight.clear();
    this.#prepared.clear();
    this.#recent.clear();
    this.#clearAllCommitTimeouts();
    if (this.#pending.size) this.#rejectAll("rejected", "entering a new room");
    this.#releaseWaiters();
    this.#resyncing = false;
    this.#setConnection("joining");
    let joinedRoomId = "";
    try {
      this.#bind();
      this.#playerId = this.#requirePlayerId();
      const joined = await join();
      joinedRoomId = joined.roomId;
      if (generation !== this.#generation) {
        await this.#host.leaveRoom(joined.roomId).catch(() => undefined);
        throw new SynchronizedRoomError("rejected", "join superseded");
      }
      this.#requireCapabilities(joined.snapshot);
      this.#roomId = joined.roomId;
      this.#inviteCode = joined.inviteCode;
      this.#applyAuthoritative(joined.snapshot, true, {
        preserveLocalState: options.bootstrap,
        generation,
      });
      this.#throwIfFailed("invalid join snapshot");
      if (generation !== this.#generation) {
        await this.#host.leaveRoom(joined.roomId).catch(() => undefined);
        throw new SynchronizedRoomError("rejected", "join superseded");
      }
      if (options.bootstrap && this.isHost) {
        await this.#bootstrapInitialState();
      }
      if (generation !== this.#generation) {
        await this.#host.leaveRoom(joined.roomId).catch(() => undefined);
        throw new SynchronizedRoomError("rejected", "join superseded");
      }
      this.#throwIfFailed("failed to enter room");
      this.#setConnection("connected");
      return this.getSnapshot();
    } catch (error) {
      this.#queue.length = 0;
      this.#inflight.clear();
      this.#prepared.clear();
      this.#clearAllCommitTimeouts();
      this.#rejectAll(
        error instanceof SynchronizedRoomError ? error.outcome : "rejected",
        error instanceof Error ? error.message : "failed to enter room",
      );
      this.#releaseWaiters();
      this.#unbind();
      if (joinedRoomId) {
        await this.#host.leaveRoom(joinedRoomId).catch(() => undefined);
      }
      if (generation === this.#generation) {
        this.#clearIdentity();
        this.#setConnection("failed");
      }
      throw error;
    }
  }

  async #bootstrapInitialState(): Promise<void> {
    const initial = this.#parseState(this.#options.initialState);
    assertJsonCompatible(initial);
    if (
      serializedBytes({
        type: "host_state",
        expectedStateVersion: 0,
        state: initial,
      }) > SYNCHRONIZED_ROOM_MAX_MESSAGE_BYTES
    ) {
      throw new SynchronizedRoomError("invalid", "state exceeds maximum size");
    }
    if (this.#stateVersion !== 0) return;
    this.#state = initial;
    const actionId = createActionId();
    const confirmation = this.#awaitCommit(actionId);
    await this.#host.sendHostState(0, initial, {
      actionId,
      expectedStateVersion: 0,
      senderId: this.#playerId,
    });
    const result = await confirmation;
    if (result !== "committed") {
      throw new SynchronizedRoomError(
        "indeterminate",
        result === "timeout"
          ? "authoritative confirmation timed out"
          : "initial state was not confirmed",
      );
    }
  }

  #bind(): void {
    if (this.#unsubscribe) return;
    this.#unsubscribe = this.#host.onMessage((message) => this.#onMessage(message));
    this.#unsubscribeConnection = this.#host.onConnection?.((event) => {
      if (this.#isInactive()) return;
      if (event === "reconnect_failed") {
        this.#failRoom("indeterminate", "reconnect failed");
        return;
      }
      if (event === "disconnected") {
        this.#epoch += 1;
        this.#resyncing = true;
        this.#queue.length = 0;
        this.#releaseWaiters();
        this.#refreshPendingTimers();
        this.#setConnection("reconnecting");
        return;
      }
      if (this.#connection === "reconnecting" || this.#connection === "resynchronizing") {
        this.#setConnection("resynchronizing");
        if (this.#explicitReconnect) return;
        void this.#host.requestSnapshot().catch((error) => {
          this.#failRoom(
            "indeterminate",
            error instanceof Error ? error.message : "snapshot request failed",
          );
        });
      }
    });
  }

  #unbind(): void {
    this.#unsubscribe?.();
    this.#unsubscribe = undefined;
    this.#unsubscribeConnection?.();
    this.#unsubscribeConnection = undefined;
  }

  async #submit(actionId: string, action: Action, senderId: string): Promise<void> {
    if (this.isHost) {
      this.#enqueue({ actionId, action, senderId, epoch: this.#epoch });
      this.#scheduleDrain();
      return;
    }
    await this.#host.sendAction(action, { actionId });
  }

  #scheduleDrain(): void {
    void this.#drain().catch(() => undefined);
  }

  async #drain(): Promise<void> {
    if (this.#processing || this.#resyncing) return;
    this.#processing = true;
    try {
      while (this.#queue.length && this.isHost && this.#connection === "connected") {
        const item = this.#queue.shift();
        if (!item) break;
        if (item.epoch !== this.#epoch) continue;
        const identity = this.#identity(item.senderId, item.actionId);
        if (this.#seen(item.senderId, item.actionId)) {
          this.#inflight.delete(identity);
          this.#succeed(item.actionId, item.senderId);
          continue;
        }
        const prepared = this.#prepared.get(identity);
        let next: State;
        if (prepared) {
          next = prepared.next;
        } else {
          const previous = this.#state;
          try {
            const startedAt = monotonicNow();
            const reduced = this.#options.reduce(
              cloneJson(previous),
              cloneJson(item.action),
              {
                actionId: item.actionId,
                senderId: item.senderId,
                hostId: this.#hostId,
                members: this.members,
              },
            );
            if (
              reduced &&
              typeof reduced === "object" &&
              "then" in (reduced as object)
            ) {
              throw new Error("reducer must be synchronous");
            }
            if (monotonicNow() - startedAt > SYNCHRONIZED_ROOM_MAX_REDUCER_MS) {
              throw new Error("reducer exceeded execution budget");
            }
            next = this.#parseState(reduced);
            assertJsonCompatible(next);
          } catch (error) {
            await this.#rejectQueued(
              item,
              "rejected",
              error instanceof Error ? error.message : "reducer rejected the action",
            );
            continue;
          }
          this.#prepared.set(identity, {
            identity,
            item,
            next,
            expectedVersion: this.#stateVersion,
          });
        }
        const envelopeBytes = serializedBytes({
          type: "host_state",
          expectedStateVersion: this.#stateVersion,
          actionId: item.actionId,
          senderId: item.senderId,
          state: next,
        });
        if (envelopeBytes > SYNCHRONIZED_ROOM_MAX_MESSAGE_BYTES) {
          this.#prepared.delete(identity);
          await this.#rejectQueued(item, "invalid", "state exceeds maximum size");
          continue;
        }
        try {
          const confirmation = this.#awaitCommit(item.actionId);
          await this.#host.sendHostState(this.#stateVersion, next, {
            actionId: item.actionId,
            expectedStateVersion: this.#stateVersion,
            senderId: item.senderId,
          });
          if (this.#resyncing || this.#connection !== "connected") {
            this.#releaseWaiters(item.actionId);
            continue;
          }
          const result = await confirmation;
          if (result === "timeout") {
            this.#failPending(
              item.actionId,
              new SynchronizedRoomError(
                "indeterminate",
                "authoritative confirmation timed out",
              ),
            );
            continue;
          }
          if (
            result === "aborted" ||
            this.#resyncing ||
            this.#connection !== "connected"
          ) {
            continue;
          }
        } catch (error) {
          if (this.#resyncing || this.#connection !== "connected") continue;
          this.#failPending(
            item.actionId,
            error instanceof SynchronizedRoomError
              ? error
              : new SynchronizedRoomError(
                  "indeterminate",
                  error instanceof Error ? error.message : "state commit failed",
                ),
          );
        }
      }
    } finally {
      this.#processing = false;
      if (
        this.#queue.length &&
        !this.#resyncing &&
        this.isHost &&
        this.#connection === "connected"
      ) {
        this.#scheduleDrain();
      }
    }
  }

  #onMessage(message: ServerEnvelope): void {
    if (this.#isInactive() && message.type !== "room_closed") return;
    if (this.#roomId && message.roomId !== this.#roomId) return;
    if (message.type === "snapshot" || message.type === "state") {
      this.#applyAuthoritative(message, message.type === "snapshot");
      return;
    }
    if (message.type === "action") {
      if (!this.isHost || !message.actionId) return;
      const pending = this.#pending.get(message.actionId);
      const action = pending?.action ?? this.#tryParseAction(message.payload);
      if (action === undefined) {
        this.#rejectRemote(message.actionId, "invalid", "invalid action", message.senderId);
        return;
      }
      this.#enqueue({
        actionId: message.actionId,
        action,
        senderId: message.senderId,
        epoch: this.#epoch,
      });
      this.#scheduleDrain();
      return;
    }
    if (message.type === "presence") {
      this.#hostId = message.members.find((member) => member.host)?.playerId || this.#hostId;
      this.#members = mergeMembers(this.#members, message, this.#hostId);
      this.#emit();
      return;
    }
    if (message.type === "host_changed") {
      this.#pauseForResync();
      this.#hostId = message.hostId;
      this.#members = this.#members.map((member) => ({
        ...member,
        host: member.playerId === message.hostId,
      }));
      this.#releaseWaiters();
      void this.#recover("authority_changed", "authority changed");
      return;
    }
    if (message.type === "room_closed") {
      this.#generation += 1;
      this.#rejectAll("room_closed", "room closed");
      this.#inflight.clear();
      this.#prepared.clear();
      this.#queue.length = 0;
      this.#clearAllCommitTimeouts();
      this.#releaseWaiters();
      this.#clearIdentity();
      this.#unbind();
      this.#setConnection("closed");
      return;
    }
    if (message.type === "error") {
      this.#onError(message);
    }
  }

  #onError(message: Extract<ServerEnvelope, { type: "error" }>): void {
    const outcome = outcomeFromError(
      message.code,
      message.message,
      message.actionOutcome,
    );
    const error = new SynchronizedRoomError(outcome, message.message);
    this.#lastError = error;
    if (outcome === "state_conflict" || outcome === "authority_changed") {
      this.#pauseForResync();
      void this.#recover(outcome, message.message);
      this.#emit();
      return;
    }
    if (outcome === "duplicate") {
      if (message.actionId && this.#pending.has(message.actionId)) {
        const senderId = message.senderId || this.#pending.get(message.actionId)?.senderId;
        if (senderId && this.#seen(senderId, message.actionId)) {
          this.#succeed(message.actionId, senderId);
        } else {
          this.#armCommitTimeout(message.actionId);
        }
        return;
      }
      this.#emit();
      return;
    }
    if (message.actionId && this.#pending.has(message.actionId)) {
      this.#failPending(message.actionId, error);
      return;
    }
    if (message.actionId) this.#releaseWaiters(message.actionId);
    this.#emit();
  }

  #pauseForResync(): void {
    this.#epoch += 1;
    this.#queue.length = 0;
    this.#resyncing = true;
    this.#releaseWaiters();
    this.#refreshPendingTimers();
    this.#setConnection("resynchronizing");
  }

  async #recover(outcome: SynchronizedRoomOutcome, message: string): Promise<void> {
    if (this.#isInactive()) return;
    this.#refreshPendingTimers();
    try {
      await this.#host.requestSnapshot();
    } catch {
      this.#failRoom(outcome, message);
    }
  }

  #failRoom(outcome: SynchronizedRoomOutcome, message: string): void {
    this.#resyncing = false;
    this.#queue.length = 0;
    this.#inflight.clear();
    this.#prepared.clear();
    this.#clearAllCommitTimeouts();
    this.#rejectAll(outcome, message);
    this.#releaseWaiters();
    this.#unbind();
    this.#setConnection("failed");
  }

  #applyAuthoritative(
    message: ServerEnvelope,
    replace: boolean,
    options: { preserveLocalState?: boolean; generation?: number } = {},
  ): void {
    if (message.type !== "snapshot" && message.type !== "state") return;
    if (this.#isInactive()) return;
    if (
      options.generation !== undefined &&
      options.generation !== this.#generation
    ) {
      return;
    }
    if (replace) {
      try {
        this.#requireCapabilities(message);
      } catch (error) {
        this.#failRoom(
          "invalid",
          error instanceof Error ? error.message : "incompatible runtime",
        );
        return;
      }
    }
    if (message.hostId) this.#hostId = message.hostId;
    if (message.type === "snapshot" && message.members?.length) {
      this.#members = asMembers(message.members, this.#hostId);
    }
    const incomingVersion = message.stateVersion;
    const stale =
      incomingVersion !== undefined && incomingVersion < this.#stateVersion;
    const skipEmptyBootstrap =
      options.preserveLocalState && isUncommittedEmptyState(message);
    if (!stale && incomingVersion !== undefined) {
      this.#stateVersion = incomingVersion;
    }
    if (message.state !== undefined && !skipEmptyBootstrap && !stale) {
      try {
        this.#previousState = this.#state;
        this.#state = this.#parseState(message.state);
      } catch (error) {
        this.#failRoom(
          "invalid",
          error instanceof Error ? error.message : "invalid authoritative state",
        );
        return;
      }
    }
    const senderId = "senderId" in message ? message.senderId : undefined;
    if (message.actionId) {
      this.#remember(senderId || this.#playerId, message.actionId);
    }
    const identity = message.actionId
      ? this.#identity(senderId || this.#playerId, message.actionId)
      : "";
    const committedItem = identity ? this.#inflight.get(identity) : undefined;
    if (identity) {
      this.#inflight.delete(identity);
      this.#prepared.delete(identity);
    }
    const pendingMatches =
      message.actionId &&
      this.#pending.has(message.actionId) &&
      (!senderId || senderId === this.#pending.get(message.actionId)?.senderId);
    if (pendingMatches && !stale) {
      this.#succeed(message.actionId!, senderId);
    } else if (message.actionId) {
      this.#notifyWaiters(message.actionId);
    }
    if (committedItem && !stale) {
      this.#notifyCommitted(committedItem);
    }
    if (this.#resyncing && !stale && (replace || incomingVersion !== undefined)) {
      this.#resyncing = false;
      this.#setConnection("connected");
      this.#requeuePending();
    } else if (this.#connection === "joining") {
      // Join completion sets connected after bootstrap or the join snapshot.
    } else if (
      !this.#resyncing &&
      this.#connection !== "closed" &&
      this.#connection !== "failed" &&
      this.#connection !== "leaving" &&
      this.#connection !== "leave_failed" &&
      this.#connection !== "reconnecting"
    ) {
      this.#setConnection("connected");
    }
    this.#emit();
    this.#scheduleDrain();
  }

  #requeuePending(): void {
    this.#queue.length = 0;
    if (this.isHost) {
      for (const item of this.#inflight.values()) {
        this.#enqueue({ ...item, epoch: this.#epoch });
      }
    } else {
      this.#inflight.clear();
    }
    for (const pending of this.#pending.values()) {
      if (this.#seen(pending.senderId, pending.actionId)) continue;
      pending.epoch = this.#epoch;
      if (this.isHost) {
        this.#enqueue({
          actionId: pending.actionId,
          action: pending.action,
          senderId: pending.senderId,
          epoch: this.#epoch,
        });
      } else {
        void this.#host.sendAction(pending.action, { actionId: pending.actionId }).catch((error) => {
          this.#failPending(
            pending.actionId,
            new SynchronizedRoomError(
              "indeterminate",
              error instanceof Error ? error.message : "resend failed",
            ),
          );
        });
      }
    }
    this.#scheduleDrain();
  }

  #succeed(actionId: string, senderId?: string): void {
    const pending = this.#pending.get(actionId);
    const identity = this.#identity(senderId || pending?.senderId || this.#playerId, actionId);
    this.#inflight.delete(identity);
    this.#prepared.delete(identity);
    this.#clearCommitTimeout(actionId);
    this.#notifyWaiters(actionId);
    if (!pending) return;
    this.#pending.delete(actionId);
    this.#remember(pending.senderId, actionId);
    pending.resolve(this.getSnapshot());
  }

  #failPending(actionId: string, error: SynchronizedRoomError): void {
    const pending = this.#pending.get(actionId);
    const identity = this.#identity(pending?.senderId || this.#playerId, actionId);
    this.#inflight.delete(identity);
    this.#prepared.delete(identity);
    this.#clearCommitTimeout(actionId);
    this.#releaseWaiters(actionId);
    if (!pending) return;
    this.#pending.delete(actionId);
    this.#lastError = error;
    pending.reject(error);
    this.#emit();
  }

  #rejectAll(outcome: SynchronizedRoomOutcome, message: string): void {
    const error = new SynchronizedRoomError(outcome, message);
    this.#lastError = error;
    for (const actionId of [...this.#pending.keys()]) this.#failPending(actionId, error);
  }

  #awaitCommit(actionId: string): Promise<CommitResult> {
    if (this.#resyncing || this.#isCommitClosed()) return Promise.resolve("aborted");
    return new Promise((resolve) => {
      if (this.#resyncing || this.#isCommitClosed()) {
        resolve("aborted");
        return;
      }
      const timer = setTimeout(() => {
        const waiters = this.#waiters.get(actionId);
        if (!waiters) return;
        this.#waiters.delete(actionId);
        for (const waiter of waiters) waiter.resolve("timeout");
      }, SYNCHRONIZED_ROOM_COMMIT_TIMEOUT_MS);
      timer.unref?.();
      const waiters = this.#waiters.get(actionId) ?? [];
      waiters.push({
        resolve: (result) => {
          clearTimeout(timer);
          resolve(result);
        },
      });
      this.#waiters.set(actionId, waiters);
    });
  }

  #notifyWaiters(actionId: string): void {
    const waiters = this.#waiters.get(actionId);
    if (!waiters) return;
    this.#waiters.delete(actionId);
    for (const waiter of waiters) {
      try {
        waiter.resolve("committed");
      } catch {
        // Waiter callbacks must not block commit completion.
      }
    }
  }

  #releaseWaiters(actionId?: string): void {
    const ids = actionId ? [actionId] : [...this.#waiters.keys()];
    for (const id of ids) {
      const waiters = this.#waiters.get(id);
      if (!waiters) continue;
      this.#waiters.delete(id);
      for (const waiter of waiters) {
        try {
          waiter.resolve("aborted");
        } catch {
          // Waiter callbacks must not block recovery.
        }
      }
    }
  }

  #armCommitTimeout(actionId: string): void {
    this.#clearCommitTimeout(actionId);
    const timer = setTimeout(() => {
      this.#commitTimers.delete(actionId);
      this.#failPending(
        actionId,
        new SynchronizedRoomError(
          "indeterminate",
          "authoritative confirmation timed out",
        ),
      );
    }, SYNCHRONIZED_ROOM_COMMIT_TIMEOUT_MS);
    timer.unref?.();
    this.#commitTimers.set(actionId, timer);
  }

  #clearCommitTimeout(actionId: string): void {
    const timer = this.#commitTimers.get(actionId);
    if (timer === undefined) return;
    clearTimeout(timer);
    this.#commitTimers.delete(actionId);
  }

  #clearAllCommitTimeouts(): void {
    for (const timer of this.#commitTimers.values()) clearTimeout(timer);
    this.#commitTimers.clear();
  }

  #notifyCommitted(item: Queued<Action>): void {
    const snapshot = this.getSnapshot();
    for (const listener of this.#committed) {
      try {
        listener({
          actionId: item.actionId,
          action: item.action,
          senderId: item.senderId,
          previousState: this.#previousState,
          state: snapshot.state,
          stateVersion: snapshot.stateVersion,
        });
      } catch {
        // Listener exceptions must not hang dispatch() or drain.
      }
    }
  }

  #enqueue(item: Queued<Action>): void {
    const identity = this.#identity(item.senderId, item.actionId);
    if (
      !this.#inflight.has(identity) &&
      this.#inflight.size >= SYNCHRONIZED_ROOM_MAX_RECENT_ACTIONS
    ) {
      if (item.senderId === this.#playerId) {
        this.#failPending(
          item.actionId,
          new SynchronizedRoomError("rate_limited", "host action queue is full"),
        );
      } else {
        this.#rejectRemote(
          item.actionId,
          "rejected",
          "host action queue is full",
          item.senderId,
        );
      }
      return;
    }
    this.#inflight.set(identity, item);
    if (
      !this.#queue.some(
        (queued) => this.#identity(queued.senderId, queued.actionId) === identity,
      )
    ) {
      this.#queue.push(item);
    }
  }

  async #rejectQueued(
    item: Queued<Action>,
    outcome: "rejected" | "invalid",
    message: string,
  ): Promise<void> {
    this.#inflight.delete(this.#identity(item.senderId, item.actionId));
    this.#prepared.delete(this.#identity(item.senderId, item.actionId));
    if (item.senderId === this.#playerId) {
      this.#failPending(
        item.actionId,
        new SynchronizedRoomError(outcome, message),
      );
      return;
    }
    try {
      await this.#host.sendActionRejection(
        item.actionId,
        outcome,
        protocolRejectionMessage(message),
        { senderId: item.senderId },
      );
    } catch {
      // Keep drain running; the sender resolves via rejection or timeout.
    }
  }

  #rejectRemote(
    actionId: string,
    outcome: "rejected" | "invalid",
    message: string,
    senderId?: string,
  ): void {
    void this.#host
      .sendActionRejection(actionId, outcome, protocolRejectionMessage(message), {
        senderId,
      })
      .catch(() => undefined);
  }

  #identity(senderId: string, actionId: string): string {
    return actionIdentityKey(senderId, actionId);
  }

  #seen(senderId: string, actionId: string): boolean {
    const key = this.#identity(senderId, actionId);
    const seenAt = this.#recent.get(key);
    if (seenAt === undefined) return false;
    if (Date.now() - seenAt > SYNCHRONIZED_ROOM_ACTION_TTL_MS) {
      this.#recent.delete(key);
      return false;
    }
    return true;
  }

  #remember(senderId: string, actionId: string): void {
    if (!ACTION_ID.test(actionId) || !senderId) return;
    const key = this.#identity(senderId, actionId);
    this.#recent.set(key, Date.now());
    for (const [id, seenAt] of this.#recent) {
      if (Date.now() - seenAt > SYNCHRONIZED_ROOM_ACTION_TTL_MS) this.#recent.delete(id);
    }
    if (this.#recent.size <= SYNCHRONIZED_ROOM_MAX_RECENT_ACTIONS) return;
    const oldest = this.#recent.keys().next().value;
    if (oldest) this.#recent.delete(oldest);
  }

  #parseState(value: unknown): State {
    return this.#options.stateSchema
      ? this.#options.stateSchema.parse(value)
      : (value as State);
  }

  #parseAction(value: unknown): Action {
    return this.#options.actionSchema
      ? this.#options.actionSchema.parse(value)
      : (value as Action);
  }

  #tryParseAction(value: unknown): Action | undefined {
    try {
      return this.#parseAction(value);
    } catch {
      return undefined;
    }
  }

  #clearIdentity(): void {
    this.#roomId = "";
    this.#inviteCode = "";
    this.#hostId = "";
    this.#members = [];
  }

  #isInactive(): boolean {
    return (
      this.#connection === "leaving" ||
      this.#connection === "leave_failed" ||
      this.#connection === "closed" ||
      this.#connection === "failed"
    );
  }

  #isTerminal(): boolean {
    return (
      this.#connection === "closed" ||
      this.#connection === "failed" ||
      this.#connection === "leave_failed" ||
      this.#connection === "idle"
    );
  }

  #requireCapabilities(message: ServerEnvelope): void {
    if (message.type !== "snapshot") return;
    const capabilities = message.capabilities;
    if (!capabilities || capabilities.synchronized_rooms !== true) {
      throw new SynchronizedRoomError(
        "invalid",
        "runtime does not advertise synchronized_rooms",
      );
    }
    if (
      capabilities.minimumProtocolVersion !== undefined &&
      capabilities.minimumProtocolVersion > PROTOCOL_VERSION
    ) {
      throw new SynchronizedRoomError(
        "invalid",
        "runtime requires a newer protocol version",
      );
    }
  }

  #refreshPendingTimers(): void {
    for (const actionId of this.#pending.keys()) this.#armCommitTimeout(actionId);
  }

  #isCommitClosed(): boolean {
    return (
      this.#connection === "closed" ||
      this.#connection === "failed" ||
      this.#connection === "leaving" ||
      this.#connection === "leave_failed" ||
      this.#connection === "reconnecting"
    );
  }

  #throwIfFailed(message: string): void {
    if (this.#connection !== "failed") return;
    throw (
      this.#lastError ??
      new SynchronizedRoomError("invalid", message)
    );
  }

  #setConnection(connection: ConnectionState): void {
    this.#connection = connection;
    this.#emit();
  }

  #emit(): void {
    const snapshot = this.getSnapshot();
    for (const listener of this.#listeners) {
      try {
        listener(snapshot);
      } catch {
        // Snapshot listeners must not break connection or commit handling.
      }
    }
  }
}
