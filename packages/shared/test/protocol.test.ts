import { describe, expect, test } from "vitest";
import { ROOM_CODE_CHARSET, ROOM_CODE_LENGTH } from "../src/game-constants";

describe("shared constants", () => {
  test("room code charset excludes ambiguous characters", () => {
    expect(ROOM_CODE_CHARSET).not.toContain("0");
    expect(ROOM_CODE_CHARSET).not.toContain("1");
    expect(ROOM_CODE_CHARSET).not.toContain("I");
    expect(ROOM_CODE_CHARSET).not.toContain("O");
  });

  test("room code length is fixed at 6", () => {
    expect(ROOM_CODE_LENGTH).toBe(6);
  });
});
