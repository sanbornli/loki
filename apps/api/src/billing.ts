import { createHmac, timingSafeEqual } from "node:crypto";
import type { PlatformOperations } from "./platform.js";
import {
  isPriceKey,
  type PlanId,
  type PlanStatus,
  type PriceKey,
} from "./plans.js";

export interface StripePriceCatalog {
  loki_monthly?: string;
  loki_annual?: string;
  pro_monthly?: string;
  pro_annual?: string;
}

export interface BillingOptions {
  secretKey?: string;
  webhookSecret?: string;
  creatorOrigin?: string;
  prices: StripePriceCatalog;
  fetch?: typeof fetch;
  now?: () => number;
}

interface StripeSubscription {
  id?: string;
  customer?: unknown;
  status?: string;
  cancel_at_period_end?: boolean;
  current_period_end?: number;
  metadata?: { account_id?: string };
  items?: { data?: Array<{ price?: { id?: string } | string; current_period_end?: number }> };
}

export class BillingService {
  constructor(
    private readonly options: BillingOptions,
    private readonly platform: PlatformOperations,
  ) {}

  async createCheckout(
    accountId: string,
    priceKey: PriceKey,
  ): Promise<{ url: string }> {
    const price = this.priceId(priceKey);
    const contact = await this.platform.billingContact(accountId);
    const origin = this.creatorOrigin();
    const body = new URLSearchParams({
      mode: "subscription",
      success_url: `${origin}/creator?billing=success`,
      cancel_url: `${origin}/creator?billing=cancel`,
      client_reference_id: accountId,
      "metadata[account_id]": accountId,
      "line_items[0][price]": price,
      "line_items[0][quantity]": "1",
      "subscription_data[metadata][account_id]": accountId,
    });
    if (contact.stripeCustomerId) body.set("customer", contact.stripeCustomerId);
    else body.set("customer_email", contact.email);
    const session = await this.stripe("POST", "checkout/sessions", body) as { url?: string };
    if (!session.url) throw new Error("billing did not return a checkout link");
    return { url: session.url };
  }

  async createPortal(accountId: string): Promise<{ url: string }> {
    const contact = await this.platform.billingContact(accountId);
    if (!contact.stripeCustomerId) throw new Error("billing is not set up for this account");
    const session = await this.stripe(
      "POST",
      "billing_portal/sessions",
      new URLSearchParams({
        customer: contact.stripeCustomerId,
        return_url: `${this.creatorOrigin()}/creator`,
      }),
    ) as { url?: string };
    if (!session.url) throw new Error("billing did not return a portal link");
    return { url: session.url };
  }

  async handleWebhook(payload: Buffer, signature: string): Promise<void> {
    const secret = this.options.webhookSecret;
    if (!secret) throw new Error("billing is not configured");
    verifyStripeSignature(payload, signature, secret, this.options.now?.() ?? Date.now());
    const event = JSON.parse(payload.toString("utf8")) as {
      type?: string;
      data?: { object?: Record<string, unknown> };
    };
    const object = event.data?.object;
    if (!object) return;
    if (event.type === "checkout.session.completed") {
      await this.applyCheckout(object);
      return;
    }
    if (
      event.type === "customer.subscription.updated" ||
      event.type === "customer.subscription.deleted"
    ) {
      await this.applySubscription(object as unknown as StripeSubscription, event.type.endsWith("deleted"));
    }
  }

  private async applyCheckout(session: Record<string, unknown>): Promise<void> {
    if (session.mode && session.mode !== "subscription") return;
    const accountId = stringValue(session.client_reference_id)
      ?? metadataAccountId(session.metadata);
    const customerId = idOf(session.customer);
    const subscriptionId = idOf(session.subscription);
    if (!accountId) return;
    if (!subscriptionId) {
      if (customerId) {
        await this.platform.applySubscription({ accountId, stripeCustomerId: customerId });
      }
      return;
    }
    const subscription = await this.stripe(
      "GET",
      `subscriptions/${encodeURIComponent(subscriptionId)}`,
    ) as StripeSubscription;
    await this.applySubscription({
      ...subscription,
      customer: customerId ?? subscription.customer,
      metadata: {
        ...subscription.metadata,
        account_id: subscription.metadata?.account_id ?? accountId,
      },
    });
  }

