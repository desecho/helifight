import {
  ARENA_HEIGHT,
  ARENA_WIDTH,
  EMPTY_INPUT_FRAME,
  FIRE_COOLDOWN_MS,
  HELI_ACCEL_X,
  HELI_ACCEL_Y,
  HELI_DAMPING,
  HELI_HEIGHT,
  HELI_MAX_SPEED_X,
  HELI_MAX_SPEED_Y,
  HELI_WIDTH,
  P1_SPAWN,
  P2_SPAWN,
  PROJECTILE_RADIUS,
  PROJECTILE_SPEED,
  PROJECTILE_TTL_MS,
  RESPAWN_INVULN_MS,
  STARTING_LIVES,
  type HeliState,
  type InputFrame,
  type MatchEventPayload,
  type MatchState,
  type PlayerId,
  type ProjectileState,
  type RoomStatus
} from "@helifight/shared";
import { projectileHitsHelicopter } from "./collision";

const PLAYER_IDS: PlayerId[] = ["P1", "P2"];

export interface StepResult {
  events: MatchEventPayload[];
  ended?: {
    winner: PlayerId;
    reason: "lives";
  };
}

export class Simulation {
  private readonly state: MatchState;
  private readonly latestInput: Record<PlayerId, InputFrame>;
  private readonly lastFireAtMs: Record<PlayerId, number>;
  private projectileCounter = 0;

  public constructor(roomCode: string, nowMs: number) {
    this.state = {
      roomCode,
      status: "live",
      serverTimeMs: nowMs,
      helicopters: {
        P1: this.createInitialHelicopter("P1"),
        P2: this.createInitialHelicopter("P2")
      },
      projectiles: []
    };

    this.latestInput = {
      P1: { ...EMPTY_INPUT_FRAME },
      P2: { ...EMPTY_INPUT_FRAME }
    };

    this.lastFireAtMs = {
      P1: -FIRE_COOLDOWN_MS,
      P2: -FIRE_COOLDOWN_MS
    };
  }

  public setStatus(status: RoomStatus): void {
    this.state.status = status;
  }

  public setInput(playerId: PlayerId, input: InputFrame): void {
    this.latestInput[playerId] = input;
  }

  public getAckSeqByPlayer(): Partial<Record<PlayerId, number>> {
    return {
      P1: this.latestInput.P1.seq,
      P2: this.latestInput.P2.seq
    };
  }

  public forceEnd(winner: PlayerId): void {
    this.state.winner = winner;
    this.state.status = "ended";
  }

  public getState(): MatchState {
    return {
      roomCode: this.state.roomCode,
      status: this.state.status,
      serverTimeMs: this.state.serverTimeMs,
      helicopters: {
        P1: this.copyHelicopter(this.state.helicopters.P1),
        P2: this.copyHelicopter(this.state.helicopters.P2)
      },
      projectiles: this.state.projectiles.map((projectile) => this.copyProjectile(projectile)),
      winner: this.state.winner
    };
  }

  public step(nowMs: number, deltaMs: number): StepResult {
    const events: MatchEventPayload[] = [];

    if (this.state.status !== "live") {
      this.state.serverTimeMs = nowMs;
      return { events };
    }

    const dt = deltaMs / 1000;

    for (const playerId of PLAYER_IDS) {
      this.applyMovement(playerId, dt);
      this.maybeFireProjectile(playerId, nowMs);
    }

    const remainingProjectiles: ProjectileState[] = [];

    for (const projectile of this.state.projectiles) {
      projectile.pos.x += projectile.vel.x * dt;
      projectile.pos.y += projectile.vel.y * dt;

      if (projectile.expiresAtMs <= nowMs || this.isProjectileOutOfBounds(projectile)) {
        continue;
      }

      const targetId = projectile.owner === "P1" ? "P2" : "P1";
      const target = this.state.helicopters[targetId];

      if (target.invulnUntilMs > nowMs) {
        remainingProjectiles.push(projectile);
        continue;
      }

      if (!projectileHitsHelicopter(projectile, target)) {
        remainingProjectiles.push(projectile);
        continue;
      }

      target.lives -= 1;
      events.push({
        type: "hit",
        by: projectile.owner,
        target: targetId,
        livesLeft: target.lives
      });

      if (target.lives <= 0) {
        this.state.status = "ended";
        this.state.winner = projectile.owner;
        this.state.projectiles = remainingProjectiles;
        this.state.serverTimeMs = nowMs;

        return {
          events,
          ended: {
            winner: projectile.owner,
            reason: "lives"
          }
        };
      }

      const spawn = targetId === "P1" ? P1_SPAWN : P2_SPAWN;
      target.pos = { ...spawn };
      target.vel = { x: 0, y: 0 };
      target.invulnUntilMs = nowMs + RESPAWN_INVULN_MS;

      events.push({
        type: "respawn",
        playerId: targetId
      });
    }

    this.state.projectiles = remainingProjectiles;
    this.state.serverTimeMs = nowMs;

    return { events };
  }

