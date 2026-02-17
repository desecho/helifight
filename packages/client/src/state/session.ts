import type { PlayerId, RoomPlayerInfo } from "@helifight/shared";

const STORAGE_KEY = "helifight_session";

export interface SessionState {
  roomCode?: string;
  playerId?: PlayerId;
  playerToken?: string;
  players: RoomPlayerInfo[];
}

export const sessionState: SessionState = {
  players: []
};

export function loadSessionFromStorage(): void {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);

    if (!raw) {
      return;
    }

    const parsed = JSON.parse(raw) as Partial<SessionState>;

    sessionState.roomCode = parsed.roomCode;
    sessionState.playerId = parsed.playerId;
    sessionState.playerToken = parsed.playerToken;
    sessionState.players = Array.isArray(parsed.players) ? parsed.players : [];
  } catch {
    // Ignore malformed browser storage.
  }
}

export function saveSessionToStorage(): void {
  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(sessionState));
}

export function setSessionState(next: Partial<SessionState>): void {
  Object.assign(sessionState, next);
  saveSessionToStorage();
}
