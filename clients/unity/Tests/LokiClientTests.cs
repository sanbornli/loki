using System;
using System.Collections.Generic;
using System.IO;
using System.Threading.Tasks;
using NUnit.Framework;
using UnityEditor.PackageManager;

namespace Loki.Play.SDK.Tests
{
    internal sealed class RecordingTransport : ILokiTransport
    {
        internal readonly List<LokiRequest> Requests = new List<LokiRequest>();
        public Task<JsonValue> RequestAsync(LokiRequest request)
        {
            Requests.Add(request);
            switch (request.operation)
            {
                case "auth.authenticate":
                    return Task.FromResult(LokiJson.Parse(
                        "{\"playerId\":\"p1\",\"accessToken\":\"access\",\"refreshToken\":\"refresh\",\"expiresAt\":100}"));
                case "rooms.join":
                    return Task.FromResult(LokiJson.Parse(
                        "{\"roomId\":\"room-1\",\"roomKey\":\"duel\",\"hostId\":\"p1\"}"));
                default:
                    return Task.FromResult(JsonValue.Object(new Dictionary<string, JsonValue>()));
            }
        }
        public Task ConnectAsync(Action<JsonValue.ObjectValue> onMessage) { return Task.CompletedTask; }
        public Task DisconnectAsync() { return Task.CompletedTask; }
    }

    public sealed class LokiClientTests
    {
        [Test]
        public void FixtureDecodesAsRealJson()
        {
            var package = PackageInfo.FindForAssembly(typeof(LokiClient).Assembly);
            var source = File.ReadAllText(Path.Combine(package.resolvedPath, "Tests", "Fixtures", "conformance.json"));
            var root = LokiJson.Parse(source).AsObject();
            var canonical = root["canonicalState"].AsObject();
            Assert.AreEqual(
                "039c5612a00a3ea03835619893ad0b6ddadcf6e331a0b1be69e0ad89fb5e676c",
                canonical.String("sha256"));
        }

        [Test]
        public void RequestsAndReplaysEnvelope()
        {
            var transport = new RecordingTransport();
            var client = new LokiClient(transport);
            var session = client.AuthenticateAsync("guest").GetAwaiter().GetResult();
            Assert.AreEqual("p1", session.PlayerId);
            client.JoinRoomAsync("room-1").GetAwaiter().GetResult();

            long? snapshotSequence = null;
            string migratedHost = null;
            client.Callbacks.OnHostState = envelope => snapshotSequence = envelope.Sequence;
            client.Callbacks.OnHostMigrated = (_, host, __) => migratedHost = host;

            var package = PackageInfo.FindForAssembly(typeof(LokiClient).Assembly);
            var source = File.ReadAllText(Path.Combine(package.resolvedPath, "Tests", "Fixtures", "conformance.json"));
            var replay = (JsonValue.ArrayValue)LokiJson.Parse(source).AsObject()["serverReplay"];
            foreach (var value in replay.Value) client.Receive((JsonValue.ObjectValue)value);

            Assert.AreEqual(0, snapshotSequence);
            Assert.AreEqual("00000000-0000-4000-8000-000000000003", migratedHost);
            CollectionAssert.AreEqual(
                new[] { "auth.authenticate", "rooms.join" },
                transport.Requests.ConvertAll(request => request.operation));

            client.SendActionAsync("room-1", 1, JsonValue.Object(new Dictionary<string, JsonValue>
            {
                { "move", JsonValue.From(1) },
            }), "fixture_action_1").GetAwaiter().GetResult();
            client.PublishHostStateAsync(
                "room-1", 2, 0, JsonValue.Object(new Dictionary<string, JsonValue>
                {
                    { "tick", JsonValue.From(1) },
                }), 0, "fixture_action_1").GetAwaiter().GetResult();
            client.SendActionRejectAsync("room-1", 4, "fixture_action_2", "rejected", "action rejected")
                .GetAwaiter().GetResult();
            var encoded = transport.Requests.GetRange(transport.Requests.Count - 3, 3).ConvertAll(request =>
                request.payload.Value["envelope"].AsObject());
            Assert.AreEqual("action", encoded[0].String("type"));
            Assert.AreEqual("fixture_action_1", encoded[0].String("actionId"));
            Assert.AreEqual("host_state", encoded[1].String("type"));
            Assert.AreEqual(0, encoded[1].Long("expectedStateVersion"));
            Assert.AreEqual("action_reject", encoded[2].String("type"));
            Assert.AreEqual("fixture_action_2", encoded[2].String("actionId"));
        }

