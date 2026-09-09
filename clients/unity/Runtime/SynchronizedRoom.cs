using System;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace Loki.Play.SDK
{
    public enum ConnectionState
    {
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
        public readonly JsonValue State;
        public readonly long StateVersion;
        public readonly ConnectionState Connection;
        public readonly SynchronizedRoomError LastError;
        public SynchronizedRoomSnapshot(
            string roomId, string inviteCode, string playerId, string hostId, IReadOnlyList<RoomMember> members,
            JsonValue state, long stateVersion, ConnectionState connection, SynchronizedRoomError lastError)
        {
            RoomId = roomId; InviteCode = inviteCode; PlayerId = playerId; HostId = hostId; Members = members;
            State = state; StateVersion = stateVersion; Connection = connection; LastError = lastError;
        }
    }

    public sealed class SynchronizedRoom
    {
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
        private int generation;
        private bool resyncing;
        private readonly Dictionary<string, TaskCompletionSource<SynchronizedRoomSnapshot>> pending =
            new Dictionary<string, TaskCompletionSource<SynchronizedRoomSnapshot>>();
        private readonly Dictionary<string, KeyValuePair<JsonValue, string>> pendingActions =
            new Dictionary<string, KeyValuePair<JsonValue, string>>();
        private readonly HashSet<string> recent = new HashSet<string>();
        private readonly Dictionary<string, JsonValue> prepared = new Dictionary<string, JsonValue>();
        private int messageListener;
        private int connectionListener;
        public int Reductions { get; private set; }
        public bool IsHost { get { return playerId.Length > 0 && playerId == hostId; } }

        public SynchronizedRoom(LokiClient client, JsonValue initialState, Func<JsonValue, JsonValue, ActionContext, JsonValue> reduce)
        {
            this.client = client;
            this.initialState = initialState;
            this.state = initialState;
            this.reduce = reduce;
        }

        public SynchronizedRoomSnapshot GetSnapshot()
        {
            lock (gate)
            {
                return new SynchronizedRoomSnapshot(
                    roomId, inviteCode, playerId, hostId, members.ToArray(), state, stateVersion, connection, lastError);
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
            var snapshot = GetSnapshot();
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
            }
            try { await SubmitAsync(actionId, action, sender); }
            catch (Exception error)
            {
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
            }
            catch (Exception error)
            {
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
            if (IsInactive()) return;
            if (eventName == "reconnect_failed")
            {
                FailRoom(SynchronizedRoomOutcome.Indeterminate, "reconnect failed");
                return;
            }
            if (eventName == "disconnected")
            {
                lock (gate)
                {
                    resyncing = true;
                    connection = ConnectionState.Reconnecting;
                }
            }
        }

        private async Task SubmitAsync(string actionId, JsonValue action, string senderId)
        {
            if (IsHost) await CommitAsync(actionId, action, senderId);
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
                var sender = message.Fields.OptionalString("senderId") ?? "";
                var ignored = CommitAsync(actionId, action, sender);
                return;
            }
            if (message.Type == "presence")
            {
                var nextHost = message.Fields.OptionalString("hostId");
                if (nextHost != null) hostId = nextHost;
                members = ReadMembers(message, hostId);
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
            var actionId = message.Fields.OptionalString("actionId");
            if (text.IndexOf("duplicate action", StringComparison.Ordinal) >= 0 && actionId != null)
            {
                var identity = (message.Fields.OptionalString("senderId") ?? playerId) + "\u001f" + actionId;
                if (recent.Contains(identity)) Succeed(actionId);
                return;
            }
            if (actionId != null && pending.ContainsKey(actionId))
            {
                var code = message.Fields.OptionalString("code");
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
            if (replace) members = ReadMembers(message, hostId);
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
                prepared.Remove(identity);
                if (!stale) Succeed(actionId);
            }
            if (resyncing && !stale && (replace || incoming.HasValue))
            {
                resyncing = false;
                connection = ConnectionState.Connected;
            }
            else if (connection != ConnectionState.Joining && !resyncing &&
                connection != ConnectionState.Closed && connection != ConnectionState.Failed &&
                connection != ConnectionState.Leaving && connection != ConnectionState.LeaveFailed &&
                connection != ConnectionState.Reconnecting)
            {
                connection = ConnectionState.Connected;
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

        private void Succeed(string actionId)
        {
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
            pendingActions.Remove(actionId);
            TaskCompletionSource<SynchronizedRoomSnapshot> waiter;
            if (pending.TryGetValue(actionId, out waiter))
            {
                pending.Remove(actionId);
                waiter.TrySetException(error);
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
        }
    }
}
