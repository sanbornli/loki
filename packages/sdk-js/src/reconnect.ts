export const RECONNECT_MAX_DELAY_MS = 15_000;

export type LifecycleState = {
  visible: boolean;
  online: boolean;
};

export type LifecycleCause =
  | "visibilitychange"
  | "pageshow"
  | "pagehide"
  | "online"
  | "offline";

export type LifecycleListener = (cause?: LifecycleCause) => void;

export interface PageLifecycle {
  getState(): LifecycleState;
  subscribe(listener: LifecycleListener): () => void;
}

export const reconnectDelayMs = (
  attempt: number,
  random: () => number = Math.random,
): number => {
  const base = Math.min(RECONNECT_MAX_DELAY_MS, 500 * 2 ** Math.max(0, attempt));
  return Math.floor(base * (0.5 + random() * 0.5));
};

export const createBrowserPageLifecycle = (): PageLifecycle | undefined => {
  if (typeof document === "undefined" || typeof window === "undefined") {
    return undefined;
  }
  return {
    getState: () => ({
      visible: document.visibilityState !== "hidden",
      online: navigator.onLine !== false,
    }),
    subscribe: (listener) => {
      const onVisibility = () => listener("visibilitychange");
      const onPageShow = () => listener("pageshow");
      const onPageHide = () => listener("pagehide");
      const onOnline = () => listener("online");
      const onOffline = () => listener("offline");
      document.addEventListener("visibilitychange", onVisibility);
      window.addEventListener("pageshow", onPageShow);
      window.addEventListener("pagehide", onPageHide);
      window.addEventListener("online", onOnline);
      window.addEventListener("offline", onOffline);
      return () => {
        document.removeEventListener("visibilitychange", onVisibility);
        window.removeEventListener("pageshow", onPageShow);
        window.removeEventListener("pagehide", onPageHide);
        window.removeEventListener("online", onOnline);
        window.removeEventListener("offline", onOffline);
      };
    },
  };
};

type TimerHandle = ReturnType<typeof setTimeout>;

export class ReconnectScheduler {
  #attempt = 0;
  #timer?: TimerHandle;
  #inflight = false;
  #wanted = false;
  readonly #canRun: () => boolean;
  readonly #reconnect: () => Promise<void>;
  readonly #delay: (attempt: number) => number;
  readonly #setTimeout: typeof setTimeout;
  readonly #clearTimeout: typeof clearTimeout;

  constructor(options: {
    canRun(): boolean;
    reconnect(): Promise<void>;
    delay?(attempt: number): number;
    setTimeout?: typeof setTimeout;
    clearTimeout?: typeof clearTimeout;
  }) {
    this.#canRun = options.canRun;
    this.#reconnect = options.reconnect;
    this.#delay = options.delay ?? reconnectDelayMs;
    this.#setTimeout = options.setTimeout ?? setTimeout;
    this.#clearTimeout = options.clearTimeout ?? clearTimeout;
  }

  request(): void {
    this.#wanted = true;
    this.#arm();
  }

  notifyEnvironmentChanged(): void {
    this.#arm();
  }

  reset(): void {
    this.#attempt = 0;
    this.#wanted = false;
    this.#clear();
  }

  dispose(): void {
    this.#wanted = false;
    this.#clear();
  }

  #clear(): void {
    if (this.#timer === undefined) return;
    this.#clearTimeout(this.#timer);
    this.#timer = undefined;
  }

  #arm(): void {
    if (!this.#wanted || this.#inflight || this.#timer !== undefined) return;
    if (!this.#canRun()) return;
    const wait = this.#attempt === 0 ? 0 : this.#delay(this.#attempt - 1);
    this.#timer = this.#setTimeout(() => {
      this.#timer = undefined;
      void this.#run();
    }, wait);
  }

  async #run(): Promise<void> {
    if (!this.#wanted || this.#inflight) return;
    if (!this.#canRun()) return;
    this.#inflight = true;
    try {
      await this.#reconnect();
      this.#attempt = 0;
      this.#wanted = false;
    } catch {
      this.#attempt += 1;
    } finally {
      this.#inflight = false;
    }
    if (this.#wanted) this.#arm();
  }
}

export type ForegroundEvent = "suspended" | "resumed";

export class ForegroundController {
  #suspended = false;
  #replacePromise?: Promise<void>;
  readonly #isActive: () => boolean;
  readonly #environment: () => LifecycleState | undefined;
  readonly #onEvent: (event: ForegroundEvent) => void;
  readonly #replaceConnection: () => Promise<void>;
  readonly #scheduleRetry: () => void;

  constructor(options: {
    isActive(): boolean;
    environment(): LifecycleState | undefined;
    onEvent(event: ForegroundEvent): void;
    replaceConnection(): Promise<void>;
    scheduleRetry(): void;
  }) {
    this.#isActive = options.isActive;
    this.#environment = options.environment;
    this.#onEvent = options.onEvent;
    this.#replaceConnection = options.replaceConnection;
    this.#scheduleRetry = options.scheduleRetry;
  }

  notify(cause?: LifecycleCause): void {
    const state = this.#environment();
    if (!state) return;
    const background = !state.visible || !state.online;
    if (!this.#isActive()) {
      if (!background && cause !== "pagehide") this.#suspended = false;
      return;
    }
    if (cause === "pagehide") {
      this.#suspend();
      return;
    }
    if (cause === "pageshow") {
      // Safari can still report a stale hidden visibility state while restoring
      // a page. pageshow is authoritative: replace the socket now and let a
      // genuine offline failure enter the environment-gated retry scheduler.
      this.#resumeAndReplace();
      return;
    }
    if (background) {
      this.#suspend();
      return;
    }
    if (!this.#suspended) return;
    this.#resumeAndReplace();
  }

  #suspend(): void {
    if (this.#suspended) return;
    this.#suspended = true;
    this.#onEvent("suspended");
  }

  #resumeAndReplace(): void {
    this.#suspended = false;
    this.#onEvent("resumed");
    this.#replace();
  }

  #replace(): void {
    if (this.#replacePromise) return;
    this.#replacePromise = this.#replaceConnection()
      .catch(() => {
        this.#scheduleRetry();
      })
      .finally(() => {
        this.#replacePromise = undefined;
      });
  }
}
