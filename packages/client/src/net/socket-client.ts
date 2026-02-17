import {
  io,
  type Socket
} from "socket.io-client";
import type { ClientToServerEvents, ServerToClientEvents } from "@helifight/shared";

function resolveServerUrl(): string {
  const configured = import.meta.env.VITE_SERVER_URL as string | undefined;

  if (configured && configured.trim().length > 0) {
    return configured.trim();
  }

  if (import.meta.env.DEV) {
    return `${window.location.protocol}//${window.location.hostname}:3000`;
  }

  return window.location.origin;
}

class SocketClient {
  private readonly socket: Socket<ServerToClientEvents, ClientToServerEvents>;

  public constructor() {
    const serverUrl = resolveServerUrl();

    this.socket = io(serverUrl, {
      autoConnect: true,
      transports: ["websocket"]
    });
  }

  public on<EventName extends keyof ServerToClientEvents>(
    event: EventName,
    handler: ServerToClientEvents[EventName]
  ): () => void {
    const rawSocket = this.socket as any;
    rawSocket.on(event, handler);
    return () => {
      rawSocket.off(event, handler);
    };
  }

  public onConnect(handler: () => void): () => void {
    this.socket.on("connect", handler);
    return () => this.socket.off("connect", handler);
  }

  public onDisconnect(handler: (reason: string) => void): () => void {
    this.socket.on("disconnect", handler);
    return () => this.socket.off("disconnect", handler);
  }

  public createRoom(nickname?: string): void {
    this.socket.emit("room:create", { nickname });
  }

  public joinRoom(roomCode: string, nickname?: string): void {
    this.socket.emit("room:join", { roomCode, nickname });
  }

  public sendInput(payload: Parameters<ClientToServerEvents["input:frame"]>[0]): void {
    this.socket.emit("input:frame", payload);
  }

  public reconnect(roomCode: string, playerToken: string): void {
    this.socket.emit("player:reconnect", { roomCode, playerToken });
  }

  public requestRematch(): void {
    this.socket.emit("match:rematch_request");
  }

  public isConnected(): boolean {
    return this.socket.connected;
  }
}

export const socketClient = new SocketClient();
