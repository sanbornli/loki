using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text;
using System.Threading;
using System.Threading.Tasks;

namespace Loki.Play.SDK
{
    public abstract class JsonValue
    {
        public sealed class NullValue : JsonValue { internal NullValue() { } }
        public sealed class BoolValue : JsonValue { public readonly bool Value; public BoolValue(bool value) { Value = value; } }
        public sealed class NumberValue : JsonValue { public readonly long Value; public NumberValue(long value) { Value = value; } }
        public sealed class StringValue : JsonValue { public readonly string Value; public StringValue(string value) { Value = value; } }
        public sealed class ArrayValue : JsonValue { public readonly IReadOnlyList<JsonValue> Value; public ArrayValue(IReadOnlyList<JsonValue> value) { Value = value; } }
        public sealed class ObjectValue : JsonValue { public readonly IReadOnlyDictionary<string, JsonValue> Value; public ObjectValue(IReadOnlyDictionary<string, JsonValue> value) { Value = value; } }

        public static readonly JsonValue Null = new NullValue();
        public static JsonValue From(string value) { return value == null ? Null : new StringValue(value); }
        public static JsonValue From(long value) { return new NumberValue(value); }
        public static JsonValue From(bool value) { return new BoolValue(value); }
        public static JsonValue Object(IDictionary<string, JsonValue> value) { return new ObjectValue(new Dictionary<string, JsonValue>(value)); }
    }

    public sealed class LokiRequest
    {
        public const long ProtocolVersion = 1;
        public readonly long protocolVersion = ProtocolVersion;
        public readonly string operation;
        public readonly JsonValue.ObjectValue payload;

        public LokiRequest(string operation, IDictionary<string, JsonValue> payload)
        {
            this.operation = operation;
            this.payload = (JsonValue.ObjectValue)JsonValue.Object(payload);
        }
    }

    public interface ILokiTransport
    {
        Task<JsonValue> RequestAsync(LokiRequest request);
        Task ConnectAsync(Action<JsonValue.ObjectValue> onMessage);
        Task DisconnectAsync();
    }

    public sealed class AuthSession
    {
        public readonly string PlayerId;
        public readonly string AccessToken;
        public readonly string RefreshToken;
        public readonly long ExpiresAt;
        public AuthSession(string playerId, string accessToken, string refreshToken, long expiresAt)
        {
            PlayerId = playerId; AccessToken = accessToken; RefreshToken = refreshToken; ExpiresAt = expiresAt;
        }
    }

    public sealed class Room
    {
        public readonly string RoomId;
        public readonly string RoomKey;
        public readonly string HostId;
        public Room(string roomId, string roomKey, string hostId) { RoomId = roomId; RoomKey = roomKey; HostId = hostId; }
    }

    public sealed class InviteResolution
    {
        public readonly string ProjectId;
        public readonly string RoomId;
        public readonly string InviteToken;
        public InviteResolution(string projectId, string roomId, string inviteToken)
        {
            ProjectId = projectId; RoomId = roomId; InviteToken = inviteToken;
        }
    }

    public sealed class MatchTicket
    {
        public readonly string TicketId;
        public readonly string Status;
        public readonly string RoomId;
        public MatchTicket(string ticketId, string status, string roomId) { TicketId = ticketId; Status = status; RoomId = roomId; }
    }

    public sealed class LeaderboardRecord
    {
        public readonly string PlayerId;
        public readonly long Score;
        public readonly long Subscore;
        public readonly long Rank;
        public LeaderboardRecord(string playerId, long score, long subscore, long rank)
        {
            PlayerId = playerId; Score = score; Subscore = subscore; Rank = rank;
        }
    }

    public sealed class ServerEnvelope
    {
        public readonly long ProtocolVersion;
        public readonly string RoomId;
        public readonly long Sequence;
        public readonly string Type;
        public readonly IReadOnlyDictionary<string, JsonValue> Fields;

