import { describe, expect, test } from "vitest";
import { Simulation } from "../src/game/simulation";

describe("Simulation", () => {
  test("projectiles eventually hit and reduce life", () => {
    const simulation = new Simulation("ABCD12", 0);

    simulation.setInput("P1", {
      seq: 1,
      up: false,
      down: false,
      left: false,
      right: false,
      fire: true,
      clientTimeMs: 0
    });

    let hitDetected = false;

    for (let step = 1; step < 220; step += 1) {
      const result = simulation.step(step * 33, 33);

      if (result.events.some((event) => event.type === "hit" && event.target === "P2")) {
        hitDetected = true;
        break;
      }
    }

    expect(hitDetected).toBe(true);
    expect(simulation.getState().helicopters.P2.lives).toBe(2);
  });

  test("three hits can end the match", () => {
    const simulation = new Simulation("ABCD12", 0);

    let ended = false;

    for (let i = 0; i < 3 && !ended; i += 1) {
      simulation.setInput("P1", {
        seq: i + 1,
        up: false,
        down: false,
        left: false,
        right: false,
        fire: true,
        clientTimeMs: i * 1000
      });

      for (let step = 1; step < 260; step += 1) {
        const result = simulation.step((i * 10_000) + step * 33, 33);

        if (result.ended) {
          ended = true;
          expect(result.ended.winner).toBe("P1");
          break;
        }
      }
    }

    expect(ended).toBe(true);
    expect(simulation.getState().status).toBe("ended");
    expect(simulation.getState().winner).toBe("P1");
  });
});
