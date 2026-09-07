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
        }
    }
}