  private applyMovement(playerId: PlayerId, dt: number): void {
    const helicopter = this.state.helicopters[playerId];
    const input = this.latestInput[playerId];

    const xDirection = Number(input.right) - Number(input.left);
    const yDirection = Number(input.down) - Number(input.up);

    helicopter.vel.x += xDirection * HELI_ACCEL_X * dt;
    helicopter.vel.y += yDirection * HELI_ACCEL_Y * dt;

    helicopter.vel.x *= HELI_DAMPING;
    helicopter.vel.y *= HELI_DAMPING;

    helicopter.vel.x = clamp(helicopter.vel.x, -HELI_MAX_SPEED_X, HELI_MAX_SPEED_X);
    helicopter.vel.y = clamp(helicopter.vel.y, -HELI_MAX_SPEED_Y, HELI_MAX_SPEED_Y);

    helicopter.pos.x += helicopter.vel.x * dt;
    helicopter.pos.y += helicopter.vel.y * dt;

    if (xDirection !== 0) {
      helicopter.facing = xDirection > 0 ? 1 : -1;
    }

    const halfWidth = HELI_WIDTH / 2;
    const halfHeight = HELI_HEIGHT / 2;

    helicopter.pos.x = clamp(helicopter.pos.x, halfWidth, ARENA_WIDTH - halfWidth);
    helicopter.pos.y = clamp(helicopter.pos.y, halfHeight, ARENA_HEIGHT - halfHeight);
  }

  private maybeFireProjectile(playerId: PlayerId, nowMs: number): void {
    const input = this.latestInput[playerId];

    if (!input.fire) {
      return;
    }

    if (nowMs - this.lastFireAtMs[playerId] < FIRE_COOLDOWN_MS) {
      return;
    }

    this.lastFireAtMs[playerId] = nowMs;

    const helicopter = this.state.helicopters[playerId];
    const muzzleOffset = HELI_WIDTH / 2 + PROJECTILE_RADIUS + 2;

    const projectile: ProjectileState = {
      id: `${playerId}-${this.projectileCounter}`,
      owner: playerId,
      pos: {
        x: helicopter.pos.x + helicopter.facing * muzzleOffset,
        y: helicopter.pos.y
      },
      vel: {
        x: helicopter.facing * PROJECTILE_SPEED,
        y: 0
      },
      expiresAtMs: nowMs + PROJECTILE_TTL_MS
    };

    this.projectileCounter += 1;
    this.state.projectiles.push(projectile);
  }

  private createInitialHelicopter(playerId: PlayerId): HeliState {
    const spawn = playerId === "P1" ? P1_SPAWN : P2_SPAWN;

    return {
      playerId,
      pos: { ...spawn },
      vel: { x: 0, y: 0 },
      lives: STARTING_LIVES,
      facing: playerId === "P1" ? 1 : -1,
      invulnUntilMs: 0
    };
  }

  private isProjectileOutOfBounds(projectile: ProjectileState): boolean {
    return (
      projectile.pos.x < -PROJECTILE_RADIUS ||
      projectile.pos.x > ARENA_WIDTH + PROJECTILE_RADIUS ||
      projectile.pos.y < -PROJECTILE_RADIUS ||
      projectile.pos.y > ARENA_HEIGHT + PROJECTILE_RADIUS
    );
  }

  private copyHelicopter(helicopter: HeliState): HeliState {
    return {
      playerId: helicopter.playerId,
      pos: { ...helicopter.pos },
      vel: { ...helicopter.vel },
      lives: helicopter.lives,
      facing: helicopter.facing,
      invulnUntilMs: helicopter.invulnUntilMs
    };
  }

  private copyProjectile(projectile: ProjectileState): ProjectileState {
    return {
      id: projectile.id,
      owner: projectile.owner,
      pos: { ...projectile.pos },
      vel: { ...projectile.vel },
      expiresAtMs: projectile.expiresAtMs
    };
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