  private async applySubscription(
    subscription: StripeSubscription,
    deleted = false,
  ): Promise<void> {
    const customerId = idOf(subscription.customer);
    const subscriptionId = subscription.id;
    const accountId = subscription.metadata?.account_id
      ?? await this.platform.accountIdForStripeCustomer(customerId, subscriptionId);
    if (!accountId) return;
    const priceId = priceIdOf(subscription);
    const plan = priceId ? planFromPriceId(this.options.prices, priceId) : undefined;
    if (priceId && !plan) throw new Error("unknown billing price");
    const status = deleted ? "canceled" : planStatusFromStripe(subscription.status, subscription.cancel_at_period_end);
    if (!status) return;
    await this.platform.applySubscription({
      accountId,
      plan,
      status,
      periodEnd: periodEndIso(subscription),
      stripeCustomerId: customerId,
      stripeSubscriptionId: subscriptionId,
    });
  }

  private priceId(priceKey: PriceKey): string {
    const price = this.options.prices[priceKey];
    if (!this.options.secretKey || !price) throw new Error("billing is not configured");
    return price;
  }

  private creatorOrigin(): string {
    const origin = this.options.creatorOrigin?.replace(/\/$/, "");
    if (!origin) throw new Error("billing is not configured");
    return origin;
  }

  private async stripe(
    method: "GET" | "POST",
    path: string,
    body?: URLSearchParams,
  ): Promise<unknown> {
    if (!this.options.secretKey) throw new Error("billing is not configured");
    const response = await (this.options.fetch ?? fetch)(`https://api.stripe.com/v1/${path}`, {
      method,
      headers: {
        authorization: `Bearer ${this.options.secretKey}`,
        ...(body ? { "content-type": "application/x-www-form-urlencoded" } : {}),
      },
      body,
    });
    const payload = await response.json() as { error?: { message?: string } };
    if (!response.ok) {
      throw new Error(payload.error?.message ?? "billing request failed");
    }
    return payload;
  }
}

export function planFromPriceId(
  prices: StripePriceCatalog,
  priceId: string,
): PlanId | undefined {
  if (priceId === prices.loki_monthly || priceId === prices.loki_annual) return "loki";
  if (priceId === prices.pro_monthly || priceId === prices.pro_annual) return "pro";
  return undefined;
}

export function verifyStripeSignature(
  payload: Buffer,
  header: string,
  secret: string,
  now: number,
): void {
  const items = header.split(",").map((part) => {
    const index = part.indexOf("=");
    return [part.slice(0, index), part.slice(index + 1)] as const;
  });
  const timestamp = items.find(([key]) => key === "t")?.[1];
  const signatures = items.filter(([key]) => key === "v1").map(([, value]) => value);
  const issuedAt = Number(timestamp);
  if (!timestamp || !Number.isFinite(issuedAt) || signatures.length === 0) {
    throw new Error("invalid stripe signature");
  }
  if (Math.abs(now / 1000 - issuedAt) > 300) throw new Error("stale stripe signature");
  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.${payload.toString("utf8")}`)
    .digest("hex");
  const expectedBuffer = Buffer.from(expected);
  const valid = signatures.some((signature) => {
    const actual = Buffer.from(signature);
    return actual.length === expectedBuffer.length && timingSafeEqual(actual, expectedBuffer);
  });
  if (!valid) throw new Error("invalid stripe signature");
}

function planStatusFromStripe(
  status: string | undefined,
  cancelAtPeriodEnd = false,
): PlanStatus | undefined {
  if (status === "active" || status === "trialing") {
    return cancelAtPeriodEnd ? "canceled" : "active";
  }
  if (status === "past_due" || status === "unpaid") return "past_due";
  if (status === "canceled" || status === "incomplete_expired") return "canceled";
  return undefined;
}

function periodEndIso(subscription: StripeSubscription): string | undefined {
  const seconds = subscription.current_period_end
    ?? subscription.items?.data?.[0]?.current_period_end;
  if (!seconds) return undefined;
  return new Date(seconds * 1000).toISOString();
}

function priceIdOf(subscription: StripeSubscription): string | undefined {
  const price = subscription.items?.data?.[0]?.price;
  if (!price) return undefined;
  return typeof price === "string" ? price : price.id;
}

function metadataAccountId(metadata: unknown): string | undefined {
  if (!metadata || typeof metadata !== "object" || !("account_id" in metadata)) return undefined;
  return stringValue((metadata as { account_id?: unknown }).account_id);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

function idOf(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "id" in value) {
    return stringValue((value as { id?: unknown }).id);
  }
  return undefined;
}

export function assertPriceKey(value: unknown): PriceKey {
  if (!isPriceKey(value)) throw new Error("price is required");
  return value;
}
