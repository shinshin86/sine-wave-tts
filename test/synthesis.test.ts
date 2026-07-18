import { describe, expect, it } from "vitest";
import { synthesize, synthesizeAsync } from "../src/index.js";

describe("synthesize", () => {
  it("returns deterministic, finite, non-silent PCM", () => {
    const first = synthesize("こんにちは、サイン波です。");
    const second = synthesize("こんにちは、サイン波です。");

    expect(first.sampleRate).toBe(44_100);
    expect(first.pcm).toEqual(second.pcm);
    expect(first.durationMs).toBeCloseTo(
      (first.pcm.length / first.sampleRate) * 1_000,
    );
    expect(first.pcm.every(Number.isFinite)).toBe(true);
    expect(first.pcm.some((sample) => Math.abs(sample) > 0.01)).toBe(true);
  });

  it("shortens output when speed is increased", () => {
    const normal = synthesize("速度の確認です");
    const fast = synthesize("速度の確認です", { speed: 2 });

    expect(fast.durationMs).toBeCloseTo(normal.durationMs / 2, 0);
  });

  it("provides an async-compatible wrapper", async () => {
    const result = await synthesizeAsync("非同期です");
    expect(result.pcm.length).toBeGreaterThan(0);
  });

  it("returns contiguous timings aligned with PCM duration", () => {
    const result = synthesize("タイミング、確認です。", { emotion: "sad" });

    expect(result.timings.length).toBeGreaterThan(0);
    expect(result.timings[0]?.startMs).toBe(0);
    for (let index = 1; index < result.timings.length; index += 1) {
      expect(result.timings[index]?.startMs).toBeCloseTo(
        result.timings[index - 1]?.endMs ?? -1,
      );
    }
    expect(result.timings.at(-1)?.endMs).toBeCloseTo(result.durationMs);
    expect(result.timings.some((timing) => timing.kind === "pause")).toBe(true);
  });

  it("produces distinct deterministic PCM for each emotion", () => {
    const text = "感情の違いを確認します。";
    const neutral = synthesize(text, { emotion: "neutral" });
    const joy = synthesize(text, { emotion: "joy" });
    const sad = synthesize(text, { emotion: "sad" });

    expect(joy.durationMs).toBeLessThan(neutral.durationMs);
    expect(neutral.durationMs).toBeLessThan(sad.durationMs);
    expect(joy.pcm).not.toEqual(neutral.pcm);
    expect(sad.pcm).not.toEqual(neutral.pcm);
    expect(synthesize(text, { emotion: "joy" }).pcm).toEqual(joy.pcm);
  });
});