        public ServerEnvelope(JsonValue.ObjectValue value)
        {
            Fields = value.Value;
            ProtocolVersion = Fields.Long("protocolVersion");
            RoomId = Fields.String("roomId");
            Sequence = Fields.Long("sequence");
            Type = Fields.String("type");
        }
    }

    public sealed class LokiCallbacks
    {
        public Action<ServerEnvelope> OnEnvelope = delegate { };
        public Action<ServerEnvelope> OnAction = delegate { };
        public Action<ServerEnvelope> OnEvent = delegate { };
        public Action<ServerEnvelope> OnHostState = delegate { };
        public Action<ServerEnvelope> OnPresence = delegate { };
        public Action<ServerEnvelope> OnChat = delegate { };
        public Action<ServerEnvelope> OnLeaderboard = delegate { };
        public Action<Exception> OnDisconnected = delegate { };
        public Action<AuthSession> OnSessionRefreshed = delegate { };
        public Action OnReconnected = delegate { };
        public Action<string, string, long> OnHostMigrated = delegate { };
    }

    public sealed class JoinedRoom
    {
        public readonly string RoomId;
        public readonly string InviteCode;
        public readonly ServerEnvelope Snapshot;
        public JoinedRoom(string roomId, string inviteCode, ServerEnvelope snapshot)
        {
            RoomId = roomId; InviteCode = inviteCode; Snapshot = snapshot;
        }
    }

    public sealed class LokiClient
    {
        private readonly ILokiTransport transport;
        private readonly object gate = new object();
        private readonly SemaphoreSlim lifecycle = new SemaphoreSlim(1, 1);
        private AuthSession session;
        private string currentRoomId;
        private string currentInviteCode = "";
        private long sendSequence;
        private int lifecycleGeneration;
        private bool leaveFailed;
        private bool reconnecting;
        private int nextListenerId = 1;
        private readonly Dictionary<int, Action<ServerEnvelope>> messageListeners = new Dictionary<int, Action<ServerEnvelope>>();
        private readonly Dictionary<int, Action<string>> connectionListeners = new Dictionary<int, Action<string>>();
        public LokiCallbacks Callbacks { get; set; } = new LokiCallbacks();
        public string PlayerId { get { return session == null ? null : session.PlayerId; } }
        public string CurrentRoomId { get { return currentRoomId; } }
        public string CurrentInviteCode { get { return currentInviteCode; } }

        public LokiClient(ILokiTransport transport)
        {
            this.transport = transport ?? throw new ArgumentNullException(nameof(transport));
        }

        public Task ConnectAsync() { return transport.ConnectAsync(Receive); }

        public async Task DisconnectAsync()
        {
            await transport.DisconnectAsync();
            Callbacks.OnDisconnected(null);
        }

        public async Task<AuthSession> AuthenticateAsync(string token)
        {
            var fields = (await Call("auth.authenticate", Fields("token", JsonValue.From(token)))).AsObject();
            session = new AuthSession(
                fields.String("playerId"), fields.String("accessToken"),
                fields.OptionalString("refreshToken"), fields.Long("expiresAt"));
            return session;
        }

        public async Task<AuthSession> RefreshAsync()
        {
            if (session == null || session.RefreshToken == null) throw new InvalidOperationException("No refresh token is available");
            var fields = (await Call("auth.refresh", Fields("refreshToken", JsonValue.From(session.RefreshToken)))).AsObject();
            session = new AuthSession(
                fields.String("playerId"), fields.String("accessToken"),
                fields.OptionalString("refreshToken"), fields.Long("expiresAt"));
            Callbacks.OnSessionRefreshed(session);
            return session;
        }

        public async Task<Room> CreateRoomAsync(string roomKey, string visibility, long maxPlayers, long? teamSize = null, long tickRate = 10)
        {
            var payload = Fields(
                "roomKey", JsonValue.From(roomKey), "visibility", JsonValue.From(visibility),
                "maxPlayers", JsonValue.From(maxPlayers), "tickRate", JsonValue.From(tickRate));
            if (teamSize.HasValue) payload["teamSize"] = JsonValue.From(teamSize.Value);
            return ToRoom(await Call("rooms.create", payload));
        }

