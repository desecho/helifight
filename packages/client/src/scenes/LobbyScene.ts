import Phaser from "phaser";
import { ARENA_HEIGHT, ARENA_WIDTH } from "@helifight/shared";

export class LobbyScene extends Phaser.Scene {
  public constructor() {
    super("LobbyScene");
  }

  public create(): void {
    const sky = this.add.graphics();
    sky.fillGradientStyle(0x85c9f2, 0x98d3f6, 0xbfe7ff, 0xd2efff, 1);
    sky.fillRect(0, 0, ARENA_WIDTH, ARENA_HEIGHT);

    const mountain = this.add.graphics();
    mountain.fillStyle(0x5f7a8c, 0.8);
    mountain.beginPath();
    mountain.moveTo(0, ARENA_HEIGHT);
    mountain.lineTo(220, 420);
    mountain.lineTo(500, ARENA_HEIGHT);
    mountain.lineTo(760, 380);
    mountain.lineTo(1100, ARENA_HEIGHT);
    mountain.lineTo(ARENA_WIDTH, ARENA_HEIGHT);
    mountain.closePath();
    mountain.fillPath();

    this.add
      .text(ARENA_WIDTH / 2, 90, "HELIFIGHT", {
        fontFamily: "Avenir Next, sans-serif",
        color: "#0a2738",
        fontSize: "62px",
        fontStyle: "bold"
      })
      .setOrigin(0.5);

    this.add
      .text(ARENA_WIDTH / 2, 166, "Create a room or join with code", {
        fontFamily: "Avenir Next, sans-serif",
        color: "#15415b",
        fontSize: "30px"
      })
      .setOrigin(0.5);
  }
}
