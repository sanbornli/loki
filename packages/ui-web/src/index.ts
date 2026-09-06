export interface OverlayState {
  connected: boolean;
  roomCode?: string;
  players: Array<{ id: string; name: string; host: boolean }>;
  messages: Array<{ id: string; author: string; text: string }>;
}

export class LokiOverlayElement extends HTMLElement {
  #state: OverlayState = { connected: false, players: [], messages: [] };
  readonly #root = this.attachShadow({ mode: "closed" });

  connectedCallback(): void {
    this.#render();
  }

  set state(value: OverlayState) {
    this.#state = structuredClone(value);
    this.#render();
  }

  get state(): OverlayState {
    return structuredClone(this.#state);
  }

  #render(): void {
    const state = this.#state;
    this.#root.innerHTML = `
      <style>
        :host{position:fixed;right:16px;top:16px;z-index:2147483647;color:#fafafa;font:14px system-ui}
        aside{width:260px;max-height:calc(100vh - 32px);overflow:auto;background:#18181beF;border:1px solid #3f3f46;border-radius:12px;padding:12px;box-shadow:0 12px 36px #0008}
        header{display:flex;justify-content:space-between;align-items:center}
        .status{color:${state.connected ? "#86efac" : "#fca5a5"}}
        ul{list-style:none;padding:0;margin:8px 0}
        li{padding:4px 0}
        .chat{border-top:1px solid #3f3f46;margin-top:8px;padding-top:8px}
        form{display:flex;gap:6px}
        input{min-width:0;flex:1;background:#27272a;color:white;border:1px solid #52525b;border-radius:6px;padding:6px}
        button{background:#7c3aed;color:white;border:0;border-radius:6px;padding:6px 10px}
      </style>
      <aside aria-label="Loki multiplayer">
        <header>
          <strong>Loki</strong>
          <span class="status">${state.connected ? "Connected" : "Offline"}</span>
        </header>
        ${state.roomCode ? `<p>Room <strong>${this.#escape(state.roomCode)}</strong> <button id="copy">Copy invite</button></p>` : ""}
        <strong>Players (${state.players.length})</strong>
        <ul>${state.players
          .map(
            (player) =>
              `<li>${this.#escape(player.name)}${player.host ? " 👑" : ""}</li>`,
          )
          .join("")}</ul>
        <div class="chat" aria-live="polite">
          ${state.messages
            .slice(-20)
            .map(
              (message) =>
                `<p><strong>${this.#escape(message.author)}:</strong> ${this.#escape(message.text)}</p>`,
            )
            .join("")}
        </div>
        <form id="chat-form">
          <input id="chat-input" maxlength="500" aria-label="Chat message" autocomplete="off">
          <button type="submit">Send</button>
        </form>
      </aside>`;
    this.#root.querySelector("#copy")?.addEventListener("click", () => {
      if (state.roomCode) {
        void navigator.clipboard.writeText(state.roomCode);
        this.dispatchEvent(new CustomEvent("loki-invite-copied"));
      }
    });
    this.#root.querySelector("#chat-form")?.addEventListener("submit", (event) => {
      event.preventDefault();
      const input = this.#root.querySelector<HTMLInputElement>("#chat-input");
      const text = input?.value.trim();
      if (!input || !text) return;
      this.dispatchEvent(
        new CustomEvent("loki-chat-send", { detail: { text } }),
      );
      input.value = "";
    });
    this.#root.addEventListener("keydown", (event) => {
      if (event instanceof KeyboardEvent && event.key === "Escape") {
        this.dispatchEvent(new CustomEvent("loki-focus-release"));
      }
    });
  }

  #escape(value: string): string {
    const node = document.createElement("span");
    node.textContent = value;
    return node.innerHTML;
  }
}

export function registerLokiOverlay(): void {
  if (!customElements.get("loki-overlay")) {
    customElements.define("loki-overlay", LokiOverlayElement);
  }
}

export interface BindOverlayOptions {
  roomCode?: string;
  headless?: boolean;
  playerName?(playerId: string): string;
  releaseFocus?(): void;
}

export interface OverlayClient {
  onMessage(listener: (message: any) => void): () => void;
  sendChat(text: string): Promise<void>;
}

export function bindLokiOverlay(
  client: OverlayClient,
  options: BindOverlayOptions = {},
): { element?: LokiOverlayElement; destroy(): void } {
  const state: OverlayState = {
    connected: true,
    roomCode: options.roomCode,
    players: [],
    messages: [],
  };
  let element: LokiOverlayElement | undefined;
  if (!options.headless) {
    registerLokiOverlay();
    element = document.createElement("loki-overlay") as LokiOverlayElement;
    element.state = state;
    document.body.append(element);
  }
  const render = (): void => {
    if (element) element.state = state;
  };
  const unsubscribe = client.onMessage((message) => {
    if (message.type === "presence") {
      state.players = message.members.map((presence: {
        playerId: string;
        host: boolean;
      }) => ({
        id: presence.playerId,
        name: options.playerName?.(presence.playerId) ?? presence.playerId,
        host: presence.host,
      }));
    } else if (message.type === "host_changed") {
      state.players = state.players.map((player) => ({
        ...player,
        host: player.id === message.hostId,
      }));
    } else if (message.type === "chat") {
      state.messages.push({
        id: message.messageId,
        author: options.playerName?.(message.senderId) ?? message.senderId,
        text: message.text,
      });
      state.messages = state.messages.slice(-100);
    } else if (message.type === "room_closed") {
      state.connected = false;
    }
    render();
  });
  const sendChat = (event: Event): void => {
    const text = (event as CustomEvent<{ text?: string }>).detail?.text;
    if (text) void client.sendChat(text).catch(() => undefined);
  };
  const releaseFocus = (): void => options.releaseFocus?.();
  element?.addEventListener("loki-chat-send", sendChat);
  element?.addEventListener("loki-focus-release", releaseFocus);
  return {
    element,
    destroy() {
      unsubscribe();
      element?.removeEventListener("loki-chat-send", sendChat);
      element?.removeEventListener("loki-focus-release", releaseFocus);
      element?.remove();
    },
  };
}