        public async Task<Room> JoinRoomAsync(string roomId, string inviteToken = null)
        {
            var payload = Fields("roomId", JsonValue.From(roomId));
            if (inviteToken != null) payload["inviteToken"] = JsonValue.From(inviteToken);
            return ToRoom(await Call("rooms.join", payload));
        }

        public Task<JsonValue> LeaveRoomAsync(string roomId) { return Call("rooms.leave", Fields("roomId", JsonValue.From(roomId))); }

        public async Task<InviteResolution> ResolveInviteAsync(string token)
        {
            return ToInvite(await Call("invites.resolve", Fields("token", JsonValue.From(token))));
        }

        public async Task<InviteResolution> ResolveDeepLinkAsync(string url)
        {
            return ToInvite(await Call("invites.resolve_deep_link", Fields("url", JsonValue.From(url))));
        }

        public async Task<MatchTicket> StartMatchmakingAsync(string roomKey, JsonValue properties = null)
        {
            var fields = (await Call("matchmaking.start", Fields(
                "roomKey", JsonValue.From(roomKey),
                "properties", properties ?? JsonValue.Object(new Dictionary<string, JsonValue>())))).AsObject();
            return new MatchTicket(fields.String("ticketId"), fields.String("status"), fields.OptionalString("roomId"));
        }

        public Task<JsonValue> CancelMatchmakingAsync(string ticketId)
        {
            return Call("matchmaking.cancel", Fields("ticketId", JsonValue.From(ticketId)));
        }

        public async Task ReconnectAsync(string roomId, long lastSequence)
        {
            await ConnectAsync();
            await Call("rooms.reconnect", Fields(
                "roomId", JsonValue.From(roomId), "lastSequence", JsonValue.From(lastSequence)));
            Callbacks.OnReconnected();
        }

        public Task<JsonValue> SendActionAsync(string roomId, long sequence, JsonValue payload, string actionId = null)
        {
            var fields = Fields("payload", payload);
            if (!string.IsNullOrEmpty(actionId)) fields["actionId"] = JsonValue.From(actionId);
            return SendEnvelope(roomId, sequence, "action", fields);
        }

        public Task<JsonValue> SendEventAsync(string roomId, long sequence, JsonValue payload, bool reliable = true)
        {
            return SendEnvelope(roomId, sequence, "event", Fields(
                "payload", payload, "reliable", JsonValue.From(reliable)));
        }

        public Task<JsonValue> PublishHostStateAsync(
            string roomId, long sequence, long expectedVersion, JsonValue state,
            long? expectedStateVersion = null, string actionId = null, string senderId = null)
        {
            var fields = Fields("expectedVersion", JsonValue.From(expectedVersion), "state", state);
            if (expectedStateVersion.HasValue) fields["expectedStateVersion"] = JsonValue.From(expectedStateVersion.Value);
            if (!string.IsNullOrEmpty(actionId)) fields["actionId"] = JsonValue.From(actionId);
            if (!string.IsNullOrEmpty(senderId)) fields["senderId"] = JsonValue.From(senderId);
            return SendEnvelope(roomId, sequence, "host_state", fields);
        }

        public Task<JsonValue> SendActionRejectAsync(
            string roomId, long sequence, string actionId, string outcome, string message, string senderId = null)
        {
            var fields = Fields(
                "actionId", JsonValue.From(actionId),
                "outcome", JsonValue.From(outcome),
                "message", JsonValue.From(message));
            if (!string.IsNullOrEmpty(senderId)) fields["senderId"] = JsonValue.From(senderId);
            return SendEnvelope(roomId, sequence, "action_reject", fields);
        }

