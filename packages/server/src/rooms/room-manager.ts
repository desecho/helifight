import { randomUUID } from "node:crypto";
import {
  EMPTY_INPUT_FRAME,
  type InputFrame,
  type PlayerId,
  type RoomErrorPayload,
  type RoomStatus
} from "@helifight/shared";
import { generateRoomCode } from "./room-code";

interface SocketMembership {
  roomCode: string;
  playerId: PlayerId;
}

export interface PlayerSlot {
  playerId: PlayerId;
  socketId: string | null;
  token: string;
  nickname?: string;
  connected: boolean;
  lastInput: InputFrame;
}

export interface Room {
  code: string;
  status: RoomStatus;
  createdAtMs: number;
  updatedAtMs: number;
  players: Record<PlayerId, PlayerSlot | null>;
  rematchVotes: Set<PlayerId>;
}

export class RoomManagerError extends Error {
  public readonly code: RoomErrorPayload["code"];

  public constructor(code: RoomErrorPayload["code"], message: string) {
    super(message);
    this.code = code;
  }
}

export class RoomManager {
  private readonly rooms = new Map<string, Room>();
  private readonly socketMemberships = new Map<string, SocketMembership>();

  public listRooms(): Room[] {
    return [...this.rooms.values()];
  }

  public getRoom(code: string): Room | undefined {
    return this.rooms.get(code.toUpperCase());
  }

  public getMembershipBySocket(socketId: string): SocketMembership | undefined {
    return this.socketMemberships.get(socketId);
  }

  public createRoom(socketId: string, nickname?: string): { room: Room; player: PlayerSlot } {
    this.assertSocketIsAvailable(socketId);

    const roomCode = generateRoomCode(new Set(this.rooms.keys()));
    const nowMs = Date.now();
    const player = this.createPlayer("P1", socketId, nickname);

    const room: Room = {
      code: roomCode,
      status: "waiting",
      createdAtMs: nowMs,
      updatedAtMs: nowMs,
      players: {
        P1: player,
        P2: null
      },
      rematchVotes: new Set()
    };

    this.rooms.set(roomCode, room);
    this.socketMemberships.set(socketId, { roomCode, playerId: "P1" });

    return { room, player };
  }

  public joinRoom(socketId: string, roomCode: string, nickname?: string): { room: Room; player: PlayerSlot } {
    this.assertSocketIsAvailable(socketId);

    const normalizedCode = roomCode.toUpperCase();
    const room = this.rooms.get(normalizedCode);

    if (!room) {
      throw new RoomManagerError("ROOM_NOT_FOUND", "Game code not found.");
    }

    if (room.status !== "waiting") {
      throw new RoomManagerError("INVALID_STATE", "This game cannot be joined right now.");
    }

    if (room.players.P2) {
      throw new RoomManagerError("ROOM_FULL", "This game is already full.");
    }

    const player = this.createPlayer("P2", socketId, nickname);
    room.players.P2 = player;
    room.updatedAtMs = Date.now();

    this.socketMemberships.set(socketId, { roomCode: normalizedCode, playerId: "P2" });

    return { room, player };
  }

  public reconnectPlayer(
    socketId: string,
    roomCode: string,
    token: string
  ): { room: Room; player: PlayerSlot } {
    this.assertSocketIsAvailable(socketId);

    const normalizedCode = roomCode.toUpperCase();
    const room = this.rooms.get(normalizedCode);

    if (!room) {
      throw new RoomManagerError("ROOM_NOT_FOUND", "Game code not found.");
    }

    const candidates: PlayerSlot[] = [room.players.P1, room.players.P2].filter(
      (value): value is PlayerSlot => value !== null
    );
    const player = candidates.find((value) => value.token === token);

    if (!player || player.connected) {
      throw new RoomManagerError("RECONNECT_FAILED", "Unable to reconnect to this match.");
    }

    player.socketId = socketId;
    player.connected = true;
    room.updatedAtMs = Date.now();

    this.socketMemberships.set(socketId, { roomCode: normalizedCode, playerId: player.playerId });

    return { room, player };
  }

  public disconnectSocket(socketId: string): { room: Room; playerId: PlayerId } | null {
    const membership = this.socketMemberships.get(socketId);

    if (!membership) {
      return null;
    }

    this.socketMemberships.delete(socketId);

    const room = this.rooms.get(membership.roomCode);

    if (!room) {
      return null;
    }

    const player = room.players[membership.playerId];

    if (!player) {
      return null;
    }

    player.socketId = null;
    player.connected = false;
    room.updatedAtMs = Date.now();

    return { room, playerId: membership.playerId };
  }

  public removeRoom(roomCode: string): void {
    const room = this.rooms.get(roomCode);

    if (!room) {
      return;
    }

    const playerSlots: PlayerSlot[] = [room.players.P1, room.players.P2].filter(
      (value): value is PlayerSlot => value !== null
    );

    for (const slot of playerSlots) {
      if (slot.socketId) {
        this.socketMemberships.delete(slot.socketId);
      }
    }

    this.rooms.delete(roomCode);
  }

  public isFull(room: Room): boolean {
    return room.players.P1 !== null && room.players.P2 !== null;
  }

  public bothPlayersConnected(room: Room): boolean {
    return room.players.P1?.connected === true && room.players.P2?.connected === true;
  }

  public setRoomStatus(room: Room, status: RoomStatus): void {
    room.status = status;
    room.updatedAtMs = Date.now();
  }

  public addRematchVote(room: Room, playerId: PlayerId): number {
    room.rematchVotes.add(playerId);
    room.updatedAtMs = Date.now();
    return room.rematchVotes.size;
  }

  public clearRematchVotes(room: Room): void {
    room.rematchVotes.clear();
    room.updatedAtMs = Date.now();
  }

  public setPlayerInputBySocket(socketId: string, input: InputFrame): void {
    const membership = this.socketMemberships.get(socketId);

    if (!membership) {
      return;
    }

    const room = this.rooms.get(membership.roomCode);

    if (!room) {
      return;
    }

    const player = room.players[membership.playerId];

    if (!player) {
      return;
    }

    player.lastInput = input;
    room.updatedAtMs = Date.now();
  }

  private assertSocketIsAvailable(socketId: string): void {
    if (this.socketMemberships.has(socketId)) {
      throw new RoomManagerError("ALREADY_IN_ROOM", "You are already in an active room.");
    }
  }

  private createPlayer(playerId: PlayerId, socketId: string, nickname?: string): PlayerSlot {
    return {
      playerId,
      socketId,
      token: randomUUID(),
      nickname,
      connected: true,
      lastInput: { ...EMPTY_INPUT_FRAME }
    };
  }
}
