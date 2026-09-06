import type { IncomingMessage } from "node:http";
import { createRemoteJWKSet, jwtVerify } from "jose";

export interface SupabaseIdentity {
  subject: string;
  email?: string;
  role: string;
  expiresAt: number;
}

export class SupabaseAuthVerifier {
  readonly #issuer: string;
  readonly #audience: string;
  readonly #keys: ReturnType<typeof createRemoteJWKSet>;

  constructor(options: {
    supabaseUrl: string;
    issuer?: string;
    audience?: string;
  }) {
    const baseUrl = options.supabaseUrl.replace(/\/$/, "");
    this.#issuer = options.issuer ?? `${baseUrl}/auth/v1`;
    this.#audience = options.audience ?? "authenticated";
    this.#keys = createRemoteJWKSet(
      new URL(`${baseUrl}/auth/v1/.well-known/jwks.json`),
    );
  }

  async verify(accessToken: string): Promise<SupabaseIdentity> {
    const { payload } = await jwtVerify(accessToken, this.#keys, {
      issuer: this.#issuer,
      audience: this.#audience,
      algorithms: ["ES256", "RS256"],
    });
    if (!payload.sub || typeof payload.exp !== "number") {
      throw new Error("Supabase token has incomplete identity claims");
    }
    return {
      subject: payload.sub,
      email: typeof payload.email === "string" ? payload.email : undefined,
      role: typeof payload.role === "string" ? payload.role : "authenticated",
      expiresAt: payload.exp,
    };
  }

  async identityFromRequest(request: IncomingMessage): Promise<SupabaseIdentity> {
    const authorization = request.headers.authorization;
    if (!authorization?.startsWith("Bearer ")) {
      throw new Error("creator authentication required");
    }
    return this.verify(authorization.slice("Bearer ".length));
  }
}
