import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign,
  verify,
  type KeyObject,
} from "node:crypto";
import {
  PlayerSessionClaimsSchema,
  type PlayerSessionClaims,
} from "../../../packages/protocol/src/index.js";

const encode = (value: string | Uint8Array): string =>
  Buffer.from(value).toString("base64url");

export class SessionTokenService {
  readonly #privateKey: KeyObject;
  readonly #publicKey: KeyObject;

  constructor(keys?: { privateKeyPem: string; publicKeyPem: string }) {
    if (keys) {
      this.#privateKey = createPrivateKey(keys.privateKeyPem);
      this.#publicKey = createPublicKey(keys.publicKeyPem);
    } else {
      const generated = generateKeyPairSync("ed25519");
      this.#privateKey = generated.privateKey;
      this.#publicKey = generated.publicKey;
    }
  }

  issue(claims: PlayerSessionClaims): string {
    PlayerSessionClaimsSchema.parse(claims);
    if (claims.expiresAt <= claims.issuedAt || claims.expiresAt - claims.issuedAt > 900) {
      throw new Error("player sessions must expire within 15 minutes");
    }
    const header = encode(JSON.stringify({ alg: "EdDSA", typ: "JWT" }));
    const payload = encode(JSON.stringify(claims));
    const message = `${header}.${payload}`;
    const signature = sign(null, Buffer.from(message), this.#privateKey);
    return `${message}.${encode(signature)}`;
  }

  verify(token: string, now = Math.floor(Date.now() / 1_000)): PlayerSessionClaims {
    const parts = token.split(".");
    if (parts.length !== 3) throw new Error("invalid session token");
    const [header, payload, signature] = parts as [string, string, string];
    const signatureBytes = Buffer.from(signature, "base64url");
    if (encode(signatureBytes) !== signature) {
      throw new Error("invalid session signature encoding");
    }
    const parsedHeader = JSON.parse(Buffer.from(header, "base64url").toString()) as {
      alg?: string;
    };
    if (parsedHeader.alg !== "EdDSA") throw new Error("invalid signing algorithm");
    if (
      !verify(
        null,
        Buffer.from(`${header}.${payload}`),
        this.#publicKey,
        signatureBytes,
      )
    ) {
      throw new Error("invalid session signature");
    }
    const claims = PlayerSessionClaimsSchema.parse(
      JSON.parse(Buffer.from(payload, "base64url").toString()),
    );
    if (claims.expiresAt <= now) throw new Error("expired session");
    return claims;
  }

  publicKeyPem(): string {
    return this.#publicKey.export({ type: "spki", format: "pem" }).toString();
  }
}
