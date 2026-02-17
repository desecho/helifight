# Helifight

A real-time 2-player browser helicopter duel built with TypeScript.

## Tech

- Client: Phaser 3 + Vite + Socket.IO client
- Server: Node.js + Express + Socket.IO
- Shared contracts: TypeScript workspace package (`@helifight/shared`)
- Networking model: authoritative server

## Gameplay

- Two players join the same match using a 6-character game code.
- Each helicopter has 3 lives.
- First player to reduce the opponent to 0 lives wins.
- If a player disconnects during live play, match pauses for up to 30 seconds.
- Reconnect within the window resumes; timeout causes forfeit.

## Monorepo layout

- `packages/shared`: shared constants/types/socket event contracts
- `packages/server`: room lifecycle, simulation loop, authoritative hit/life logic
- `packages/client`: lobby UI + Phaser rendering/input/interpolation

## Run locally

1. Install dependencies:

```bash
npm install
```

2. Start server + client dev mode:

```bash
npm run dev
```

3. Open two browser windows/tabs:
- Player 1: create game, copy room code.
- Player 2: join using that code.

## Build and test

```bash
npm run build
npm run test
```

## Environment variables

### Server

- `PORT` (default: `3000`)
- `CORS_ORIGIN` (comma-separated origins, default `*`)

### Client

- `VITE_SERVER_URL` (default: current browser origin)

## Controls

- Move: `WASD` or arrow keys
- Fire: `Space`
