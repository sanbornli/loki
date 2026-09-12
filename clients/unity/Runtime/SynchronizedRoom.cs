using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading;
using System.Threading.Tasks;

namespace Loki.Play.SDK
{
    public enum ConnectionState
        Idle, Joining, Connected, Suspended, Reconnecting, Resynchronizing, Leaving, LeaveFailed, Closed, Failed
        Idle, Joining, Connected, Reconnecting, Resynchronizing, Leaving, LeaveFailed, Closed, Failed
    }

    public enum SynchronizedRoomOutcome
    {
        Committed, Rejected, Duplicate, Invalid, RateLimited, StateConflict, AuthorityChanged, RoomClosed, Indeterminate
    }

    public sealed class SynchronizedRoomError : Exception
    {
        public readonly SynchronizedRoomOutcome Outcome;
        public SynchronizedRoomError(SynchronizedRoomOutcome outcome, string message) : base(message)
        {
            Outcome = outcome;
        }
    }

    public sealed class RoomMember
    {
        public readonly string PlayerId;
        public readonly string SessionId;
        public readonly long JoinedAt;
        public readonly long? Team;
        public readonly bool Host;
        public RoomMember(string playerId, string sessionId, long joinedAt, long? team, bool host)
        {
            PlayerId = playerId; SessionId = sessionId; JoinedAt = joinedAt; Team = team; Host = host;
        }
    }

    public sealed class ActionContext
    {
        public readonly string ActionId;
        public readonly string SenderId;
        public readonly string HostId;
        public readonly IReadOnlyList<RoomMember> Members;
        public ActionContext(string actionId, string senderId, string hostId, IReadOnlyList<RoomMember> members)
        {
            ActionId = actionId; SenderId = senderId; HostId = hostId; Members = members;
        }
    }

    public sealed class SynchronizedRoomSnapshot
    {
        public readonly string RoomId;
        public readonly string InviteCode;
        public readonly string PlayerId;
        public readonly string HostId;
        public readonly IReadOnlyList<RoomMember> Members;
        public readonly string Membership;
        public readonly long MembershipRevision;
        public readonly JsonValue State;
        public readonly long StateVersion;
        public readonly ConnectionState Connection;
        public readonly SynchronizedRoomError LastError;
        public SynchronizedRoomSnapshot(
            string roomId, string inviteCode, string playerId, string hostId, IReadOnlyList<RoomMember> members,
            string membership, long membershipRevision, JsonValue state, long stateVersion,
            ConnectionState connection, SynchronizedRoomError lastError)
        {
            RoomId = roomId; InviteCode = inviteCode; PlayerId = playerId; HostId = hostId; Members = members;
            Membership = membership; MembershipRevision = membershipRevision;
            State = state; StateVersion = stateVersion; Connection = connection; LastError = lastError;
        }
    }

    public sealed class SynchronizedRoom
    {
        public const int CommitTimeoutMs = 10000;
        public const int RecoveryDeadlineMs = 60000;
        public const int MinCommitTimeoutMs = 5000;
        public const int MaxCommitTimeoutMs = 60000;
        public const int MinRecoveryDeadlineMs = 30000;
        public const int MaxRecoveryDeadlineMs = 120000;
        public const int MaxPending = 32;
        private readonly LokiClient client;
        private readonly JsonValue initialState;
        private readonly Func<JsonValue, JsonValue, ActionContext, JsonValue> reduce;
        private readonly object gate = new object();
        private JsonValue state;
        private long stateVersion;
        private ConnectionState connection = ConnectionState.Idle;
        private SynchronizedRoomError lastError;
        private string playerId = "";
        private string roomId = "";
        private string inviteCode = "";
        private string hostId = "";
        private List<RoomMember> members = new List<RoomMember>();
        private bool membersComplete;
        private long membershipRevision;
        private int generation;
        private bool resyncing;
        private readonly Dictionary<string, TaskCompletionSource<SynchronizedRoomSnapshot>> pending =
            new Dictionary<string, TaskCompletionSource<SynchronizedRoomSnapshot>>();
        private readonly Dictionary<string, KeyValuePair<JsonValue, string>> pendingActions =
            new Dictionary<string, KeyValuePair<JsonValue, string>>();
        private readonly HashSet<string> recent = new HashSet<string>();
        private readonly Dictionary<string, JsonValue> prepared = new Dictionary<string, JsonValue>();
        private int messageListener;
        private readonly Dictionary<string, CancellationTokenSource> watchdogs =
            new Dictionary<string, CancellationTokenSource>();
        private readonly Dictionary<string, Watchdog> watchdogState = new Dictionary<string, Watchdog>();
        private bool timersPaused;
        private bool recoveringFromTimeout;
        private readonly Queue<HostItem> hostQueue = new Queue<HostItem>();
        private bool draining;
        private readonly long commitTimeoutMs;
        private readonly long recoveryDeadlineMs;
        public int Reductions { get; private set; }
        public bool IsHost { get { return playerId.Length > 0 && playerId == hostId; } }

        private sealed class Watchdog
        {
            public string Phase;
            public long ConfirmRemainingMs;
            public long RecoveryRemainingMs;
            public DateTime? StartedAt;
            public Watchdog(string phase, long confirmRemainingMs, long recoveryRemainingMs)
            {
                Phase = phase;
                ConfirmRemainingMs = confirmRemainingMs;
                RecoveryRemainingMs = recoveryRemainingMs;
            }
        }

        private struct HostItem
        {
            public string ActionId;
            public JsonValue Action;
            public string SenderId;
            public HostItem(string actionId, JsonValue action, string senderId)
            {
                ActionId = actionId; Action = action; SenderId = senderId;
            }
        }

        public SynchronizedRoom(
            LokiClient client,
            JsonValue initialState,
            Func<JsonValue, JsonValue, ActionContext, JsonValue> reduce,
            long commitTimeoutMs = CommitTimeoutMs,
            long recoveryDeadlineMs = RecoveryDeadlineMs)
        {
            this.client = client;
            this.initialState = initialState;
            this.state = initialState;
            this.reduce = reduce;
            this.commitTimeoutMs = Math.Min(MaxCommitTimeoutMs, Math.Max(MinCommitTimeoutMs, commitTimeoutMs));
            this.recoveryDeadlineMs = Math.Max(
                this.commitTimeoutMs,
                Math.Min(MaxRecoveryDeadlineMs, Math.Max(MinRecoveryDeadlineMs, recoveryDeadlineMs)));
            this.reduce = reduce;
        }

        public SynchronizedRoomSnapshot GetSnapshot()
        {
            lock (gate)
            {
                return new SynchronizedRoomSnapshot(
                    roomId, inviteCode, playerId, hostId, members.ToArray(), MembershipStatus(), membershipRevision,
                    state, stateVersion, connection, lastError);
            }
        }

        public Task<SynchronizedRoomSnapshot> CreateAsync()
        {
            return EnterAsync(true, () => client.CreateSessionRoomAsync());
        }

        public Task<SynchronizedRoomSnapshot> JoinAsync(string invite)
        {
            return EnterAsync(false, () => client.JoinSessionRoomAsync(invite));
        }

        public async Task<SynchronizedRoomSnapshot> DispatchAsync(JsonValue action)
        {
            if (snapshot.Connection != ConnectionState.Connected)
            if (snapshot.Connection != ConnectionState.Connected && snapshot.Connection != ConnectionState.Resynchronizing)
                throw new SynchronizedRoomError(SynchronizedRoomOutcome.Rejected, "room is not connected");
            if (pending.Count >= MaxPending)
                throw new SynchronizedRoomError(SynchronizedRoomOutcome.Rejected, "pending queue is full");
            var actionId = Guid.NewGuid().ToString();
            var sender = client.PlayerId;
            if (string.IsNullOrEmpty(sender))
                throw new SynchronizedRoomError(SynchronizedRoomOutcome.Rejected, "authenticate before dispatching");
            playerId = sender;
            var waiter = new TaskCompletionSource<SynchronizedRoomSnapshot>(TaskCreationOptions.RunContinuationsAsynchronously);
            lock (gate)
            {
                pending[actionId] = waiter;
                pendingActions[actionId] = new KeyValuePair<JsonValue, string>(action, sender);
            ArmWatchdog(actionId);
            }
            try { await SubmitAsync(actionId, action, sender); }
            catch (Exception error)
                var roomError = error as SynchronizedRoomError;
                if (roomError != null && (
                    roomError.Outcome == SynchronizedRoomOutcome.Rejected ||
                    roomError.Outcome == SynchronizedRoomOutcome.Invalid ||
                    roomError.Outcome == SynchronizedRoomOutcome.RateLimited))
                {
                    FailPending(actionId, roomError);
                }
                else RecoverAfterTimeout();
                FailPending(actionId, new SynchronizedRoomError(SynchronizedRoomOutcome.Indeterminate, error.Message));
            }
            return await waiter.Task;
        }

        public async Task LeaveAsync()
        {
            generation += 1;
            lock (gate) { connection = ConnectionState.Leaving; }
            FailAll(SynchronizedRoomOutcome.RoomClosed, "room left");
            var current = roomId;
            try
            {
                await client.LeaveCurrentRoomAsync(current.Length == 0 ? null : current);
                ClearIdentity();
                Unbind();
                lock (gate) { connection = ConnectionState.Closed; }
            }
            catch
            {
                lock (gate) { connection = ConnectionState.LeaveFailed; }
                throw;
            }
        }

        public async Task CloseAsync()
        {
            generation += 1;
            FailAll(SynchronizedRoomOutcome.RoomClosed, "room closed");
            var current = roomId;
            ClearIdentity();
            Unbind();
            lock (gate) { connection = ConnectionState.Closed; }
            try { await client.LeaveCurrentRoomAsync(current.Length == 0 ? null : current); } catch { }
        }

        public async Task ReconnectAsync()
        {
            if (IsTerminal())
                throw new SynchronizedRoomError(SynchronizedRoomOutcome.Rejected, "cannot reconnect from a terminal state");
            lock (gate)
            {
                connection = ConnectionState.Reconnecting;
                resyncing = true;
            }
            try
            {
                await client.ReconnectCurrentRoomAsync();
                if (resyncing) lock (gate) { connection = ConnectionState.Resynchronizing; }
            catch
            {
                lock (gate)
                {
                    resyncing = true;
                    connection = ConnectionState.Reconnecting;
                }
                FailRoom(SynchronizedRoomOutcome.Indeterminate, error.Message);
                throw;
            }
        }

        private bool IsTerminal()
        {
            return connection == ConnectionState.Closed || connection == ConnectionState.Failed ||
                connection == ConnectionState.LeaveFailed || connection == ConnectionState.Idle;
        }

        private bool IsInactive()
        {
            return connection == ConnectionState.Leaving || connection == ConnectionState.LeaveFailed ||
                connection == ConnectionState.Closed || connection == ConnectionState.Failed;
        }

        private async Task<SynchronizedRoomSnapshot> EnterAsync(bool bootstrap, Func<Task<JoinedRoom>> join)
        {
            if (connection == ConnectionState.LeaveFailed)
                throw new SynchronizedRoomError(SynchronizedRoomOutcome.Rejected, "resolve the failed leave before joining");
            var current = ++generation;
            lock (gate) { connection = ConnectionState.Joining; }
            Bind();
            playerId = client.PlayerId ?? "";
            if (playerId.Length == 0)
                throw new SynchronizedRoomError(SynchronizedRoomOutcome.Rejected, "authenticate first");
            var joinedId = "";
            try
            {
                var joined = await join();
                joinedId = joined.RoomId;
                if (current != generation)
                {
                    try { await client.LeaveCurrentRoomAsync(joined.RoomId); } catch { }
                    throw new SynchronizedRoomError(SynchronizedRoomOutcome.Rejected, "join superseded");
                }
                RequireCapabilities(joined.Snapshot);
                roomId = joined.RoomId;
                inviteCode = joined.InviteCode;
                Apply(joined.Snapshot, true, bootstrap);
                if (bootstrap && IsHost)
                {
                    await client.PublishSessionHostStateAsync(0, initialState, 0, Guid.NewGuid().ToString(), playerId);
                }
                if (current != generation)
                {
                    try { await client.LeaveCurrentRoomAsync(joined.RoomId); } catch { }
                    throw new SynchronizedRoomError(SynchronizedRoomOutcome.Rejected, "join superseded");
                lock (gate)
                {
                    if (!client.IsForeground)
                    {
                        timersPaused = true;
                        connection = ConnectionState.Suspended;
                    }
                    else connection = ConnectionState.Connected;
                }
                lock (gate) { connection = ConnectionState.Connected; }
                return GetSnapshot();
            }
            catch (Exception error)
            {
                if (joinedId.Length > 0)
                {
                    try { await client.LeaveCurrentRoomAsync(joinedId); } catch { }
                }
                if (current == generation)
                {
                    ClearIdentity();
                    Unbind();
                    lock (gate)
                    {
                        connection = ConnectionState.Failed;
                        lastError = error as SynchronizedRoomError ??
                            new SynchronizedRoomError(SynchronizedRoomOutcome.Rejected, error.Message);
                    }
                }
                throw;
            }
        }

        private void Bind()
        {
            if (messageListener != 0) return;
            messageListener = client.OnMessage(OnMessage);
            connectionListener = client.OnConnection(OnConnection);
        }

        private void Unbind()
        {
            if (messageListener != 0) client.RemoveMessageListener(messageListener);
            if (connectionListener != 0) client.RemoveConnectionListener(connectionListener);
            messageListener = 0;
            connectionListener = 0;
        }

        private void OnConnection(string eventName)
        {
            if (eventName == "suspended")
            {
                timersPaused = true;
                CancelWatchdogs();
                lock (gate) { connection = ConnectionState.Suspended; }
                return;
            }
            if (eventName == "resumed")
            {
                timersPaused = false;
                lock (gate)
                {
                    resyncing = true;
                    connection = ConnectionState.Reconnecting;
                }
                foreach (var actionId in new List<string>(pending.Keys)) ArmWatchdog(actionId);
                return;
            }
            if (eventName == "reconnect_failed")
            {
                if (connection == ConnectionState.Suspended) return;
                lock (gate)
                {
                    resyncing = true;
                    connection = ConnectionState.Reconnecting;
                }
                return;
            }
            if (eventName == "disconnected")
            {
                if (connection == ConnectionState.Suspended) return;
            {
                lock (gate)
                {
                    resyncing = true;
                    connection = ConnectionState.Reconnecting;
                }
            }
        }

        private async Task SubmitAsync(string actionId, JsonValue action, string senderId)
            if (IsHost) EnqueueHost(actionId, action, senderId);
            else await client.SendSessionActionAsync(action, actionId);
        }

        private void EnqueueHost(string actionId, JsonValue action, string senderId)
        {
            hostQueue.Enqueue(new HostItem(actionId, action, senderId));
            _ = DrainHostAsync();
        }

        private async Task DrainHostAsync()
        {
            if (draining) return;
            draining = true;
            try
            {
                while (hostQueue.Count > 0 && IsHost && connection == ConnectionState.Connected && !resyncing)
                {
                    var item = hostQueue.Dequeue();
                    try { await CommitAsync(item.ActionId, item.Action, item.SenderId); }
                    catch (Exception error)
                    {
                        var roomError = error as SynchronizedRoomError;
                        if (roomError != null && (
                            roomError.Outcome == SynchronizedRoomOutcome.Rejected ||
                            roomError.Outcome == SynchronizedRoomOutcome.Invalid ||
                            roomError.Outcome == SynchronizedRoomOutcome.RateLimited))
                        {
                            FailPending(item.ActionId, roomError);
                            continue;
                        }
                        RecoverAfterTimeout();
                        break;
                    }
                }
            }
            finally { draining = false; }
            else await client.SendSessionActionAsync(action, actionId);
        }

        private async Task CommitAsync(string actionId, JsonValue action, string senderId)
        {
            var identity = senderId + "\u001f" + actionId;
            JsonValue next;
            if (!prepared.TryGetValue(identity, out next))
            {
                var started = DateTime.UtcNow;
                next = reduce(state, action, new ActionContext(actionId, senderId, hostId, members));
                if ((DateTime.UtcNow - started).TotalMilliseconds > 50)
                    throw new SynchronizedRoomError(SynchronizedRoomOutcome.Rejected, "reducer exceeded execution budget");
                Reductions += 1;
                prepared[identity] = next;
            }
            await client.PublishSessionHostStateAsync(stateVersion, next, stateVersion, actionId, senderId);
        }

        private void OnMessage(ServerEnvelope message)
        {
            if (IsInactive() && message.Type != "room_closed") return;
            if (roomId.Length > 0 && message.RoomId != roomId) return;
            if (message.Type == "snapshot" || message.Type == "state")
            {
                Apply(message, message.Type == "snapshot", false);
                return;
            }
            if (message.Type == "action")
            {
                var actionId = message.Fields.OptionalString("actionId");
                if (!IsHost || actionId == null) return;
                KeyValuePair<JsonValue, string> queued;
                var action = pendingActions.TryGetValue(actionId, out queued) ? queued.Key : (message.Fields.ContainsKey("payload") ? message.Fields["payload"] : JsonValue.Null);
                EnqueueHost(actionId, action, sender);
                var ignored = CommitAsync(actionId, action, sender);
                return;
            }
            if (message.Type == "presence")
            {
                var nextHost = message.Fields.OptionalString("hostId");
                if (nextHost != null) hostId = nextHost;
                ApplyMembership(message);
                return;
            }
            if (message.Type == "host_changed")
            {
                resyncing = true;
                connection = ConnectionState.Resynchronizing;
                hostId = message.Fields.OptionalString("hostId") ?? hostId;
                var ignored = client.RequestSessionSnapshotAsync();
                return;
            }
            if (message.Type == "room_closed")
            {
                generation += 1;
                FailAll(SynchronizedRoomOutcome.RoomClosed, "room closed");
                ClearIdentity();
                Unbind();
                lock (gate) { connection = ConnectionState.Closed; }
                return;
            }
            if (message.Type == "error") OnError(message);
        }

        private void OnError(ServerEnvelope message)
        {
            var text = message.Fields.OptionalString("message") ?? "error";
            var code = message.Fields.OptionalString("code");
            if (code == "STALE_VERSION" || code == "HOST_REQUIRED")
            {
                resyncing = true;
                connection = ConnectionState.Resynchronizing;
                RecoverAfterTimeout();
                return;
            }
            if (text.IndexOf("duplicate action", StringComparison.Ordinal) >= 0 && actionId != null)
            {
                var identity = (message.Fields.OptionalString("senderId") ?? playerId) + "\u001f" + actionId;
                if (recent.Contains(identity)) Succeed(actionId, message.Fields.OptionalString("senderId"));
                return;
            }
            if (actionId != null && pending.ContainsKey(actionId))
            {
                var outcome = code == "RATE_LIMITED" ? SynchronizedRoomOutcome.RateLimited
                    : code == "STALE_VERSION" ? SynchronizedRoomOutcome.StateConflict
                    : message.Fields.OptionalString("actionOutcome") == "invalid" ? SynchronizedRoomOutcome.Invalid
                    : SynchronizedRoomOutcome.Rejected;
                FailPending(actionId, new SynchronizedRoomError(outcome, text));
            }
        }

        private void Apply(ServerEnvelope message, bool replace, bool preserveLocal)
        {
            if (replace)
            {
                try { RequireCapabilities(message); }
                catch (SynchronizedRoomError error)
                {
                    FailRoom(SynchronizedRoomOutcome.Invalid, error.Message);
                    return;
                }
            }
            var nextHost = message.Fields.OptionalString("hostId");
            if (nextHost != null) hostId = nextHost;
            if (replace) ApplyMembership(message);
            var incoming = message.Fields.OptionalLong("stateVersion");
            var stale = incoming.HasValue && incoming.Value < stateVersion;
            JsonValue stateValue;
            var hasState = message.Fields.TryGetValue("state", out stateValue);
            var empty = hasState && stateValue is JsonValue.ObjectValue && ((JsonValue.ObjectValue)stateValue).Value.Count == 0;
            var skip = preserveLocal && empty && (!incoming.HasValue || incoming.Value == 0);
            if (!stale && incoming.HasValue) stateVersion = incoming.Value;
            if (hasState && !skip && !stale) state = stateValue;
            var actionId = message.Fields.OptionalString("actionId");
            if (actionId != null)
            {
                var identity = (message.Fields.OptionalString("senderId") ?? playerId) + "\u001f" + actionId;
                recent.Add(identity);
                if (!stale) Succeed(actionId, message.Fields.OptionalString("senderId"));
                if (!stale) Succeed(actionId);
            }
            if (resyncing && !stale && (replace || incoming.HasValue))
            {
                if (connection != ConnectionState.Suspended)
                {
                    connection = ConnectionState.Connected;
                    ReplayPending();
                }
            }
            else if (connection != ConnectionState.Joining && !resyncing &&
                connection != ConnectionState.Closed && connection != ConnectionState.Failed &&
                connection != ConnectionState.Leaving && connection != ConnectionState.LeaveFailed &&
                connection != ConnectionState.Reconnecting &&
                connection != ConnectionState.Suspended)
                connection != ConnectionState.Reconnecting)
            {
                connection = ConnectionState.Connected;
            }
        }

        private string MembershipStatus()
        {
            var haveSelf = playerId.Length > 0 && members.Exists(member => member.PlayerId == playerId);
            return membersComplete && haveSelf ? "ready" : "synchronizing";
        }

        private static bool SnapshotMembersAreComplete(ServerEnvelope message)
        {
            var complete = message.Fields.OptionalBool("membersComplete");
            if (complete == true) return true;
            if (complete == false) return false;
            return ReadMembers(message, "").Count > 0;
        }

        private void ApplyMembership(ServerEnvelope message)
        {
            var revision = message.Fields.OptionalLong("membershipRevision");
            if (revision.HasValue && revision.Value >= membershipRevision) membershipRevision = revision.Value;
            if (SnapshotMembersAreComplete(message))
            {
                members = ReadMembers(message, hostId);
                membersComplete = true;
                return;
            }
            JsonValue rawLeaves;
            if (message.Fields.TryGetValue("leaves", out rawLeaves))
            {
                var leaves = rawLeaves as JsonValue.ArrayValue;
                if (leaves != null)
                {
                    var left = new HashSet<string>();
                    for (var i = 0; i < leaves.Value.Count; i++)
                        left.Add(leaves.Value[i].AsObject().String("playerId"));
                    members.RemoveAll(member => left.Contains(member.PlayerId));
                }
            }
            JsonValue rawJoins;
            if (message.Fields.TryGetValue("joins", out rawJoins))
            {
                var joins = rawJoins as JsonValue.ArrayValue;
                if (joins != null)
                {
                    for (var i = 0; i < joins.Value.Count; i++)
                    {
                        var fields = joins.Value[i].AsObject();
                        var id = fields.String("playerId");
                        members.RemoveAll(member => member.PlayerId == id);
                        JsonValue hostValue;
                        var hostFlag = fields.TryGetValue("host", out hostValue) && hostValue is JsonValue.BoolValue && ((JsonValue.BoolValue)hostValue).Value;
                        members.Add(new RoomMember(
                            id,
                            fields.OptionalString("sessionId") ?? id,
                            fields.OptionalLong("joinedAt") ?? 0,
                            fields.OptionalLong("team"),
                            hostFlag || id == hostId));
                    }
                }
            }
        }

        private static List<RoomMember> ReadMembers(ServerEnvelope message, string hostId)
        {
            var list = new List<RoomMember>();
            JsonValue raw;
            if (!message.Fields.TryGetValue("members", out raw)) return list;
            var array = raw as JsonValue.ArrayValue;
            if (array == null) return list;
            for (var i = 0; i < array.Value.Count; i++)
            {
                var fields = array.Value[i].AsObject();
                var id = fields.String("playerId");
                JsonValue hostValue;
                var hostFlag = fields.TryGetValue("host", out hostValue) && hostValue is JsonValue.BoolValue && ((JsonValue.BoolValue)hostValue).Value;
                list.Add(new RoomMember(
                    id,
                    fields.OptionalString("sessionId") ?? id,
                    fields.OptionalLong("joinedAt") ?? 0,
                    fields.OptionalLong("team"),
                    hostFlag || id == hostId));
            }
            return list;
        }

        private void RequireCapabilities(ServerEnvelope message)
        {
            if (message.Type != "snapshot") return;
            JsonValue caps;
            if (!message.Fields.TryGetValue("capabilities", out caps))
                throw new SynchronizedRoomError(SynchronizedRoomOutcome.Invalid, "runtime does not advertise synchronized_rooms");
            var fields = caps as JsonValue.ObjectValue;
            JsonValue flag;
            if (fields == null || !fields.Value.TryGetValue("synchronized_rooms", out flag) ||
                !(flag is JsonValue.BoolValue) || !((JsonValue.BoolValue)flag).Value)
            {
                throw new SynchronizedRoomError(SynchronizedRoomOutcome.Invalid, "runtime does not advertise synchronized_rooms");
            }
        }
        private void Succeed(string actionId, string senderId = null)
        {
            KeyValuePair<JsonValue, string> queued;
            if (senderId != null && pendingActions.TryGetValue(actionId, out queued) && queued.Value != senderId)
                return;
            CancelWatchdog(actionId);
            watchdogState.Remove(actionId);
            pendingActions.Remove(actionId);
            TaskCompletionSource<SynchronizedRoomSnapshot> waiter;
            if (pending.TryGetValue(actionId, out waiter))
            {
                pending.Remove(actionId);
                waiter.TrySetResult(GetSnapshot());
            }
        }

        private void FailPending(string actionId, SynchronizedRoomError error)
        {
            lastError = error;
            CancelWatchdog(actionId);
            watchdogState.Remove(actionId);
            pendingActions.Remove(actionId);
            TaskCompletionSource<SynchronizedRoomSnapshot> waiter;
            if (pending.TryGetValue(actionId, out waiter))
            {
                pending.Remove(actionId);
                waiter.TrySetException(error);
            }
        }

        private void ArmWatchdog(string actionId)
        {
            CancelWatchdog(actionId);
            Watchdog dog;
            if (!watchdogState.TryGetValue(actionId, out dog))
            {
                dog = new Watchdog("confirming", commitTimeoutMs, recoveryDeadlineMs);
                watchdogState[actionId] = dog;
            }
            if (timersPaused || connection == ConnectionState.Suspended) return;
            var remaining = dog.Phase == "confirming" ? dog.ConfirmRemainingMs : dog.RecoveryRemainingMs;
            if (remaining <= 0)
            {
                HandleWatchdog(actionId);
                return;
            }
            dog.StartedAt = DateTime.UtcNow;
            var cancel = new CancellationTokenSource();
            watchdogs[actionId] = cancel;
            var token = cancel.Token;
            Task.Run(async () =>
            {
                try
                {
                    await Task.Delay((int)remaining, token);
                    if (!token.IsCancellationRequested) HandleWatchdog(actionId);
                }
                catch (TaskCanceledException) { }
            }, token);
        }

        private void HandleWatchdog(string actionId)
        {
            if (!pending.ContainsKey(actionId) || IsInactive() || connection == ConnectionState.Suspended || timersPaused)
                return;
            Watchdog dog;
            if (!watchdogState.TryGetValue(actionId, out dog)) return;
            if (dog.Phase == "confirming")
            {
                dog.Phase = "recovering";
                dog.ConfirmRemainingMs = 0;
                dog.StartedAt = null;
                ArmWatchdog(actionId);
                RecoverAfterTimeout();
                return;
            }
            FailPending(actionId, new SynchronizedRoomError(SynchronizedRoomOutcome.Indeterminate, "authoritative confirmation timed out"));
        }

        private void RecoverAfterTimeout()
        {
            if (IsInactive() || connection == ConnectionState.Suspended || recoveringFromTimeout) return;
            recoveringFromTimeout = true;
            lock (gate)
            {
                resyncing = true;
                connection = ConnectionState.Resynchronizing;
            }
            _ = RecoverOnceAsync();
        }

        private async Task RecoverOnceAsync()
        {
            try { await client.ReconnectCurrentRoomAsync(); }
            catch { }
            finally { recoveringFromTimeout = false; }
        }

        private void CancelWatchdog(string actionId)
        {
            CancellationTokenSource cancel;
            if (!watchdogs.TryGetValue(actionId, out cancel)) return;
            watchdogs.Remove(actionId);
            cancel.Cancel();
            cancel.Dispose();
        }

        private void CancelWatchdogs()
        {
            var now = DateTime.UtcNow;
            foreach (var entry in watchdogState)
            {
                if (entry.Value.StartedAt.HasValue)
                {
                    var elapsed = (long)Math.Max(0, (now - entry.Value.StartedAt.Value).TotalMilliseconds);
                    if (entry.Value.Phase == "confirming")
                        entry.Value.ConfirmRemainingMs = Math.Max(0, entry.Value.ConfirmRemainingMs - elapsed);
                    else
                        entry.Value.RecoveryRemainingMs = Math.Max(0, entry.Value.RecoveryRemainingMs - elapsed);
                    entry.Value.StartedAt = null;
                }
            }
            foreach (var actionId in new List<string>(watchdogs.Keys)) CancelWatchdog(actionId);
        }

        private void ReplayPending()
        {
            if (IsHost)
            {
                foreach (var entry in new List<KeyValuePair<string, KeyValuePair<JsonValue, string>>>(pendingActions))
                    EnqueueHost(entry.Key, entry.Value.Key, entry.Value.Value);
                return;
            }
            foreach (var entry in new List<KeyValuePair<string, KeyValuePair<JsonValue, string>>>(pendingActions))
                _ = SubmitAsync(entry.Key, entry.Value.Key, entry.Value.Value);
            }
        }

        private void FailAll(SynchronizedRoomOutcome outcome, string message)
        {
            var error = new SynchronizedRoomError(outcome, message);
            lastError = error;
            var ids = new List<string>(pending.Keys);
            for (var i = 0; i < ids.Count; i++) FailPending(ids[i], error);
        }

        private void FailRoom(SynchronizedRoomOutcome outcome, string message)
        {
            resyncing = false;
            FailAll(outcome, message);
            Unbind();
            lock (gate) { connection = ConnectionState.Failed; }
        }

        private void ClearIdentity()
        {
            roomId = "";
            inviteCode = "";
            hostId = "";
            members = new List<RoomMember>();
            membersComplete = false;
            membershipRevision = 0;
        }
    }
}
