import { beforeAll, describe, expect, it } from "vitest";
import { analyzeText, loadKuromojiAnalyzer } from "../src/core/analyzer.js";
import { generateContour } from "../src/core/contour.js";
import { defaultSpeaker } from "../src/presets/speakers.js";

const GREETING = "こんにちは、サイン波の声です。";
const EMERGENCY = "緊急事態が発生しました!";

function durations(text: string): number[] {
  return generateContour(analyzeText(text), defaultSpeaker).map((event) =>
    Number(event.durationSeconds.toFixed(4)),
  );
}

function directions(text: string): number[] {
  const frequencies = generateContour(analyzeText(text), defaultSpeaker)
    .flatMap((event) => (event.frequencyHz === null ? [] : [event.frequencyHz]));
  return frequencies.slice(1).map((frequency, index) =>
    Math.sign(frequency - (frequencies[index] ?? frequency)),
  );
}

function voicedFrequencies(text: string): number[] {
  return generateContour(analyzeText(text), defaultSpeaker).flatMap((event) =>
    event.frequencyHz === null ? [] : [event.frequencyHz],
  );
}

describe("generateContour", () => {
  beforeAll(async () => {
    await loadKuromojiAnalyzer({
      dicPath: "node_modules/kuromoji/dict",
      throwOnError: true,
    });
  });

  it("is deterministic for the same sentence", () => {
    expect(generateContour(analyzeText(GREETING), defaultSpeaker)).toEqual(
      generateContour(analyzeText(GREETING), defaultSpeaker),
    );
  });

  it("gives greeting and emergency sentences distinct rhythm distributions", () => {
    const greeting = durations(GREETING);
    const emergency = durations(EMERGENCY);

    expect(greeting).not.toEqual(emergency);
    expect(new Set(greeting).size).toBeGreaterThan(3);
    expect(new Set(emergency).size).toBeGreaterThan(3);
    expect(greeting.slice(0, 4)).not.toEqual(emergency.slice(0, 4));
  });

  it("gives the two sentences distinct pitch contours", () => {
    const greeting = directions(GREETING);
    const emergency = directions(EMERGENCY);

    expect(greeting).not.toEqual(emergency);
    expect(new Set(greeting).size).toBeGreaterThan(1);
    expect(new Set(emergency).size).toBeGreaterThan(1);
    expect(voicedFrequencies(GREETING).slice(0, 4)).not.toEqual(
      voicedFrequencies(EMERGENCY).slice(0, 4),
    );
  });
});
