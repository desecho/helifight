import Phaser from "phaser";
import {
  ARENA_HEIGHT,
  ARENA_WIDTH,
  HELI_WIDTH,
  INPUT_SEND_RATE,
  PROJECTILE_RADIUS,
  type MatchEndPayload,
  type MatchEventPayload,
  type MatchSnapshotPayload,
  type MatchStartPayload,
  type MatchState,
  type PlayerId
} from "@helifight/shared";
import { socketClient } from "../net/socket-client";
import { SnapshotBuffer } from "../state/interpolation";

const RENDER_DELAY_MS = 100;
const HELI_P1_TEXTURE_KEY = "helicopter-p1";
const HELI_P2_TEXTURE_KEY = "helicopter-p2";
const HELI_TEXTURE_WIDTH = 128;
const HELI_TEXTURE_HEIGHT = 72;
const HELI_SPRITE_SCALE = HELI_WIDTH / HELI_TEXTURE_WIDTH;

type ControlKeys = Phaser.Types.Input.Keyboard.CursorKeys & {
  w: Phaser.Input.Keyboard.Key;
  a: Phaser.Input.Keyboard.Key;
  s: Phaser.Input.Keyboard.Key;
  d: Phaser.Input.Keyboard.Key;
  space: Phaser.Input.Keyboard.Key;
};

export class MatchScene extends Phaser.Scene {
  private readonly buffer = new SnapshotBuffer();
  private readonly helicopterBodies = new Map<PlayerId, Phaser.GameObjects.Sprite>();
  private readonly projectileViews = new Map<string, Phaser.GameObjects.Arc>();

  private controls!: ControlKeys;
  private leftLivesText!: Phaser.GameObjects.Text;
  private rightLivesText!: Phaser.GameObjects.Text;
  private centerStatusText!: Phaser.GameObjects.Text;
  private winnerText!: Phaser.GameObjects.Text;

  private isLive = false;
  private countdownEndAt = 0;
  private lastInputSentAt = 0;
  private inputSeq = 0;
  private pendingStartPayload?: MatchStartPayload;

  public constructor() {
    super("MatchScene");
  }

  public init(data: { startPayload?: MatchStartPayload }): void {
    if (data?.startPayload) {
      this.pendingStartPayload = data.startPayload;
    }
  }

