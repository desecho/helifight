import { describe, expect, test } from "vitest";
import { ROOM_CODE_CHARSET, ROOM_CODE_LENGTH } from "@helifight/shared";
import { generateRoomCode } from "../src/rooms/room-code";

describe("generateRoomCode", () => {
  test("returns code with correct length and charset", () => {
    const code = generateRoomCode(new Set());

    expect(code).toHaveLength(ROOM_CODE_LENGTH);

    for (const char of code) {
      expect(ROOM_CODE_CHARSET).toContain(char);
    }
  });

  test("avoids already-used code", () => {
    const existing = new Set<string>();
    const codeA = generateRoomCode(existing);
    existing.add(codeA);

    const codeB = generateRoomCode(existing);
    expect(codeB).not.toBe(codeA);
  });
});
