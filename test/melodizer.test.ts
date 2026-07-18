import { describe, expect, it } from "vitest";
import { melodize } from "../src/core/melodizer.js";
import { tokenize } from "../src/core/tokenizer.js";
import { defaultSpeaker } from "../src/presets/speakers.js";

describe("melodize", () => {
  it("is deterministic and limits adjacent jumps", () => {
    const units = tokenize("これは決定論的な音程列です");
    const first = melodize(units, defaultSpeaker);
    const second = melodize(units, defaultSpeaker);

    expect(second).toEqual(first);
    const indices = first
      .filter((event) => event.frequencyHz !== null)
      .map((event) => defaultSpeaker.scale.indexOf(event.frequencyHz ?? 0));
    for (let index = 1; index < indices.length; index += 1) {
      expect(Math.abs((indices[index] ?? 0) - (indices[index - 1] ?? 0))).toBeLessThanOrEqual(2);
    }
  });

  it("applies pitch and speed without changing the event count", () => {
    const units = tokenize("テスト");
    const base = melodize(units, defaultSpeaker);
    const shifted = melodize(units, defaultSpeaker, { speed: 2, pitch: 2 });

    expect(shifted).toHaveLength(base.length);
    expect(shifted[0]?.durationSeconds).toBeCloseTo(
      (base[0]?.durationSeconds ?? 0) / 2,
    );
    expect(shifted[0]?.frequencyHz).toBeCloseTo(
      (base[0]?.frequencyHz ?? 0) * 2,
    );
  });
});