        [Test]
        public void SynchronizedRoomsConvergeAndRetainFailedLeave()
        {
            var world = new MemoryWorld();
            var hostTransport = new MemoryRoomTransport(world);
            var memberTransport = new MemoryRoomTransport(world);
            var host = new LokiClient(hostTransport);
            var member = new LokiClient(memberTransport);
            host.AuthenticateAsync("host").GetAwaiter().GetResult();
            host.ConnectAsync().GetAwaiter().GetResult();
            member.AuthenticateAsync("member").GetAwaiter().GetResult();
            member.ConnectAsync().GetAwaiter().GetResult();
            var hostRoom = host.CreateSynchronizedRoom(CounterState(), ReduceCounter);
            var memberRoom = member.CreateSynchronizedRoom(CounterState(), ReduceCounter);
            var created = hostRoom.CreateAsync().GetAwaiter().GetResult();
            memberRoom.JoinAsync(created.InviteCode).GetAwaiter().GetResult();
            memberRoom.DispatchAsync(Delta(3)).GetAwaiter().GetResult();
            Assert.AreEqual(3, CounterValue(hostRoom.GetSnapshot().State));
            Assert.AreEqual(3, CounterValue(memberRoom.GetSnapshot().State));
            Assert.IsTrue(hostRoom.IsHost);
            Assert.IsFalse(memberRoom.IsHost);

            hostTransport.FailNextLeave();
            try
            {
                hostRoom.LeaveAsync().GetAwaiter().GetResult();
                Assert.Fail("leave should fail");
            }
            catch
            {
                Assert.AreEqual(ConnectionState.LeaveFailed, hostRoom.GetSnapshot().Connection);
            }
            Assert.IsNotNull(host.CurrentRoomId);
            hostRoom.LeaveAsync().GetAwaiter().GetResult();
            Assert.AreEqual(ConnectionState.Closed, hostRoom.GetSnapshot().Connection);
        }

        [Test]
        public void LeaveWinsStaleSnapshotAuthorityAndDuplicate()
        {
            var world = new MemoryWorld();
            var transport = new MemoryRoomTransport(world);
            var client = new LokiClient(transport);
            client.AuthenticateAsync("host").GetAwaiter().GetResult();
            client.ConnectAsync().GetAwaiter().GetResult();
            var room = client.CreateSynchronizedRoom(CounterState(), ReduceCounter);
            room.CreateAsync().GetAwaiter().GetResult();
            room.DispatchAsync(Delta(4)).GetAwaiter().GetResult();
            transport.InjectStaleSnapshot();
            Assert.AreEqual(4, CounterValue(room.GetSnapshot().State));
            Assert.AreEqual(2, room.GetSnapshot().StateVersion);

            var memberTransport = new MemoryRoomTransport(world);
            var member = new LokiClient(memberTransport);
            member.AuthenticateAsync("member").GetAwaiter().GetResult();
            member.ConnectAsync().GetAwaiter().GetResult();
            var memberRoom = member.CreateSynchronizedRoom(CounterState(), ReduceCounter);
            memberTransport.EmitUnseenDuplicateOnce();
            memberRoom.JoinAsync(room.GetSnapshot().InviteCode).GetAwaiter().GetResult();
            memberRoom.DispatchAsync(Delta(1)).GetAwaiter().GetResult();
            Assert.AreEqual(5, CounterValue(memberRoom.GetSnapshot().State));

            var holdTransport = new MemoryRoomTransport(world);
            holdTransport.HoldNextEnter();
            var second = new LokiClient(holdTransport);
            second.AuthenticateAsync("late").GetAwaiter().GetResult();
            second.ConnectAsync().GetAwaiter().GetResult();
            var lateRoom = second.CreateSynchronizedRoom(CounterState(), (state, action, context) => state);
            var joining = lateRoom.JoinAsync(room.GetSnapshot().InviteCode);
            holdTransport.WaitUntilHeld();
            var leaving = lateRoom.LeaveAsync();
            holdTransport.ReleaseEnter();
            try { joining.GetAwaiter().GetResult(); } catch { }
            try { leaving.GetAwaiter().GetResult(); } catch { }
            var connection = lateRoom.GetSnapshot().Connection;
            Assert.IsTrue(
                connection == ConnectionState.Closed ||
                connection == ConnectionState.Failed ||
                connection == ConnectionState.LeaveFailed);
        }

