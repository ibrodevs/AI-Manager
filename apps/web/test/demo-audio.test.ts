import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { DEMO_RECORDINGS } from "../lib/demo-recordings";

describe("published demo recordings", () => {
  for (const recording of DEMO_RECORDINGS) {
    it(`${recording.id} has its complete MP3 and measured transcript`, () => {
      expect(recording.audio, "Do not replace playable demos with missing audio").toBeDefined();
      const audio = recording.audio!;
      const bytes = readFileSync(new URL(`../public${audio.audioUrl}`, import.meta.url));
      expect(bytes.length).toBeGreaterThan(10000);
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(audio.sha256);
      expect(audio.turns).toHaveLength(recording.lines.length);
      let previousEnd = 0;
      for (const [seq, turn] of audio.turns.entries()) {
        expect(turn.seq).toBe(seq);
        expect(turn.speaker).toBe(recording.lines[seq]!.speaker);
        expect(turn.startMs).toBeGreaterThanOrEqual(previousEnd);
        expect(turn.endMs).toBeGreaterThan(turn.startMs);
        expect(turn.endMs).toBeLessThanOrEqual(audio.durationMs);
        expect(turn.text.trim().length).toBeGreaterThan(0);
        previousEnd = turn.endMs;
      }
    });
  }
});
