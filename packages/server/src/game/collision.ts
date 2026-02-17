import {
  HELI_HEIGHT,
  HELI_WIDTH,
  PROJECTILE_RADIUS,
  type HeliState,
  type ProjectileState
} from "@helifight/shared";

export function aabbOverlap(
  ax: number,
  ay: number,
  aw: number,
  ah: number,
  bx: number,
  by: number,
  bw: number,
  bh: number
): boolean {
  return (
    Math.abs(ax - bx) * 2 < aw + bw &&
    Math.abs(ay - by) * 2 < ah + bh
  );
}

export function projectileHitsHelicopter(
  projectile: ProjectileState,
  helicopter: HeliState
): boolean {
  return aabbOverlap(
    projectile.pos.x,
    projectile.pos.y,
    PROJECTILE_RADIUS * 2,
    PROJECTILE_RADIUS * 2,
    helicopter.pos.x,
    helicopter.pos.y,
    HELI_WIDTH,
    HELI_HEIGHT
  );
}
