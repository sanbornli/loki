export const RECONNECT_MAX_DELAY_MS = 15_000;

export type LifecycleState = {
  visible: boolean;
  online: boolean;
};

export type LifecycleListener = () => void;

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
      const onChange = () => listener();
      document.addEventListener("visibilitychange", onChange);
      window.addEventListener("pageshow", onChange);
      window.addEventListener("online", onChange);
      window.addEventListener("offline", onChange);
      return () => {
        document.removeEventListener("visibilitychange", onChange);
        window.removeEventListener("pageshow", onChange);
        window.removeEventListener("online", onChange);
        window.removeEventListener("offline", onChange);
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