        public Task<JsonValue> RequestSnapshotAsync(string roomId, long sequence)
        {
            return SendEnvelope(roomId, sequence, "snapshot_request", new Dictionary<string, JsonValue>());
        }

        public Task<JsonValue> SendChatAsync(string roomId, long sequence, string channel, string text)
        {
            return SendEnvelope(roomId, sequence, "chat", Fields(
                "channel", JsonValue.From(channel), "text", JsonValue.From(text)));
        }

        public Task<JsonValue> SubmitScoreAsync(string roomId, long sequence, string leaderboardId, long score, long subscore = 0)
        {
            return SendEnvelope(roomId, sequence, "score_submit", Fields(
                "leaderboardId", JsonValue.From(leaderboardId),
                "score", JsonValue.From(score), "subscore", JsonValue.From(subscore)));
        }

        public async Task<IReadOnlyList<LeaderboardRecord>> GetPrivateLeaderboardAsync(
            string roomId, string leaderboardId, long limit = 100)
        {
            var result = await Call("leaderboards.private", Fields(
                "roomId", JsonValue.From(roomId),
                "leaderboardId", JsonValue.From(leaderboardId),
                "limit", JsonValue.From(limit))) as JsonValue.ArrayValue;
            if (result == null) throw new InvalidOperationException("Expected leaderboard record array");
            var records = new List<LeaderboardRecord>();
            foreach (var item in result.Value)
            {
                var fields = item.AsObject();
                records.Add(new LeaderboardRecord(
                    fields.String("playerId"), fields.Long("score"),
                    fields.Long("subscore"), fields.Long("rank")));
            }
            return records;
        }

        public void Receive(JsonValue.ObjectValue value)
        {
            try
            {
                var envelope = new ServerEnvelope(value);
                if (envelope.ProtocolVersion != LokiRequest.ProtocolVersion)
                {
                    Callbacks.OnDisconnected(new InvalidOperationException("Unsupported protocol " + envelope.ProtocolVersion));
                    return;
                }
                Callbacks.OnEnvelope(envelope);
                List<Action<ServerEnvelope>> listeners;
                lock (gate) { listeners = new List<Action<ServerEnvelope>>(messageListeners.Values); }
                for (var i = 0; i < listeners.Count; i++)
                {
                    try { listeners[i](envelope); }
                    catch { }
                }
                switch (envelope.Type)
                {
                    case "action": Callbacks.OnAction(envelope); break;
                    case "event": Callbacks.OnEvent(envelope); break;
                    case "snapshot":
                    case "state": Callbacks.OnHostState(envelope); break;
                    case "presence": Callbacks.OnPresence(envelope); break;
                    case "chat": Callbacks.OnChat(envelope); break;
                    case "leaderboard": Callbacks.OnLeaderboard(envelope); break;
                    case "host_changed":
                        Callbacks.OnHostMigrated(
                            envelope.Fields.OptionalString("previousHostId"),
                            envelope.Fields.String("hostId"),
                            envelope.Fields.Long("stateVersion"));
                        break;
                }
            }
            catch (Exception error) { Callbacks.OnDisconnected(error); }
        }

        public int OnMessage(Action<ServerEnvelope> listener)
        {
            lock (gate)
            {
                var id = nextListenerId++;
                messageListeners[id] = listener;
                return id;
            }
        }

        public void RemoveMessageListener(int id) { lock (gate) { messageListeners.Remove(id); } }

        public int OnConnection(Action<string> listener)
        {
            lock (gate)
            {
                var id = nextListenerId++;
                connectionListeners[id] = listener;
                return id;
            }
        }

        public void RemoveConnectionListener(int id) { lock (gate) { connectionListeners.Remove(id); } }

        public void NotifyConnection(string eventName)
        {
            List<Action<string>> listeners;
            lock (gate) { listeners = new List<Action<string>>(connectionListeners.Values); }
            for (var i = 0; i < listeners.Count; i++)
            {
                try { listeners[i](eventName); }
                catch { }
            }
        }