        [Test]
        public void ListenerIsolationReconnectAndHostMigration()
        {
            var world = new MemoryWorld();
            var hostTransport = new MemoryRoomTransport(world);
            var memberTransport = new MemoryRoomTransport(world);
            var host = new LokiClient(hostTransport);
            var member = new LokiClient(memberTransport);
            host.AuthenticateAsync("host").GetAwaiter().GetResult();
            host.ConnectAsync().GetAwaiter().GetResult();
            member.AuthenticateAsync("member").GetAwaiter().GetResult();
            member.ConnectAsync().GetAwaiter().GetResult();
            host.OnMessage(_ => { throw new InvalidOperationException("isolated listener"); });
            var hostRoom = host.CreateSynchronizedRoom(CounterState(), ReduceCounter);
            var memberRoom = member.CreateSynchronizedRoom(CounterState(), ReduceCounter);
            var created = hostRoom.CreateAsync().GetAwaiter().GetResult();
            memberRoom.JoinAsync(created.InviteCode).GetAwaiter().GetResult();
            hostRoom.DispatchAsync(Delta(5)).GetAwaiter().GetResult();
            hostRoom.LeaveAsync().GetAwaiter().GetResult();
            memberRoom.DispatchAsync(Delta(1)).GetAwaiter().GetResult();
            Assert.AreEqual(6, CounterValue(memberRoom.GetSnapshot().State));
            Assert.IsTrue(memberRoom.IsHost);

            var isolated = new LokiClient(new MemoryRoomTransport(world));
            isolated.AuthenticateAsync("iso").GetAwaiter().GetResult();
            isolated.ConnectAsync().GetAwaiter().GetResult();
            isolated.OnMessage(_ => { throw new InvalidOperationException("isolated"); });
            var isolatedRoom = isolated.CreateSynchronizedRoom(CounterState(), ReduceCounter);
            isolatedRoom.CreateAsync().GetAwaiter().GetResult();
            isolatedRoom.DispatchAsync(Delta(1)).GetAwaiter().GetResult();
            isolated.NotifyConnection("reconnect_failed");
            Assert.AreEqual(ConnectionState.Failed, isolatedRoom.GetSnapshot().Connection);
        }

        private static JsonValue CounterState()
        {
            return JsonValue.Object(new Dictionary<string, JsonValue> { { "n", JsonValue.From(0) } });
        }

        private static JsonValue Delta(long value)
        {
            return JsonValue.Object(new Dictionary<string, JsonValue> { { "d", JsonValue.From(value) } });
        }

        private static JsonValue ReduceCounter(JsonValue state, JsonValue action, ActionContext context)
        {
            var n = state.AsObject()["n"] as JsonValue.NumberValue;
            var d = action.AsObject()["d"] as JsonValue.NumberValue;
            if (n == null || d == null) return state;
            return JsonValue.Object(new Dictionary<string, JsonValue> { { "n", JsonValue.From(n.Value + d.Value) } });
        }

        private static long CounterValue(JsonValue state)
        {
            return ((JsonValue.NumberValue)state.AsObject()["n"]).Value;
        }
    }

    internal sealed class MemoryRoom
    {
        internal string RoomId;
        internal string InviteCode;
        internal string HostId;
        internal long Version;
        internal long Sequence;
        internal JsonValue State;
        internal readonly Dictionary<string, JsonValue> Members = new Dictionary<string, JsonValue>();
    }

