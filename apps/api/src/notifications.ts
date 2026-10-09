/**
 * Emails to the Loki team when something happens that they want to know about
 * as it happens. They are best effort: a failed email is logged and never
 * changes what the person using Loki sees.
 */
export type OperatorEvent =
  | { type: "account.created"; email: string }
  | { type: "cli.first_login"; email: string }
  | { type: "game.first_deployed"; email: string; projectName: string };

export type UserEmail =
  | { type: "welcome"; to: string }
  | { type: "game_created"; to: string; projectName: string };

export interface OperatorNotifier {
  notify(event: OperatorEvent): void;
  /** A message to the person who just signed up or created a game. */
  notifyUser?(email: UserEmail): void;
}

export const SUPPORT_REPLY_TO = "contact@lokiplay.cc";

export interface RenderedEmail {
  subject: string;
  text: string;
}

export function welcomeEmail(): RenderedEmail {
  return {
    subject: "Welcome to Loki!",
    text: [
      "Welcome to Loki!",
      "",
      "Your account is ready. Sign in and create your first game at app.lokiplay.cc.",
      "",
      "For support and queries please visit lokiplay.cc or reach out to contact@lokiplay.cc.",
    ].join("\n"),
  };
}

export function gameCreatedEmail(projectName: string): RenderedEmail {
  const name = plain(projectName);
  return {
    subject: `Congrats! You just created ${name}.`,
    text: [
      `Congrats! You just created ${name}.`,
      "",
      "Install Loki using the following instructions:",
      "",
      "1. Visit your game page on the Creator dashboard (app.lokiplay.cc).",
      "2. Copy the prompt specific for your game provided by Loki.",
      "3. Paste the prompt into your game building AI agent tool.",
      "4. Wait for the installation to be run by your agent, authenticate using your Loki account when prompted.",
      "",
      "After shipping, Loki gives you a playable and shareable URL for your game and instant built-in online multiplayer.",
      "",
      "For support and queries please visit https://lokiplay.cc or reach out to contact@lokiplay.cc.",
    ].join("\n"),
  };
}

export function renderUserEmail(email: UserEmail): RenderedEmail {
  switch (email.type) {
    case "welcome":
      return welcomeEmail();
    case "game_created":
      return gameCreatedEmail(email.projectName);
  }
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
    const message = describeEvent(event);
    void this.deliver({ to: this.#to, subject: message, text: message });
  }

  notifyUser(email: UserEmail): void {
    const message = renderUserEmail(email);
    void this.deliver({
      to: email.to,
      subject: message.subject,
      text: message.text,
      replyTo: SUPPORT_REPLY_TO,
    });
  }

  /** Resolves once the email was sent or failed. Never rejects. */
  async send(event: OperatorEvent): Promise<void> {
    const message = describeEvent(event);
    await this.deliver({ to: this.#to, subject: message, text: message });
  }

  async deliver(input: {
    to: string;
    subject: string;
    text: string;
    replyTo?: string;
  }): Promise<void> {
    try {
      const response = await this.#fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.#apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          from: this.#from,
          to: [input.to],
          subject: input.subject,
          text: input.text,
          ...(input.replyTo ? { reply_to: input.replyTo } : {}),
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
