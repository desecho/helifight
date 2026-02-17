export type PlayerId = "P1" | "P2";
export type RoomStatus = "waiting" | "live" | "paused" | "ended";

export interface Vec2 {
  x: number;
  y: number;
}

export interface InputFrame {
  seq: number;
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  fire: boolean;
  clientTimeMs: number;
}

export interface HeliState {
  playerId: PlayerId;
  pos: Vec2;
  vel: Vec2;
  lives: number;
  facing: 1 | -1;
  invulnUntilMs: number;
}

export interface ProjectileState {
  id: string;
  owner: PlayerId;
  pos: Vec2;
  vel: Vec2;
  expiresAtMs: number;
}

export interface MatchState {
  roomCode: string;
  status: RoomStatus;
  serverTimeMs: number;
  helicopters: Record<PlayerId, HeliState>;
  projectiles: ProjectileState[];
  winner?: PlayerId;
}

export interface RoomPlayerInfo {
  playerId: PlayerId;
  nickname?: string;
  connected: boolean;
}

export interface RoomCreatePayload {
  nickname?: string;
}

export interface RoomJoinPayload {
  roomCode: string;
  nickname?: string;
}

export interface RoomCreatedPayload {
  roomCode: string;
  playerId: PlayerId;
  playerToken: string;
}

export interface RoomJoinedPayload {
  roomCode: string;
  playerId: PlayerId;
  players: RoomPlayerInfo[];
}

export interface RoomErrorPayload {
  code:
    | "ROOM_NOT_FOUND"
    | "ROOM_FULL"
    | "INVALID_STATE"
    | "ALREADY_IN_ROOM"
    | "RECONNECT_FAILED"
    | "BAD_REQUEST";
  message: string;
}

export interface MatchStartPayload {
  initialState: MatchState;
  countdownMs: number;
}

export interface MatchSnapshotPayload {
  state: MatchState;
  ackSeqByPlayer: Partial<Record<PlayerId, number>>;
}

export type MatchEventPayload =
  | {
      type: "hit";
      by: PlayerId;
      target: PlayerId;
      livesLeft: number;
    }
  | {
      type: "respawn";
      playerId: PlayerId;
    }
  | {
      type: "pause";
      playerId: PlayerId;
      reason: "disconnect";
    }
  | {
      type: "resume";
      countdownMs: number;
    };

export interface MatchEndPayload {
  winner: PlayerId;
  reason: "lives" | "forfeit";
}

export interface PlayerReconnectPayload {
  roomCode: string;
  playerToken: string;
}

export interface ServerToClientEvents {
  "room:created": (payload: RoomCreatedPayload) => void;
  "room:joined": (payload: RoomJoinedPayload) => void;
  "room:error": (payload: RoomErrorPayload) => void;
  "match:start": (payload: MatchStartPayload) => void;
  "match:snapshot": (payload: MatchSnapshotPayload) => void;
  "match:event": (payload: MatchEventPayload) => void;
  "match:end": (payload: MatchEndPayload) => void;
}

export interface ClientToServerEvents {
  "room:create": (payload: RoomCreatePayload) => void;
  "room:join": (payload: RoomJoinPayload) => void;
  "player:ready": () => void;
  "input:frame": (payload: InputFrame) => void;
  "match:rematch_request": () => void;
  "player:reconnect": (payload: PlayerReconnectPayload) => void;
}

export const EMPTY_INPUT_FRAME: InputFrame = {
  seq: 0,
  up: false,
  down: false,
  left: false,
  right: false,
  fire: false,
  clientTimeMs: 0
};