    internal sealed class MemoryWorld
    {
        private readonly object gate = new object();
        internal readonly Dictionary<string, MemoryRoom> Rooms = new Dictionary<string, MemoryRoom>();
        internal readonly Dictionary<string, string> Invites = new Dictionary<string, string>();
        internal readonly Dictionary<string, List<Action<JsonValue.ObjectValue>>> Listeners =
            new Dictionary<string, List<Action<JsonValue.ObjectValue>>>();

        internal void Set(MemoryRoom room)
        {
            lock (gate)
            {
                Rooms[room.RoomId] = room;
                Invites[room.InviteCode] = room.RoomId;
            }
        }

        internal MemoryRoom Room(string id)
        {
            lock (gate)
            {
                MemoryRoom room;
                return Rooms.TryGetValue(id, out room) ? room : null;
            }
        }

        internal MemoryRoom RoomByInvite(string invite)
        {
            lock (gate)
            {
                string id;
                MemoryRoom room;
                if (!Invites.TryGetValue(invite, out id) || !Rooms.TryGetValue(id, out room))
                    throw new InvalidOperationException("invite not found");
                return room;
            }
        }

        internal void Register(string roomId, Action<JsonValue.ObjectValue> listener)
        {
            lock (gate)
            {
                List<Action<JsonValue.ObjectValue>> list;
                if (!Listeners.TryGetValue(roomId, out list))
                {
                    list = new List<Action<JsonValue.ObjectValue>>();
                    Listeners[roomId] = list;
                }
                list.Add(listener);
            }
        }

        internal void Broadcast(string roomId, Dictionary<string, JsonValue> fields)
        {
            var envelope = (JsonValue.ObjectValue)JsonValue.Object(fields);
            List<Action<JsonValue.ObjectValue>> targets;
            lock (gate)
            {
                List<Action<JsonValue.ObjectValue>> list;
                targets = Listeners.TryGetValue(roomId, out list)
                    ? new List<Action<JsonValue.ObjectValue>>(list)
                    : new List<Action<JsonValue.ObjectValue>>();
            }
            for (var i = 0; i < targets.Count; i++) targets[i](envelope);
        }
    }

    internal sealed class MemoryRoomTransport : ILokiTransport
    {
        private readonly MemoryWorld world;
        private string playerId;
        private string roomId;
        private Action<JsonValue.ObjectValue> listener;
        private bool failLeave;
        private bool holding;
        private TaskCompletionSource<bool> enterHold;
        private bool unseenDuplicate;
        private bool parked;

        internal MemoryRoomTransport(MemoryWorld world) { this.world = world; }

        public Task<JsonValue> RequestAsync(LokiRequest request)
        {
            switch (request.operation)
            {
                case "auth.authenticate":
                    playerId = Guid.NewGuid().ToString();
                    return Task.FromResult(JsonValue.Object(new Dictionary<string, JsonValue>
                    {
                        { "playerId", JsonValue.From(playerId) },
                        { "accessToken", JsonValue.From("a") },
                        { "refreshToken", JsonValue.From("r") },
                        { "expiresAt", JsonValue.From(1) },
                    }));
                case "rooms.create":
                    return EnterCreate();
                case "rooms.join":
                    return EnterJoin(request.payload.Value.String("inviteCode"));
                case "rooms.leave":
                    if (failLeave)
                    {
                        failLeave = false;
                        return Task.FromException<JsonValue>(new InvalidOperationException("leave failed"));
                    }
                    LeaveRoom();
                    return Task.FromResult(JsonValue.Object(new Dictionary<string, JsonValue>()));
                case "rooms.reconnect":
                    return Task.FromResult(JsonValue.Object(new Dictionary<string, JsonValue>()));
                case "rooms.send":
                    Handle(request.payload.Value["envelope"].AsObject());
                    return Task.FromResult(JsonValue.Object(new Dictionary<string, JsonValue>()));
                default:
                    return Task.FromResult(JsonValue.Object(new Dictionary<string, JsonValue>()));
            }
        }

