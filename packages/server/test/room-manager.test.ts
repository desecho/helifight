import { describe, expect, test } from "vitest";
import { RoomManager } from "../src/rooms/room-manager";

describe("RoomManager", () => {
  test("create and join flow sets room to full with two players", () => {
    const manager = new RoomManager();

    const created = manager.createRoom("socket-a", "Host");
    expect(created.room.players.P1?.nickname).toBe("Host");

    const joined = manager.joinRoom("socket-b", created.room.code, "Guest");
    expect(joined.room.players.P2?.nickname).toBe("Guest");
    expect(manager.isFull(joined.room)).toBe(true);
    expect(manager.bothPlayersConnected(joined.room)).toBe(true);
  });

  test("disconnect and reconnect restores player connection state", () => {
    const manager = new RoomManager();

    const created = manager.createRoom("socket-a");
    manager.joinRoom("socket-b", created.room.code);

    const disconnected = manager.disconnectSocket("socket-b");
    expect(disconnected?.room.players.P2?.connected).toBe(false);

    const token = disconnected?.room.players.P2?.token;
    expect(token).toBeDefined();

    const reconnected = manager.reconnectPlayer("socket-c", created.room.code, token as string);
    expect(reconnected.player.connected).toBe(true);
    expect(reconnected.player.socketId).toBe("socket-c");
  });
});
