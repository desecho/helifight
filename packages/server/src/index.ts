import { existsSync } from "node:fs";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import path from "node:path";
import cors from "cors";
import express from "express";
import {
  MATCH_COUNTDOWN_MS,
  RECONNECT_WINDOW_MS,
  ROOM_ENDED_TTL_MS,
  ROOM_IDLE_TTL_MS,
  SERVER_TICK_RATE,
  SNAPSHOT_RATE,
  type ClientToServerEvents,
  type InputFrame,
  type MatchSnapshotPayload,
  type PlayerId,
  type RoomErrorPayload,
  type RoomPlayerInfo,
  type RoomStatus,
  type ServerToClientEvents
} from "@helifight/shared";
import { Server } from "socket.io";
import { ReconnectController } from "./game/reconnect";
import { Simulation } from "./game/simulation";
import { RoomManager, RoomManagerError, type Room } from "./rooms/room-manager";

interface RoomRuntime {
  simulation: Simulation;
  tickTimer: NodeJS.Timeout;
  snapshotTimer: NodeJS.Timeout;
  countdownUntilMs: number;
  pausedByDisconnect: PlayerId | null;
}

const PLAYER_IDS: PlayerId[] = ["P1", "P2"];
const roomManager = new RoomManager();
const reconnectController = new ReconnectController();
const runtimeByRoom = new Map<string, RoomRuntime>();

const app = express();
app.use(cors({ origin: process.env.CORS_ORIGIN?.split(",") ?? "*" }));
app.use(express.json());

app.get("/health", (_req: any, res: any) => {
  res.json({ ok: true });
});

serveBuiltClientIfAvailable();

const port = Number(process.env.PORT ?? 3000);
const httpServer = createServer(app);

const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: {
    origin: process.env.CORS_ORIGIN?.split(",") ?? "*",
    methods: ["GET", "POST"]
  }
});

io.on("connection", (socket) => {
  socket.on("room:create", (payload) => {
    try {
      const nickname = sanitizeNickname(payload.nickname);
      const { room, player } = roomManager.createRoom(socket.id, nickname);

      socket.join(room.code);
      socket.emit("room:created", {
        roomCode: room.code,
        playerId: player.playerId,
        playerToken: player.token
      });

      emitRoomJoined(room);
    } catch (error) {
      emitRoomError(socket.id, toRoomErrorPayload(error));
    }
  });

  socket.on("room:join", (payload) => {
    if (!payload || typeof payload.roomCode !== "string") {
      emitRoomError(socket.id, {
        code: "BAD_REQUEST",
        message: "A valid room code is required."
      });
      return;
    }

    try {
      const nickname = sanitizeNickname(payload.nickname);
      const { room, player } = roomManager.joinRoom(socket.id, payload.roomCode, nickname);

      socket.join(room.code);
      socket.emit("room:created", {
        roomCode: room.code,
        playerId: player.playerId,
        playerToken: player.token
      });
      emitRoomJoined(room);

      if (roomManager.isFull(room) && roomManager.bothPlayersConnected(room)) {
        startMatch(room);
      }
    } catch (error) {
      emitRoomError(socket.id, toRoomErrorPayload(error));
    }
  });

  socket.on("player:ready", () => {
    // Reserved for future lobby UX.
  });

  socket.on("input:frame", (payload) => {
    roomManager.setPlayerInputBySocket(socket.id, sanitizeInputFrame(payload));
  });

  socket.on("match:rematch_request", () => {
    const membership = roomManager.getMembershipBySocket(socket.id);

    if (!membership) {
      return;
    }

    const room = roomManager.getRoom(membership.roomCode);

    if (!room || room.status !== "ended") {
      return;
    }

    const votes = roomManager.addRematchVote(room, membership.playerId);

    if (votes === 2 && roomManager.isFull(room) && roomManager.bothPlayersConnected(room)) {
      startMatch(room);
    }
  });

  socket.on("player:reconnect", (payload) => {
    if (
      !payload ||
      typeof payload.roomCode !== "string" ||
      typeof payload.playerToken !== "string"
    ) {
      emitRoomError(socket.id, {
        code: "BAD_REQUEST",
        message: "Valid reconnect credentials are required."
      });
      return;
    }

    try {
      const { room, player } = roomManager.reconnectPlayer(
        socket.id,
        payload.roomCode,
        payload.playerToken
      );

      socket.join(room.code);
      socket.emit("room:created", {
        roomCode: room.code,
        playerId: player.playerId,
        playerToken: player.token
      });
      emitRoomJoined(room);

      const runtime = runtimeByRoom.get(room.code);

      if (runtime) {
        socket.emit("match:start", {
          initialState: runtime.simulation.getState(),
          countdownMs: 0
        });
      }

      if (room.status === "paused" && roomManager.bothPlayersConnected(room)) {
        resumeMatch(room);
      }
    } catch (error) {
      emitRoomError(socket.id, toRoomErrorPayload(error));
    }
  });

  socket.on("disconnect", () => {
    const disconnected = roomManager.disconnectSocket(socket.id);

    if (!disconnected) {
      return;
    }

    emitRoomJoined(disconnected.room);

    if (disconnected.room.status === "live") {
      pauseMatch(disconnected.room, disconnected.playerId);
      return;
    }

    if (disconnected.room.status === "waiting") {
      const hasConnectedPlayers = PLAYER_IDS.some((playerId) =>
        disconnected.room.players[playerId]?.connected
      );

      if (!hasConnectedPlayers) {
        removeRoom(disconnected.room.code);
      }
    }
  });
});

