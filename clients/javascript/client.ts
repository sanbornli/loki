export interface LokiTransport {
  request(operation: string, payload: unknown): Promise<unknown>;
}

export class LokiClient {
  constructor(private readonly transport: LokiTransport) {}
  initialize(projectId: string) { return this.transport.request("initialize", { projectId }); }
  authenticate(token: string) { return this.transport.request("authenticate", { token }); }
  joinRoom(roomId: string) { return this.transport.request("joinRoom", { roomId }); }
  sendAction(roomId: string, payload: unknown) {
    return this.transport.request("sendAction", { roomId, payload });
  }
}