        public Task<JoinedRoom> CreateSessionRoomAsync() { return EnterRoom("rooms.create", new Dictionary<string, JsonValue>()); }

        public Task<JoinedRoom> JoinSessionRoomAsync(string inviteCode)
        {
            return EnterRoom("rooms.join", Fields("inviteCode", JsonValue.From(inviteCode)));
        }

        public async Task LeaveCurrentRoomAsync(string explicitRoomId = null)
        {
            lifecycleGeneration += 1;
            var target = explicitRoomId ?? currentRoomId;
            if (target == null) return;
            try
            {
                await Call("rooms.leave", Fields("roomId", JsonValue.From(target)));
                if (currentRoomId == target)
                {
                    currentRoomId = null;
                    currentInviteCode = "";
                    sendSequence = 0;
                    leaveFailed = false;
                }
            }
            catch
            {
                if (currentRoomId == target || currentRoomId == null)
                {
                    currentRoomId = target;
                    leaveFailed = true;
                }
                throw;
            }
        }

        public async Task ReconnectCurrentRoomAsync()
        {
            if (reconnecting) return;
            reconnecting = true;
            try
            {
                if (leaveFailed) throw new InvalidOperationException("resolve the failed leave before reconnecting");
                if (currentRoomId == null) throw new InvalidOperationException("join a room before reconnecting");
                await Call("rooms.reconnect", Fields("roomId", JsonValue.From(currentRoomId)));
                await RequestSessionSnapshotAsync();
            }
            finally { reconnecting = false; }
        }

        public Task<JsonValue> SendSessionActionAsync(JsonValue payload, string actionId = null)
        {
            if (currentRoomId == null) throw new InvalidOperationException("join a room before sending actions");
            return SendActionAsync(currentRoomId, ++sendSequence, payload, actionId);
        }

        public Task<JsonValue> PublishSessionHostStateAsync(
            long expectedVersion, JsonValue state, long? expectedStateVersion = null, string actionId = null, string senderId = null)
        {
            if (currentRoomId == null) throw new InvalidOperationException("join a room before sending state");
            return PublishHostStateAsync(currentRoomId, ++sendSequence, expectedVersion, state, expectedStateVersion, actionId, senderId);
        }

        public Task<JsonValue> SendSessionActionRejectAsync(string actionId, string outcome, string message, string senderId = null)
        {
            if (currentRoomId == null) throw new InvalidOperationException("join a room before rejecting actions");
            return SendActionRejectAsync(currentRoomId, ++sendSequence, actionId, outcome, message, senderId);
        }

        public Task<JsonValue> RequestSessionSnapshotAsync()
        {
            if (currentRoomId == null) throw new InvalidOperationException("join a room before sending messages");
            return RequestSnapshotAsync(currentRoomId, ++sendSequence);
        }

        public SynchronizedRoom CreateSynchronizedRoom(JsonValue initialState, Func<JsonValue, JsonValue, ActionContext, JsonValue> reduce)
        {
            return new SynchronizedRoom(this, initialState, reduce);
        }

        private async Task<JoinedRoom> EnterRoom(string operation, IDictionary<string, JsonValue> payload)
        {
            await lifecycle.WaitAsync();
            try
            {
                if (leaveFailed) throw new InvalidOperationException("resolve the failed leave before joining another room");
                var generation = ++lifecycleGeneration;
                var fields = (await Call(operation, payload)).AsObject();
                var roomId = fields.String("roomId");
                var inviteCode = fields.OptionalString("inviteCode") ?? "";
                var snapshotValue = fields.ContainsKey("snapshot") ? fields["snapshot"] as JsonValue.ObjectValue : null;
                if (snapshotValue == null) throw new InvalidOperationException("invalid join snapshot");
                var snapshot = new ServerEnvelope(snapshotValue);
                if (snapshot.RoomId != roomId || snapshot.Type != "snapshot")
                {
                    try { await Call("rooms.leave", Fields("roomId", JsonValue.From(roomId))); } catch { }
                    throw new InvalidOperationException("invalid join snapshot");
                }
                if (generation != lifecycleGeneration)
                {
                    try { await Call("rooms.leave", Fields("roomId", JsonValue.From(roomId))); } catch { }
                    throw new InvalidOperationException("stale room join abandoned");
                }
                currentRoomId = roomId;
                currentInviteCode = inviteCode;
                sendSequence = 0;
                return new JoinedRoom(roomId, inviteCode, snapshot);
            }
            finally { lifecycle.Release(); }
        }