  public create(): void {
    this.ensureHelicopterTextures();
    this.drawBackdrop();

    this.leftLivesText = this.add
      .text(18, 18, "P1 Lives: 3", {
        color: "#ffffff",
        fontFamily: "Avenir Next, sans-serif",
        fontSize: "28px",
        fontStyle: "bold"
      })
      .setDepth(20);

    this.rightLivesText = this.add
      .text(ARENA_WIDTH - 18, 18, "P2 Lives: 3", {
        color: "#ffffff",
        fontFamily: "Avenir Next, sans-serif",
        fontSize: "28px",
        fontStyle: "bold"
      })
      .setOrigin(1, 0)
      .setDepth(20);

    this.centerStatusText = this.add
      .text(ARENA_WIDTH / 2, 42, "Waiting for match data...", {
        color: "#ffffff",
        fontFamily: "Avenir Next, sans-serif",
        fontSize: "24px"
      })
      .setOrigin(0.5, 0.5)
      .setDepth(20);

    this.winnerText = this.add
      .text(ARENA_WIDTH / 2, ARENA_HEIGHT / 2, "", {
        color: "#ffd166",
        fontFamily: "Avenir Next, sans-serif",
        fontSize: "68px",
        fontStyle: "bold"
      })
      .setOrigin(0.5)
      .setDepth(30)
      .setVisible(false);

    const cursor = this.input.keyboard?.createCursorKeys();

    if (!cursor) {
      throw new Error("Keyboard input is unavailable in this browser.");
    }

    this.controls = {
      ...cursor,
      w: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      a: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      s: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      d: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.D),
      space: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE)
    };

    if (this.pendingStartPayload) {
      const payload = this.pendingStartPayload;
      this.pendingStartPayload = undefined;
      this.beginMatch(payload);
    }
  }

  public beginMatch(payload: MatchStartPayload): void {
    this.buffer.reset();
    this.buffer.push(payload.initialState);

    this.isLive = true;
    this.countdownEndAt = performance.now() + payload.countdownMs;
    this.winnerText.setVisible(false);
    this.centerStatusText.setText(
      payload.countdownMs > 0 ? `Round starts in ${Math.ceil(payload.countdownMs / 1000)}` : "Fight"
    );
  }

  public applySnapshot(payload: MatchSnapshotPayload): void {
    this.buffer.push(payload.state);
  }

  public applyMatchEvent(payload: MatchEventPayload): void {
    if (payload.type === "pause") {
      this.centerStatusText.setText("Match paused: opponent disconnected");
      this.isLive = false;
      return;
    }

    if (payload.type === "resume") {
      this.countdownEndAt = performance.now() + payload.countdownMs;
      this.centerStatusText.setText(`Resuming in ${Math.ceil(payload.countdownMs / 1000)}`);
      this.isLive = true;
      return;
    }

    if (payload.type === "hit") {
      this.centerStatusText.setText(`${payload.by} hit ${payload.target}`);
      return;
    }

    if (payload.type === "respawn") {
      this.centerStatusText.setText(`${payload.playerId} respawned`);
    }
  }

  public finishMatch(payload: MatchEndPayload): void {
    this.isLive = false;
    this.winnerText
      .setText(`${payload.winner} Wins`)
      .setVisible(true);

    this.centerStatusText.setText(
      payload.reason === "forfeit" ? "Match ended by forfeit" : "Match complete"
    );
  }

  public update(time: number): void {
    const sampledState = this.buffer.sample(performance.now() - RENDER_DELAY_MS) ?? this.buffer.latest();

    if (!sampledState) {
      return;
    }

    this.renderState(sampledState);
    this.updateStatusClock();

    if (!this.isLive || sampledState.status !== "live") {
      return;
    }

    const timeBetweenInputs = 1000 / INPUT_SEND_RATE;

    if (time - this.lastInputSentAt < timeBetweenInputs) {
      return;
    }

    this.lastInputSentAt = time;

    socketClient.sendInput({
      seq: this.inputSeq,
      up: this.controls.up.isDown || this.controls.w.isDown,
      down: this.controls.down.isDown || this.controls.s.isDown,
      left: this.controls.left.isDown || this.controls.a.isDown,
      right: this.controls.right.isDown || this.controls.d.isDown,
      fire: this.controls.space.isDown,
      clientTimeMs: Date.now()
    });

    this.inputSeq += 1;
  }

  private updateStatusClock(): void {
    if (this.countdownEndAt <= 0) {
      return;
    }

    const remaining = this.countdownEndAt - performance.now();

    if (remaining <= 0) {
      this.countdownEndAt = 0;
      this.centerStatusText.setText("Fight");
      return;
    }

    this.centerStatusText.setText(`Starts in ${Math.ceil(remaining / 1000)}`);
  }

  private renderState(state: MatchState): void {
    this.leftLivesText.setText(`P1 Lives: ${state.helicopters.P1.lives}`);
    this.rightLivesText.setText(`P2 Lives: ${state.helicopters.P2.lives}`);

    for (const playerId of ["P1", "P2"] as PlayerId[]) {
      const helicopter = state.helicopters[playerId];
      const textureKey = playerId === "P1" ? HELI_P1_TEXTURE_KEY : HELI_P2_TEXTURE_KEY;
      const isInvulnerable = helicopter.invulnUntilMs > state.serverTimeMs;

      let body = this.helicopterBodies.get(playerId);
      if (!body) {
        body = this.add
          .sprite(helicopter.pos.x, helicopter.pos.y, textureKey)
          .setDepth(10)
          .setScale(HELI_SPRITE_SCALE);
        this.helicopterBodies.set(playerId, body);
      }

      body.setPosition(helicopter.pos.x, helicopter.pos.y);
      body.setFlipX(helicopter.facing > 0);
      body.setAngle(helicopter.vel.y * 0.06);
      if (isInvulnerable) {
        body.setTint(0xffd166);
      } else {
        body.clearTint();
      }
    }

    const nextProjectileIds = new Set(state.projectiles.map((projectile) => projectile.id));

    for (const [projectileId, view] of this.projectileViews.entries()) {
      if (nextProjectileIds.has(projectileId)) {
        continue;
      }

      view.destroy();
      this.projectileViews.delete(projectileId);
    }

    for (const projectile of state.projectiles) {
      let view = this.projectileViews.get(projectile.id);

      if (!view) {
        view = this.add
          .circle(projectile.pos.x, projectile.pos.y, PROJECTILE_RADIUS, 0xfff5d9)
          .setDepth(8)
          .setStrokeStyle(2, 0xffa54a, 0.9);

        this.projectileViews.set(projectile.id, view);
      }

      view.setPosition(projectile.pos.x, projectile.pos.y);
    }
  }

  private ensureHelicopterTextures(): void {
    this.createHelicopterTexture(HELI_P1_TEXTURE_KEY, {
      body: 0x44c171,
      accent: 0x2f8f51,
      glass: 0xdff8ea
    });

    this.createHelicopterTexture(HELI_P2_TEXTURE_KEY, {
      body: 0xe25a5a,
      accent: 0xb84040,
      glass: 0xffe6e6
    });
  }

  private createHelicopterTexture(
    key: string,
    palette: { body: number; accent: number; glass: number }
  ): void {
    if (this.textures.exists(key)) {
      this.textures.remove(key);
    }

    const width = HELI_TEXTURE_WIDTH;
    const height = HELI_TEXTURE_HEIGHT;
    const graphics = this.make.graphics({ x: 0, y: 0 });

    graphics.fillStyle(0x223447, 1);
    graphics.fillRoundedRect(24, 8, 82, 4, 2);
    graphics.fillRoundedRect(60, 12, 10, 8, 2);

    graphics.fillStyle(palette.accent, 1);
    graphics.fillRoundedRect(72, 34, 34, 10, 4);
    graphics.fillTriangle(102, 26, 120, 36, 102, 46);

    graphics.fillStyle(0x223447, 1);
    graphics.fillRect(116, 30, 2, 12);
    graphics.fillRect(111, 35, 12, 2);

    graphics.fillStyle(palette.body, 1);
    graphics.fillRoundedRect(22, 24, 62, 34, 14);

    graphics.fillStyle(palette.glass, 0.95);
    graphics.fillEllipse(43, 39, 26, 18);

    graphics.fillStyle(0x253243, 1);
    graphics.fillRoundedRect(26, 62, 58, 4, 2);
    graphics.fillRect(34, 56, 3, 8);
    graphics.fillRect(68, 56, 3, 8);

    graphics.lineStyle(2, 0xffffff, 0.24);
    graphics.strokeRoundedRect(22, 24, 62, 34, 14);

    graphics.generateTexture(key, width, height);
    graphics.destroy();
  }

  private drawBackdrop(): void {
    const sky = this.add.graphics();
    sky.fillGradientStyle(0x84b6d8, 0x84b6d8, 0xa8d8f0, 0xd5ecf7, 1);
    sky.fillRect(0, 0, ARENA_WIDTH, ARENA_HEIGHT);

    const ground = this.add.graphics();
    ground.fillStyle(0x345d47, 1);
    ground.fillRect(0, ARENA_HEIGHT - 110, ARENA_WIDTH, 110);

    const clouds = this.add.graphics();
    clouds.fillStyle(0xffffff, 0.38);
    clouds.fillEllipse(220, 130, 240, 64);
    clouds.fillEllipse(850, 160, 300, 72);
    clouds.fillEllipse(580, 90, 180, 50);
  }
}
