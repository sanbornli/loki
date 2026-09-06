import type { PlatformOperations } from "./platform.js";

export interface NakamaGatewayOptions {
  origin: string;
  serverKey: string;
  httpKey: string;
  projectConfig?(projectId: string): Promise<{
    maxPlayers: number;
    tickRate: number;
    teamSize?: number;
    concurrentRoomQuota?: number;
  }>;
}

export class NakamaGateway {
  constructor(
    readonly platform: PlatformOperations,
    readonly options: NakamaGatewayOptions,
  ) {}

  async exchangePlayerToken(lokiToken: string): Promise<{
    token: string;
    refreshToken?: string;
    playerId: string;
    projectId: string;
  }> {
    const claims = this.platform.tokens.verify(lokiToken);
    await this.platform.playableProject(claims.projectId);
    const projectConfig = await this.options.projectConfig?.(claims.projectId);
    const authentication = await fetch(
      `${this.options.origin}/v2/account/authenticate/custom?create=true&username=${encodeURIComponent(
        `loki_${claims.subject.replaceAll("-", "").slice(0, 24)}`,
      )}`,
      {
        method: "POST",
        headers: {
          authorization: `Basic ${Buffer.from(`${this.options.serverKey}:`).toString(
            "base64",
          )}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ id: `lokiplay:${claims.subject}` }),
      },
    );
    if (!authentication.ok) {
      throw new Error(`Nakama authentication failed (${authentication.status})`);
    }
    const session = (await authentication.json()) as {
      token?: string;
      refresh_token?: string;
    };
    if (!session.token) throw new Error("Nakama returned no session");
    const nakamaClaims = JSON.parse(
      Buffer.from(session.token.split(".")[1] ?? "", "base64url").toString(),
    ) as { uid?: string };
    if (!nakamaClaims.uid) throw new Error("Nakama session has no user id");

    const provision = await fetch(
      `${this.options.origin}/v2/rpc/loki_provision_tenant?unwrap`,
      {
        method: "POST",
        headers: {
          authorization: `Basic ${Buffer.from(`${this.options.httpKey}:`).toString("base64")}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          userId: nakamaClaims.uid,
          projectId: claims.projectId,
          status: "active",
          visibility: "matchmaking",
          ...projectConfig,
        }),
      },
    );
    if (!provision.ok) {
      throw new Error(`Nakama tenant provisioning failed (${provision.status})`);
    }
    return {
      token: session.token,
      refreshToken: session.refresh_token,
      playerId: claims.subject,
      projectId: claims.projectId,
    };
  }
}