setInterval(() => {
  cleanupStaleRooms();
}, 60_000).unref();

httpServer.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Helifight server listening on port ${port}`);
});

function startMatch(room: Room): void {
  stopRuntime(room.code);
  reconnectController.cancelRoom(room.code);

  roomManager.setRoomStatus(room, "live");
  roomManager.clearRematchVotes(room);

  const nowMs = Date.now();
  const simulation = new Simulation(room.code, nowMs);

  const runtime: RoomRuntime = {
    simulation,
    countdownUntilMs: nowMs + MATCH_COUNTDOWN_MS,
    pausedByDisconnect: null,
    tickTimer: setInterval(() => {
      tickRoom(room.code);
    }, Math.floor(1000 / SERVER_TICK_RATE)),
    snapshotTimer: setInterval(() => {
      broadcastSnapshot(room.code);
    }, Math.floor(1000 / SNAPSHOT_RATE))
  };

  runtime.tickTimer.unref();
  runtime.snapshotTimer.unref();

  runtimeByRoom.set(room.code, runtime);

  io.to(room.code).emit("match:start", {
    initialState: simulation.getState(),
    countdownMs: MATCH_COUNTDOWN_MS
  });
}

function tickRoom(roomCode: string): void {
  const room = roomManager.getRoom(roomCode);
  const runtime = runtimeByRoom.get(roomCode);

  if (!room || !runtime || room.status !== "live") {
    return;
  }

  const nowMs = Date.now();

  if (runtime.countdownUntilMs > nowMs) {
    return;
  }

  for (const playerId of PLAYER_IDS) {
    const slot = room.players[playerId];

    if (!slot) {
      continue;
    }

    runtime.simulation.setInput(playerId, slot.lastInput);
  }

  const result = runtime.simulation.step(nowMs, 1000 / SERVER_TICK_RATE);

  for (const event of result.events) {
    io.to(room.code).emit("match:event", event);
  }

  if (result.ended) {
    endMatch(room, result.ended.winner, result.ended.reason);
  }
}

function broadcastSnapshot(roomCode: string): void {
  const room = roomManager.getRoom(roomCode);
  const runtime = runtimeByRoom.get(roomCode);

  if (!room || !runtime) {
    return;
  }

  const payload: MatchSnapshotPayload = {
    state: runtime.simulation.getState(),
    ackSeqByPlayer: {
      P1: room.players.P1?.lastInput.seq,
      P2: room.players.P2?.lastInput.seq
    }
  };

  payload.state.status = room.status;

  io.to(room.code).emit("match:snapshot", payload);
}

function pauseMatch(room: Room, disconnectedPlayerId: PlayerId): void {
  const runtime = runtimeByRoom.get(room.code);

  if (!runtime || room.status !== "live") {
    return;
  }

  roomManager.setRoomStatus(room, "paused");
  runtime.simulation.setStatus("paused");
  runtime.pausedByDisconnect = disconnectedPlayerId;

  io.to(room.code).emit("match:event", {
    type: "pause",
    playerId: disconnectedPlayerId,
    reason: "disconnect"
  });

  reconnectController.start(room.code, disconnectedPlayerId, RECONNECT_WINDOW_MS, () => {
    const staleRoom = roomManager.getRoom(room.code);

    if (!staleRoom) {
      return;
    }

    endMatch(staleRoom, oppositePlayer(disconnectedPlayerId), "forfeit");
  });
}

function resumeMatch(room: Room): void {
  const runtime = runtimeByRoom.get(room.code);

  if (!runtime || room.status !== "paused") {
    return;
  }

  if (runtime.pausedByDisconnect) {
    reconnectController.cancel(room.code, runtime.pausedByDisconnect);
    runtime.pausedByDisconnect = null;
  }

  roomManager.setRoomStatus(room, "live");
  runtime.simulation.setStatus("live");
  runtime.countdownUntilMs = Date.now() + MATCH_COUNTDOWN_MS;

  io.to(room.code).emit("match:event", {
    type: "resume",
    countdownMs: MATCH_COUNTDOWN_MS
  });
}

function endMatch(room: Room, winner: PlayerId, reason: "lives" | "forfeit"): void {
  const runtime = runtimeByRoom.get(room.code);

  if (runtime) {
    runtime.simulation.forceEnd(winner);
    runtime.simulation.setStatus("ended");
  }

  roomManager.setRoomStatus(room, "ended");
  roomManager.clearRematchVotes(room);

  broadcastSnapshot(room.code);
  io.to(room.code).emit("match:end", {
    winner,
    reason
  });

  stopRuntime(room.code);
}

function stopRuntime(roomCode: string): void {
  const runtime = runtimeByRoom.get(roomCode);

  if (!runtime) {
    reconnectController.cancelRoom(roomCode);
    return;
  }

  clearInterval(runtime.tickTimer);
  clearInterval(runtime.snapshotTimer);
  reconnectController.cancelRoom(roomCode);

  runtimeByRoom.delete(roomCode);
}

function cleanupStaleRooms(): void {
  const nowMs = Date.now();

  for (const room of roomManager.listRooms()) {
    const ageMs = nowMs - room.updatedAtMs;

    if (room.status === "waiting" && ageMs > ROOM_IDLE_TTL_MS) {
      removeRoom(room.code);
      continue;
    }

    if (room.status === "ended" && ageMs > ROOM_ENDED_TTL_MS) {
      removeRoom(room.code);
    }
  }
}

function removeRoom(roomCode: string): void {
  const room = roomManager.getRoom(roomCode);

  if (!room) {
    return;
  }

  stopRuntime(roomCode);

  for (const playerId of PLAYER_IDS) {
    const player = room.players[playerId];

    if (!player?.socketId) {
      continue;
    }

    io.to(player.socketId).emit("room:error", {
      code: "INVALID_STATE",
      message: "This room has been closed."
    });
  }

  roomManager.removeRoom(roomCode);
}

function emitRoomJoined(room: Room): void {
  const players: RoomPlayerInfo[] = PLAYER_IDS.flatMap((playerId) => {
    const slot = room.players[playerId];
    if (!slot) {
      return [];
    }

    return [
      {
        playerId,
        nickname: slot.nickname,
        connected: slot.connected
      }
    ];
  });

  for (const playerId of PLAYER_IDS) {
    const slot = room.players[playerId];

    if (!slot?.socketId) {
      continue;
    }

    io.to(slot.socketId).emit("room:joined", {
      roomCode: room.code,
      playerId,
      players
    });
  }
}

function emitRoomError(socketId: string, payload: RoomErrorPayload): void {
  io.to(socketId).emit("room:error", payload);
}

function toRoomErrorPayload(error: unknown): RoomErrorPayload {
  if (error instanceof RoomManagerError) {
    return {
      code: error.code,
      message: error.message
    };
  }

  return {
    code: "INVALID_STATE",
    message: "Unexpected server error."
  };
}

function sanitizeNickname(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return undefined;
  }

  return trimmed.slice(0, 24);
}

function sanitizeInputFrame(input: InputFrame): InputFrame {
  return {
    seq: Number.isFinite(input?.seq) ? Math.max(0, Math.trunc(input.seq)) : 0,
    up: Boolean(input?.up),
    down: Boolean(input?.down),
    left: Boolean(input?.left),
    right: Boolean(input?.right),
    fire: Boolean(input?.fire),
    clientTimeMs: Number.isFinite(input?.clientTimeMs) ? Math.trunc(input.clientTimeMs) : Date.now()
  };
}

function oppositePlayer(playerId: PlayerId): PlayerId {
  return playerId === "P1" ? "P2" : "P1";
}

function serveBuiltClientIfAvailable(): void {
  const dirname = path.dirname(fileURLToPath(import.meta.url));
  const builtClientPath = path.resolve(dirname, "../../client/dist");

  if (!existsSync(builtClientPath)) {
    app.get("/", (_req: any, res: any) => {
      res.type("text/plain").send("Helifight server running. Build client to serve UI from this process.");
    });

    return;
  }

  app.use(express.static(builtClientPath));

  app.get("*", (req: any, res: any, next: any) => {
    if (req.path.startsWith("/socket.io") || req.path.startsWith("/health")) {
      next();
      return;
    }

    res.sendFile(path.join(builtClientPath, "index.html"));
  });
}
