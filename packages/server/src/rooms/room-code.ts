import { ROOM_CODE_CHARSET, ROOM_CODE_LENGTH } from "@helifight/shared";

const MAX_ROOM_CODE_ATTEMPTS = 10_000;

export function generateRoomCode(existingCodes: Set<string>): string {
  for (let attempt = 0; attempt < MAX_ROOM_CODE_ATTEMPTS; attempt += 1) {
    let value = "";

    for (let index = 0; index < ROOM_CODE_LENGTH; index += 1) {
      const randomIndex = Math.floor(Math.random() * ROOM_CODE_CHARSET.length);
      value += ROOM_CODE_CHARSET[randomIndex];
    }

    if (!existingCodes.has(value)) {
      return value;
    }
  }

  throw new Error("Failed to generate a unique room code");
}
