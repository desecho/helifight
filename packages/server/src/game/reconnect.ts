import type { PlayerId } from "@helifight/shared";

export class ReconnectController {
  private readonly timers = new Map<string, NodeJS.Timeout>();

  public start(
    roomCode: string,
    playerId: PlayerId,
    durationMs: number,
    onExpire: () => void
  ): void {
    this.cancel(roomCode, playerId);

    const timer = setTimeout(() => {
      this.timers.delete(this.buildKey(roomCode, playerId));
      onExpire();
    }, durationMs);

    this.timers.set(this.buildKey(roomCode, playerId), timer);
  }

  public cancel(roomCode: string, playerId: PlayerId): void {
    const key = this.buildKey(roomCode, playerId);
    const timer = this.timers.get(key);

    if (!timer) {
      return;
    }

    clearTimeout(timer);
    this.timers.delete(key);
  }

  public cancelRoom(roomCode: string): void {
    for (const [key, timer] of this.timers.entries()) {
      if (!key.startsWith(`${roomCode}:`)) {
        continue;
      }

      clearTimeout(timer);
      this.timers.delete(key);
    }
  }

  private buildKey(roomCode: string, playerId: PlayerId): string {
    return `${roomCode}:${playerId}`;
  }
}
