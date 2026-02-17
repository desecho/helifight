export const ROOM_CODE_CHARSET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const ROOM_CODE_LENGTH = 6;

export const STARTING_LIVES = 3;

export const ARENA_WIDTH = 1280;
export const ARENA_HEIGHT = 720;

export const HELI_WIDTH = 84;
export const HELI_HEIGHT = 32;
export const HELI_MAX_SPEED_X = 260;
export const HELI_MAX_SPEED_Y = 220;
export const HELI_ACCEL_X = 520;
export const HELI_ACCEL_Y = 420;
export const HELI_DAMPING = 0.9;

export const PROJECTILE_RADIUS = 4;
export const PROJECTILE_SPEED = 560;
export const PROJECTILE_TTL_MS = 2200;
export const FIRE_COOLDOWN_MS = 250;

export const RESPAWN_INVULN_MS = 1000;

export const SERVER_TICK_RATE = 30;
export const SNAPSHOT_RATE = 15;
export const INPUT_SEND_RATE = 20;

export const MATCH_COUNTDOWN_MS = 3000;
export const RECONNECT_WINDOW_MS = 30_000;

export const ROOM_IDLE_TTL_MS = 15 * 60 * 1000;
export const ROOM_ENDED_TTL_MS = 10 * 60 * 1000;

export const P1_SPAWN = { x: 180, y: ARENA_HEIGHT * 0.33 };
export const P2_SPAWN = { x: ARENA_WIDTH - 180, y: ARENA_HEIGHT * 0.33 };