        public Task ConnectAsync(Action<JsonValue.ObjectValue> onMessage)
        {
            listener = onMessage;
            return Task.CompletedTask;
        }

        public Task DisconnectAsync()
        {
            listener = null;
            return Task.CompletedTask;
        }

        internal void FailNextLeave() { failLeave = true; }
        internal void HoldNextEnter()
        {
            holding = true;
            parked = false;
            enterHold = new TaskCompletionSource<bool>(TaskCreationOptions.RunContinuationsAsynchronously);
        }
        internal void EmitUnseenDuplicateOnce() { unseenDuplicate = true; }
        internal void WaitUntilHeld()
        {
            var started = DateTime.UtcNow;
            while (holding && !parked)
            {
                if ((DateTime.UtcNow - started).TotalSeconds > 2) break;
                System.Threading.Thread.Sleep(1);
            }
        }
        internal void ReleaseEnter()
        {
            holding = false;
            if (enterHold != null) enterHold.TrySetResult(true);
            enterHold = null;
        }

        internal void InjectStaleSnapshot()
        {
            if (roomId == null) return;
            var room = world.Room(roomId);
            if (room == null) return;
            world.Broadcast(roomId, Snapshot(room, Math.Max(0, room.Version - 1), JsonValue.Object(new Dictionary<string, JsonValue>
            {
                { "n", JsonValue.From(-1) },
            })));
        }

        private async Task<JsonValue> EnterCreate()
        {
            if (holding && enterHold != null)
            {
                parked = true;
                await enterHold.Task;
            }
            var id = Guid.NewGuid().ToString();
            var invite = id.Replace("-", "").Substring(0, 16).ToUpperInvariant();
            var room = new MemoryRoom
            {
                RoomId = id,
                InviteCode = invite,
                HostId = playerId,
                State = JsonValue.Object(new Dictionary<string, JsonValue>()),
            };
            room.Members[playerId] = Member(playerId, true);
            world.Set(room);
            roomId = id;
            if (listener != null) world.Register(id, listener);
            return Joined(room);
        }

        private async Task<JsonValue> EnterJoin(string invite)
        {
            if (holding && enterHold != null)
            {
                parked = true;
                await enterHold.Task;
            }
            var room = world.RoomByInvite(invite);
            room.Members[playerId] = Member(playerId, false);
            world.Set(room);
            roomId = room.RoomId;
            if (listener != null) world.Register(room.RoomId, listener);
            return Joined(room);
        }

        private void LeaveRoom()
        {
            if (roomId == null || playerId == null)
            {
                roomId = null;
                return;
            }
            var room = world.Room(roomId);
            if (room == null)
            {
                roomId = null;
                return;
            }
            room.Members.Remove(playerId);
            if (room.HostId == playerId)
            {
                var previous = room.HostId;
                var next = "";
                foreach (var key in room.Members.Keys) { next = key; break; }
                room.HostId = next;
                room.Sequence += 1;
                world.Set(room);
                world.Broadcast(room.RoomId, new Dictionary<string, JsonValue>
                {
                    { "protocolVersion", JsonValue.From(1) },
                    { "roomId", JsonValue.From(room.RoomId) },
                    { "sequence", JsonValue.From(room.Sequence) },
                    { "type", JsonValue.From("host_changed") },
                    { "previousHostId", JsonValue.From(previous) },
                    { "hostId", JsonValue.From(room.HostId) },
                    { "stateVersion", JsonValue.From(room.Version) },
                });
            }
            else world.Set(room);
            roomId = null;
        }