        private Task<JsonValue> SendEnvelope(string roomId, long sequence, string type, IDictionary<string, JsonValue> fields)
        {
            var envelope = new Dictionary<string, JsonValue>(fields)
            {
                ["protocolVersion"] = JsonValue.From(LokiRequest.ProtocolVersion),
                ["roomId"] = JsonValue.From(roomId),
                ["sequence"] = JsonValue.From(sequence),
                ["type"] = JsonValue.From(type)
            };
            return Call("rooms.send", Fields("envelope", JsonValue.Object(envelope)));
        }

        private Task<JsonValue> Call(string operation, IDictionary<string, JsonValue> payload)
        {
            return transport.RequestAsync(new LokiRequest(operation, payload));
        }

        private static Room ToRoom(JsonValue value)
        {
            var fields = value.AsObject();
            return new Room(fields.String("roomId"), fields.OptionalString("roomKey"), fields.OptionalString("hostId"));
        }

        private static InviteResolution ToInvite(JsonValue value)
        {
            var fields = value.AsObject();
            return new InviteResolution(fields.String("projectId"), fields.String("roomId"), fields.String("inviteToken"));
        }

        private static Dictionary<string, JsonValue> Fields(params object[] pairs)
        {
            var fields = new Dictionary<string, JsonValue>();
            for (var i = 0; i < pairs.Length; i += 2) fields[(string)pairs[i]] = (JsonValue)pairs[i + 1];
            return fields;
        }
    }

    public static class LokiJson
    {
        public static JsonValue Parse(string source) { return new Parser(source).Parse(); }

        private sealed class Parser
        {
            private readonly string source;
            private int index;
            internal Parser(string source) { this.source = source ?? throw new ArgumentNullException(nameof(source)); }

            internal JsonValue Parse()
            {
                var result = Value();
                WhiteSpace();
                if (index != source.Length) throw Error("Unexpected trailing JSON");
                return result;
            }

            private JsonValue Value()
            {
                WhiteSpace();
                if (index >= source.Length) throw Error("Unexpected end of JSON");
                switch (source[index])
                {
                    case '{': return ObjectValue();
                    case '[': return ArrayValue();
                    case '"': return JsonValue.From(String());
                    case 't': return Literal("true", JsonValue.From(true));
                    case 'f': return Literal("false", JsonValue.From(false));
                    case 'n': return Literal("null", JsonValue.Null);
                    default: return Number();
                }
            }

            private JsonValue ObjectValue()
            {
                index++;
                WhiteSpace();
                var fields = new Dictionary<string, JsonValue>();
                if (Take('}')) return JsonValue.Object(fields);
                while (true)
                {
                    WhiteSpace();
                    var key = String();
                    WhiteSpace();
                    Expect(':');
                    fields[key] = Value();
                    WhiteSpace();
                    if (Take('}')) return JsonValue.Object(fields);
                    Expect(',');
                }
            }

            private JsonValue ArrayValue()
            {
                index++;
                WhiteSpace();
                var values = new List<JsonValue>();
                if (Take(']')) return new JsonValue.ArrayValue(values);
                while (true)
                {
                    values.Add(Value());
                    WhiteSpace();
                    if (Take(']')) return new JsonValue.ArrayValue(values);
                    Expect(',');
                }
            }

