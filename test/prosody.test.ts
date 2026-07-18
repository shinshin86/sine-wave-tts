import { describe, expect, it } from "vitest";
import { analyzeFallback } from "../src/core/analyzer.js";
import { generateContour } from "../src/core/contour.js";
import { applyProsody } from "../src/core/prosody.js";
import { emotionPresets } from "../src/presets/emotions.js";
import { defaultSpeaker } from "../src/presets/speakers.js";

function voicedFrequencies(
  events: ReturnType<typeof applyProsody>["events"],
): number[] {
  return events.flatMap((event) =>
    event.frequencyHz === null ? [] : [event.frequencyHz],
  );
}

function mean(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function totalDuration(
  events: ReturnType<typeof applyProsody>["events"],
): number {
  return events.reduce((sum, event) => sum + event.durationSeconds, 0);
}

describe("applyProsody", () => {
  it("makes joy faster and higher than sad", () => {
    const melody = generateContour(
      analyzeFallback("感情による音響差を確認します。"),
      defaultSpeaker,
    );
    const joy = applyProsody(melody, defaultSpeaker, emotionPresets.joy);
    const sad = applyProsody(melody, defaultSpeaker, emotionPresets.sad);

    expect(totalDuration(joy.events)).toBeLessThan(totalDuration(sad.events));
    expect(mean(voicedFrequencies(joy.events))).toBeGreaterThan(
      mean(voicedFrequencies(sad.events)),
    );
    expect(joy.vibrato.rateHz).toBeGreaterThan(sad.vibrato.rateHz);
    expect(joy.vibrato.depth).toBeLessThan(sad.vibrato.depth);
  });

  it("forces a question ending upward", () => {
    const melody = generateContour(
      analyzeFallback("これは質問ですか?"),
      defaultSpeaker,
    );
    const result = applyProsody(
      melody,
      defaultSpeaker,
      emotionPresets.neutral,
    );
    const frequencies = voicedFrequencies(result.events);

    expect(frequencies.at(-1)).toBeGreaterThan(frequencies.at(-2) ?? Infinity);
  });

  it("forces a period downward and an exclamation to be stronger", () => {
    const period = applyProsody(
      generateContour(analyzeFallback("これは文です。"), defaultSpeaker),
      defaultSpeaker,
      emotionPresets.neutral,
    );
    const periodFrequencies = voicedFrequencies(period.events);
    expect(periodFrequencies.at(-1)).toBeLessThan(
      periodFrequencies.at(-2) ?? -Infinity,
    );

    const exclamation = applyProsody(
      generateContour(analyzeFallback("すごい!"), defaultSpeaker),
      defaultSpeaker,
      emotionPresets.neutral,
    );
    const lastVoiced = exclamation.events
      .filter((event) => event.frequencyHz !== null)
      .at(-1);
    expect(lastVoiced?.gain).toBeGreaterThan(1);
  });
});