        private void Handle(IReadOnlyDictionary<string, JsonValue> envelope)
        {
            if (roomId == null) return;
            var room = world.Room(roomId);
            if (room == null) return;
            var type = envelope.OptionalString("type");
            if (type == "snapshot_request")
            {
                room.Sequence += 1;
                world.Set(room);
                world.Broadcast(room.RoomId, Snapshot(room, null, null));
                return;
            }
            if (type == "host_state")
            {
                JsonValue next;
                room.State = envelope.TryGetValue("state", out next) ? next : room.State;
                room.Version += 1;
                room.Sequence += 1;
                world.Set(room);
                world.Broadcast(room.RoomId, State(room, envelope.OptionalString("actionId"), envelope.OptionalString("senderId")));
                return;
            }
            if (type == "action")
            {
                var actionId = envelope.OptionalString("actionId");
                if (actionId == null) return;
                if (unseenDuplicate)
                {
                    unseenDuplicate = false;
                    room.Sequence += 1;
                    world.Set(room);
                    if (listener != null)
                    {
                        listener((JsonValue.ObjectValue)JsonValue.Object(new Dictionary<string, JsonValue>
                        {
                            { "protocolVersion", JsonValue.From(1) },
                            { "roomId", JsonValue.From(room.RoomId) },
                            { "sequence", JsonValue.From(room.Sequence) },
                            { "type", JsonValue.From("error") },
                            { "code", JsonValue.From("INVALID_MESSAGE") },
                            { "message", JsonValue.From("duplicate action") },
                            { "actionId", JsonValue.From(actionId) },
                            { "senderId", JsonValue.From(playerId) },
                        }));
                    }
                }
                room.Sequence += 1;
                world.Set(room);
                JsonValue payload;
                world.Broadcast(room.RoomId, new Dictionary<string, JsonValue>
                {
                    { "protocolVersion", JsonValue.From(1) },
                    { "roomId", JsonValue.From(room.RoomId) },
                    { "sequence", JsonValue.From(room.Sequence) },
                    { "type", JsonValue.From("action") },
                    { "senderId", JsonValue.From(playerId) },
                    { "actionId", JsonValue.From(actionId) },
                    { "payload", envelope.TryGetValue("payload", out payload) ? payload : JsonValue.Null },
                });
            }
        }

        private JsonValue Joined(MemoryRoom room)
        {
            return JsonValue.Object(new Dictionary<string, JsonValue>
            {
                { "roomId", JsonValue.From(room.RoomId) },
                { "inviteCode", JsonValue.From(room.InviteCode) },
                { "snapshot", JsonValue.Object(Snapshot(room, null, null)) },
            });
        }

        private static Dictionary<string, JsonValue> Snapshot(MemoryRoom room, long? version, JsonValue state)
        {
            var members = new List<JsonValue>();
            foreach (var item in room.Members.Values) members.Add(item);
            return new Dictionary<string, JsonValue>
            {
                { "protocolVersion", JsonValue.From(1) },
                { "roomId", JsonValue.From(room.RoomId) },
                { "sequence", JsonValue.From(room.Sequence) },
                { "type", JsonValue.From("snapshot") },
                { "hostId", JsonValue.From(room.HostId) },
                { "state", state ?? room.State },
                { "stateVersion", JsonValue.From(version ?? room.Version) },
                { "members", new JsonValue.ArrayValue(members) },
                { "capabilities", JsonValue.Object(new Dictionary<string, JsonValue>
                    {
                        { "synchronized_rooms", JsonValue.From(true) },
                        { "minimumProtocolVersion", JsonValue.From(1) },
                    })
                },
            };
        }

        private static Dictionary<string, JsonValue> State(MemoryRoom room, string actionId, string senderId)
        {
            var fields = new Dictionary<string, JsonValue>
            {
                { "protocolVersion", JsonValue.From(1) },
                { "roomId", JsonValue.From(room.RoomId) },
                { "sequence", JsonValue.From(room.Sequence) },
                { "type", JsonValue.From("state") },
                { "hostId", JsonValue.From(room.HostId) },
                { "state", room.State },
                { "stateVersion", JsonValue.From(room.Version) },
            };
            if (actionId != null) fields["actionId"] = JsonValue.From(actionId);
            if (senderId != null) fields["senderId"] = JsonValue.From(senderId);
            return fields;
        }

        private static JsonValue Member(string playerId, bool host)
        {
            return JsonValue.Object(new Dictionary<string, JsonValue>
            {
                { "playerId", JsonValue.From(playerId) },
                { "sessionId", JsonValue.From(playerId) },
                { "joinedAt", JsonValue.From(0) },
                { "host", JsonValue.From(host) },
            });
        }
    }
}