            private string String()
            {
                Expect('"');
                var output = new StringBuilder();
                while (index < source.Length)
                {
                    var character = source[index++];
                    if (character == '"') return output.ToString();
                    if (character != '\\') { output.Append(character); continue; }
                    if (index >= source.Length) throw Error("Unterminated escape");
                    var escaped = source[index++];
                    switch (escaped)
                    {
                        case '"': case '\\': case '/': output.Append(escaped); break;
                        case 'b': output.Append('\b'); break;
                        case 'f': output.Append('\f'); break;
                        case 'n': output.Append('\n'); break;
                        case 'r': output.Append('\r'); break;
                        case 't': output.Append('\t'); break;
                        case 'u':
                            if (index + 4 > source.Length) throw Error("Invalid unicode escape");
                            output.Append((char)int.Parse(source.Substring(index, 4), NumberStyles.HexNumber));
                            index += 4;
                            break;
                        default: throw Error("Invalid JSON escape");
                    }
                }
                throw Error("Unterminated string");
            }

            private JsonValue Number()
            {
                var start = index;
                if (source[index] == '-') index++;
                while (index < source.Length && char.IsDigit(source[index])) index++;
                if (index == start || (index == start + 1 && source[start] == '-')) throw Error("Invalid number");
                if (index < source.Length && (source[index] == '.' || source[index] == 'e' || source[index] == 'E'))
                    throw Error("Protocol numbers must be integers");
                return JsonValue.From(long.Parse(source.Substring(start, index - start), CultureInfo.InvariantCulture));
            }

            private JsonValue Literal(string text, JsonValue result)
            {
                if (index + text.Length > source.Length || source.Substring(index, text.Length) != text)
                    throw Error("Invalid JSON literal");
                index += text.Length;
                return result;
            }

            private void WhiteSpace() { while (index < source.Length && char.IsWhiteSpace(source[index])) index++; }
            private void Expect(char character) { if (!Take(character)) throw Error("Expected '" + character + "'"); }
            private bool Take(char character)
            {
                if (index >= source.Length || source[index] != character) return false;
                index++;
                return true;
            }
            private FormatException Error(string message) { return new FormatException(message + " at " + index); }
        }
    }

    public static class JsonValueExtensions
    {
        public static IReadOnlyDictionary<string, JsonValue> AsObject(this JsonValue value)
        {
            var objectValue = value as JsonValue.ObjectValue;
            if (objectValue == null) throw new InvalidOperationException("Expected JSON object");
            return objectValue.Value;
        }

        public static string String(this IReadOnlyDictionary<string, JsonValue> fields, string key)
        {
            JsonValue value;
            if (!fields.TryGetValue(key, out value) || !(value is JsonValue.StringValue))
                throw new InvalidOperationException("Expected string '" + key + "'");
            return ((JsonValue.StringValue)value).Value;
        }

        public static string OptionalString(this IReadOnlyDictionary<string, JsonValue> fields, string key)
        {
            JsonValue value;
            if (!fields.TryGetValue(key, out value) || value is JsonValue.NullValue) return null;
            if (!(value is JsonValue.StringValue)) throw new InvalidOperationException("Expected optional string '" + key + "'");
            return ((JsonValue.StringValue)value).Value;
        }

        public static long Long(this IReadOnlyDictionary<string, JsonValue> fields, string key)
        {
            JsonValue value;
            if (!fields.TryGetValue(key, out value) || !(value is JsonValue.NumberValue))
                throw new InvalidOperationException("Expected integer '" + key + "'");
            return ((JsonValue.NumberValue)value).Value;
        }

        public static long? OptionalLong(this IReadOnlyDictionary<string, JsonValue> fields, string key)
        {
            JsonValue value;
            if (!fields.TryGetValue(key, out value) || value is JsonValue.NullValue) return null;
            var number = value as JsonValue.NumberValue;
            if (number == null) throw new InvalidOperationException("Expected optional integer '" + key + "'");
            return number.Value;
        }

    }
}
