import type { MatchState, PlayerId, ProjectileState } from "@helifight/shared";

interface SnapshotSample {
  receivedAtMs: number;
  state: MatchState;
}

const PLAYER_IDS: PlayerId[] = ["P1", "P2"];

export class SnapshotBuffer {
  private readonly snapshots: SnapshotSample[] = [];

  public reset(): void {
    this.snapshots.length = 0;
  }

  public push(state: MatchState, receivedAtMs = performance.now()): void {
    this.snapshots.push({
      receivedAtMs,
      state: cloneState(state)
    });

    if (this.snapshots.length > 90) {
      this.snapshots.splice(0, this.snapshots.length - 90);
    }
  }

  public latest(): MatchState | undefined {
    const value = this.snapshots[this.snapshots.length - 1];
    return value ? cloneState(value.state) : undefined;
  }

  public sample(renderAtMs: number): MatchState | undefined {
    if (this.snapshots.length === 0) {
      return undefined;
    }

    if (this.snapshots.length === 1) {
      return cloneState(this.snapshots[0].state);
    }

    const first = this.snapshots[0];
    const last = this.snapshots[this.snapshots.length - 1];

    if (renderAtMs <= first.receivedAtMs) {
      return cloneState(first.state);
    }

    if (renderAtMs >= last.receivedAtMs) {
      return cloneState(last.state);
    }

    for (let index = 0; index < this.snapshots.length - 1; index += 1) {
      const older = this.snapshots[index];
      const newer = this.snapshots[index + 1];

      if (renderAtMs < older.receivedAtMs || renderAtMs > newer.receivedAtMs) {
        continue;
      }

      const blend =
        (renderAtMs - older.receivedAtMs) / (newer.receivedAtMs - older.receivedAtMs || 1);

      return interpolateState(older.state, newer.state, blend);
    }

    return cloneState(last.state);
  }
}

function interpolateState(older: MatchState, newer: MatchState, blend: number): MatchState {
  const t = clamp01(blend);

  return {
    roomCode: newer.roomCode,
    status: newer.status,
    serverTimeMs: lerp(older.serverTimeMs, newer.serverTimeMs, t),
    winner: newer.winner,
    helicopters: {
      P1: {
        ...newer.helicopters.P1,
        pos: {
          x: lerp(older.helicopters.P1.pos.x, newer.helicopters.P1.pos.x, t),
          y: lerp(older.helicopters.P1.pos.y, newer.helicopters.P1.pos.y, t)
        },
        vel: {
          x: lerp(older.helicopters.P1.vel.x, newer.helicopters.P1.vel.x, t),
          y: lerp(older.helicopters.P1.vel.y, newer.helicopters.P1.vel.y, t)
        }
      },
      P2: {
        ...newer.helicopters.P2,
        pos: {
          x: lerp(older.helicopters.P2.pos.x, newer.helicopters.P2.pos.x, t),
          y: lerp(older.helicopters.P2.pos.y, newer.helicopters.P2.pos.y, t)
        },
        vel: {
          x: lerp(older.helicopters.P2.vel.x, newer.helicopters.P2.vel.x, t),
          y: lerp(older.helicopters.P2.vel.y, newer.helicopters.P2.vel.y, t)
        }
      }
    },
    projectiles: interpolateProjectiles(older.projectiles, newer.projectiles, t)
  };
}

function interpolateProjectiles(
  older: ProjectileState[],
  newer: ProjectileState[],
  blend: number
): ProjectileState[] {
  const olderById = new Map<string, ProjectileState>(older.map((value) => [value.id, value]));

  return newer.map((current) => {
    const previous = olderById.get(current.id);

    if (!previous) {
      return {
        id: current.id,
        owner: current.owner,
        pos: { ...current.pos },
        vel: { ...current.vel },
        expiresAtMs: current.expiresAtMs
      };
    }

    return {
      id: current.id,
      owner: current.owner,
      pos: {
        x: lerp(previous.pos.x, current.pos.x, blend),
        y: lerp(previous.pos.y, current.pos.y, blend)
      },
      vel: {
        x: lerp(previous.vel.x, current.vel.x, blend),
        y: lerp(previous.vel.y, current.vel.y, blend)
      },
      expiresAtMs: current.expiresAtMs
    };
  });
}

function cloneState(state: MatchState): MatchState {
  const helicopters = Object.fromEntries(
    PLAYER_IDS.map((playerId) => {
      const source = state.helicopters[playerId];

      return [
        playerId,
        {
          playerId: source.playerId,
          pos: { ...source.pos },
          vel: { ...source.vel },
          lives: source.lives,
          facing: source.facing,
          invulnUntilMs: source.invulnUntilMs
        }
      ];
    })
  ) as MatchState["helicopters"];

  return {
    roomCode: state.roomCode,
    status: state.status,
    serverTimeMs: state.serverTimeMs,
    helicopters,
    projectiles: state.projectiles.map((projectile) => ({
      id: projectile.id,
      owner: projectile.owner,
      pos: { ...projectile.pos },
      vel: { ...projectile.vel },
      expiresAtMs: projectile.expiresAtMs
    })),
    winner: state.winner
  };
}

function lerp(start: number, end: number, t: number): number {
  return start + (end - start) * t;
}

function clamp01(value: number): number {
  if (value < 0) {
    return 0;
  }

  if (value > 1) {
    return 1;
  }

  return value;
}
