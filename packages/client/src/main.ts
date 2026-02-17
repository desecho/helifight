import Phaser from "phaser";
import {
  ARENA_HEIGHT,
  ARENA_WIDTH,
  type RoomErrorPayload,
  type RoomJoinedPayload
} from "@helifight/shared";
import "./style.css";
import { socketClient } from "./net/socket-client";
import { LobbyScene } from "./scenes/LobbyScene";
import { MatchScene } from "./scenes/MatchScene";
import { loadSessionFromStorage, sessionState, setSessionState } from "./state/session";

loadSessionFromStorage();

const panelElement = document.getElementById("panel");

if (!panelElement) {
  throw new Error("Missing #panel container");
}

panelElement.innerHTML = `
  <h1 class="panel-title">Helifight</h1>
  <p class="panel-subtitle">Two pilots. Three lives each.</p>

  <div class="control-group">
    <button id="create-btn" class="primary">Create Game</button>
  </div>

  <div class="control-group">
    <label for="code-input">Join with code</label>
    <input id="code-input" maxlength="6" autocomplete="off" placeholder="AB12CD" />
    <button id="join-btn" class="secondary">Join Game</button>
  </div>

  <div class="control-group">
    <button id="rematch-btn" class="rematch" style="display:none;">Request Rematch</button>
  </div>

  <div id="status" class="status"></div>

  <div class="meta">
    <div>Room Code: <strong id="room-code">-</strong></div>
    <div>You: <strong id="player-id">-</strong></div>
    <div>Players: <strong id="player-list">-</strong></div>
    <div>Controls: <strong>WASD / Arrows + Space</strong></div>
  </div>
`;

const codeInput = mustGet<HTMLInputElement>("code-input");
const createButton = mustGet<HTMLButtonElement>("create-btn");
const joinButton = mustGet<HTMLButtonElement>("join-btn");
const rematchButton = mustGet<HTMLButtonElement>("rematch-btn");
const statusElement = mustGet<HTMLDivElement>("status");
const roomCodeElement = mustGet<HTMLElement>("room-code");
const playerIdElement = mustGet<HTMLElement>("player-id");
const playerListElement = mustGet<HTMLElement>("player-list");

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game-container",
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: ARENA_WIDTH,
    height: ARENA_HEIGHT
  },
  backgroundColor: "#111",
  scene: [LobbyScene, MatchScene]
});

setStatus("Connecting to server...");
renderSessionMeta();

createButton.addEventListener("click", () => {
  if (!socketClient.isConnected()) {
    setStatus("Not connected to game server. Start server on port 3000 and retry.", true);
    return;
  }

  setStatus("Creating game room...");
  socketClient.createRoom();
});

joinButton.addEventListener("click", () => {
  if (!socketClient.isConnected()) {
    setStatus("Not connected to game server. Start server on port 3000 and retry.", true);
    return;
  }

  const roomCode = codeInput.value.trim().toUpperCase();

  if (!roomCode) {
    setStatus("Enter a room code first.", true);
    return;
  }

  setStatus(`Joining ${roomCode}...`);
  socketClient.joinRoom(roomCode);
});

codeInput.addEventListener("input", () => {
  codeInput.value = codeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
});

rematchButton.addEventListener("click", () => {
  setStatus("Rematch requested. Waiting for other player...");
  rematchButton.disabled = true;
  socketClient.requestRematch();
});

socketClient.onConnect(() => {
  setStatus("Connected.");

  if (sessionState.roomCode && sessionState.playerToken) {
    setStatus(`Reconnecting to ${sessionState.roomCode}...`);
    socketClient.reconnect(sessionState.roomCode, sessionState.playerToken);
  }
});

socketClient.onDisconnect((reason) => {
  setStatus(`Disconnected from server (${reason}). Waiting for reconnect...`, true);
});

socketClient.on("room:created", (payload) => {
  setSessionState({
    roomCode: payload.roomCode,
    playerId: payload.playerId,
    playerToken: payload.playerToken
  });

  rematchButton.style.display = "none";
  rematchButton.disabled = false;
  setStatus(`Game created. Share code ${payload.roomCode} with your opponent.`);
  renderSessionMeta();
});

socketClient.on("room:joined", (payload) => {
  setRoomJoinedState(payload);

  if (payload.players.length < 2) {
    setStatus(`Waiting for second pilot in ${payload.roomCode}...`);
  } else {
    setStatus("Both pilots connected. Match loading...");
  }

  renderSessionMeta();
});

socketClient.on("room:error", (payload) => {
  handleRoomError(payload);
});

socketClient.on("match:start", (payload) => {
  rematchButton.style.display = "none";
  rematchButton.disabled = false;
  setStatus(
    payload.countdownMs > 0
      ? `Match starting in ${Math.ceil(payload.countdownMs / 1000)}...`
      : "Match resumed"
  );

  const scene = getMatchScene();

  if (!scene || !game.scene.isActive("MatchScene")) {
    game.scene.start("MatchScene", { startPayload: payload });
    return;
  }

  scene.beginMatch(payload);
});

socketClient.on("match:snapshot", (payload) => {
  const scene = getMatchScene();
  scene?.applySnapshot(payload);
});

socketClient.on("match:event", (payload) => {
  const scene = getMatchScene();
  scene?.applyMatchEvent(payload);

  if (payload.type === "pause") {
    setStatus("Opponent disconnected. Match paused.", true);
    return;
  }

  if (payload.type === "resume") {
    setStatus(`Match resuming in ${Math.ceil(payload.countdownMs / 1000)}...`);
  }
});

socketClient.on("match:end", (payload) => {
  const scene = getMatchScene();
  scene?.finishMatch(payload);

  rematchButton.style.display = "inline-flex";
  rematchButton.disabled = false;

  const message =
    payload.reason === "forfeit"
      ? `${payload.winner} wins by forfeit.`
      : `${payload.winner} wins the match.`;

  setStatus(message);
});

function setStatus(message: string, isError = false): void {
  statusElement.textContent = message;
  statusElement.classList.toggle("error", isError);
}

function setRoomJoinedState(payload: RoomJoinedPayload): void {
  setSessionState({
    roomCode: payload.roomCode,
    playerId: payload.playerId,
    players: payload.players
  });
}

function renderSessionMeta(): void {
  roomCodeElement.textContent = sessionState.roomCode ?? "-";
  playerIdElement.textContent = sessionState.playerId ?? "-";

  if (sessionState.players.length === 0) {
    playerListElement.textContent = "-";
    return;
  }

  playerListElement.textContent = sessionState.players
    .map((player) => `${player.playerId}${player.connected ? "" : " (offline)"}`)
    .join(", ");
}

function handleRoomError(payload: RoomErrorPayload): void {
  if (payload.code === "RECONNECT_FAILED") {
    setStatus("Reconnect failed. Create or join a new room.", true);
    return;
  }

  setStatus(payload.message, true);
}

function getMatchScene(): MatchScene | null {
  const scene = game.scene.getScene("MatchScene");
  return scene ? (scene as MatchScene) : null;
}

function mustGet<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);

  if (!element) {
    throw new Error(`Missing element with id '${id}'`);
  }

  return element as T;
}
