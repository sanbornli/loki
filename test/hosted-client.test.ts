// Validates createHostedLokiClient() against a fake window and a real
// MessageChannel, simulating the hosted shell's loki:init/loki:session
// bridge (see apps/web/src/player.ts) without a browser.
import assert from "node:assert/strict";
import test from "node:test";
import { createHostedLokiClient, type LokiTransport } from "../packages/sdk-js/src/index.js";

class FakeWindow {
  #listeners = new Set<(event: MessageEvent) => void>();

  addEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    if (type !== "message") return;
    this.#listeners.add(listener as (event: MessageEvent) => void);
  }

  removeEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    if (type !== "message") return;
    this.#listeners.delete(listener as (event: MessageEvent) => void);
  }

  dispatch(event: MessageEvent): void {
    for (const listener of this.#listeners) listener(event);
  }
}

// Simulates the parent shell's side of the bridge (see apps/web/src/player.ts):
// listens on port1 for a loki:session request and replies with a session.
function simulateHostedShell(port: MessagePort, nonce: string, session: { token: string; playerId: string }): void {
  port.onmessage = (event) => {
    const data = event.data as { type?: string; nonce?: string; requestId?: string };
    if (data.nonce !== nonce) return;
    if (data.type === "loki:session") {
      port.postMessage({ type: "loki:session", nonce, requestId: data.requestId, session });
    }
  };
  port.start();
}

test("createHostedLokiClient installs the loki:init listener, replies loki:ready, and authenticates over the session bridge", async () => {
  const fakeWindow = new FakeWindow();
  const nonce = "test-nonce";
  const channel = new MessageChannel();
  simulateHostedShell(channel.port1, nonce, { token: "session-token", playerId: "player-1" });

  const readyMessages: unknown[] = [];
  const originalOnMessage = channel.port1.onmessage;
  channel.port1.onmessage = (event) => {
    const data = event.data as { type?: string };
    if (data.type === "loki:ready") readyMessages.push(data);
    else originalOnMessage?.call(channel.port1, event);
  };

  const clientPromise = createHostedLokiClient({
    projectId: "00000000-0000-4000-8000-000000000001",
    windowRef: fakeWindow,
    // Avoid a real Nakama socket connection in this unit test: exercise
    // the loki:init/loki:ready/loki:session handshake, then hand the
    // resulting sessionProvider to a fake transport instead of the real
    // FirstPartyTransport.
    createTransport: (sessionProvider) => ({
      authenticate: async (token) => {
        const session = await sessionProvider!(token);
        return { playerId: session.playerId };
      },
      createRoom: async () => {
        throw new Error("not used in this test");
      },
      joinRoom: async () => {
        throw new Error("not used in this test");
      },
      leaveRoom: async () => undefined,
      send: async () => undefined,
      subscribe: () => () => undefined,
      close: async () => undefined,
    }),
  });

  fakeWindow.dispatch(
    new MessageEvent("message", {
      data: { type: "loki:init", protocolVersion: 1, nonce },
      ports: [channel.port2],
    }),
  );

  const client = await clientPromise;
  assert.equal(client.playerId, "player-1");
  assert.equal(readyMessages.length, 1);
  channel.port1.close();
  channel.port2.close();
});

test("createHostedLokiClient falls back to an explicit transport when no loki:init arrives", async () => {
  const fakeWindow = new FakeWindow();
  let authenticateCalled = false;
  const fallbackTransport: LokiTransport = {
    authenticate: async () => {
      authenticateCalled = true;
      return { playerId: "fallback-player" };
    },
    createRoom: async () => {
      throw new Error("not used in this test");
    },
    joinRoom: async () => {
      throw new Error("not used in this test");
    },
    leaveRoom: async () => undefined,
    send: async () => undefined,
    subscribe: () => () => undefined,
    close: async () => undefined,
  };

  const client = await createHostedLokiClient({
    projectId: "00000000-0000-4000-8000-000000000001",
    windowRef: fakeWindow,
    timeoutMs: 30,
    fallbackTransport,
  });

  assert.equal(authenticateCalled, true);
  assert.equal(client.playerId, "fallback-player");
});

test("createHostedLokiClient throws a clear error when no handshake arrives and no fallback is configured", async () => {
  const fakeWindow = new FakeWindow();
  await assert.rejects(
    createHostedLokiClient({
      projectId: "00000000-0000-4000-8000-000000000001",
      windowRef: fakeWindow,
      timeoutMs: 30,
    }),
    /no loki:init handshake|fallbackTransport/,
  );
});
