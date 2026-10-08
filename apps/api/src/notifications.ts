/**
 * Emails to the Loki team when something happens that they want to know about
 * as it happens. They are best effort: a failed email is logged and never
 * changes what the person using Loki sees.
 */
export type OperatorEvent =
  | { type: "account.created"; email: string }
  | { type: "cli.first_login"; email: string }
  | { type: "game.first_deployed"; email: string; projectName: string };

export interface OperatorNotifier {
  notify(event: OperatorEvent): void;
}

/** Keeps user-controlled text on one line so it cannot reshape the email. */
function plain(value: string): string {
  return value.replace(/[<>\r\n]/g, "").slice(0, 120);
}

export function describeEvent(event: OperatorEvent): string {
  switch (event.type) {
    case "account.created":
      return `New Loki account: ${plain(event.email)}`;
    case "cli.first_login":
      return `First CLI login: ${plain(event.email)} signed in to the Loki CLI`;
    case "game.first_deployed":
      return `First deploy: ${plain(event.email)} put "${plain(event.projectName)}" live`;
  }
}

export interface EmailNotifierOptions {
  apiKey: string;
  from: string;
  to: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
  log?: (message: string) => void;
}

/** Sends one plain-text email per event through Resend's HTTPS API. */
export class EmailNotifier implements OperatorNotifier {
  readonly #apiKey: string;
  readonly #from: string;
  readonly #to: string;
  readonly #fetch: typeof fetch;
  readonly #timeoutMs: number;
  readonly #log: (message: string) => void;

  constructor(options: EmailNotifierOptions) {
    if (!options.apiKey || !options.from || !options.to) {
      throw new Error("operator email needs an API key, a from address, and a to address");
    }
    this.#apiKey = options.apiKey;
    this.#from = options.from;
    this.#to = options.to;
    this.#fetch = options.fetch ?? fetch;
    this.#timeoutMs = options.timeoutMs ?? 5_000;
    this.#log = options.log ?? ((message) => console.error(message));
  }

  notify(event: OperatorEvent): void {
    void this.send(event);
  }

  /** Resolves once the email was sent or failed. Never rejects. */
  async send(event: OperatorEvent): Promise<void> {
    const message = describeEvent(event);
    try {
      const response = await this.#fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.#apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          from: this.#from,
          to: [this.#to],
          subject: message,
          text: message,
        }),
        signal: AbortSignal.timeout(this.#timeoutMs),
      });
      if (!response.ok) {
        this.#log(`operator email failed: HTTP ${response.status}`);
      }
    } catch (error) {
      this.#log(
        `operator email failed: ${error instanceof Error ? error.name : "error"}`,
      );
    }
  }
}
