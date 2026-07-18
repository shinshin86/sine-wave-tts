import { describe, expect, it } from "vitest";
import { analyzeFallback } from "../src/core/analyzer.js";
import { generateContour } from "../src/core/contour.js";
import { applyProsody } from "../src/core/prosody.js";
import {
  emotionPresets,
  supportedEmotions,
  type EmotionPreset,
} from "../src/presets/emotions.js";
import {
  defaultSpeaker,
  speakerPresets,
  supportedSpeakers,
  type SpeakerPreset,
} from "../src/presets/speakers.js";
import { synthesize } from "../src/index.js";

const TEXT = "今日は新しい声を試します。";

interface AcousticSignature {
  meanF0: number;
  durationSeconds: number;
  unitsPerSecond: number;
}

function acousticSignature(
  speaker: SpeakerPreset,
  emotion: EmotionPreset,
): AcousticSignature {
  const melody = generateContour(analyzeFallback(TEXT), speaker);
  const result = applyProsody(melody, speaker, emotion);
  const frequencies = result.events.flatMap((event) =>
    event.frequencyHz === null ? [] : [event.frequencyHz],
  );
  const durationSeconds = result.events.reduce(
    (total, event) => total + event.durationSeconds,
    0,
  );
  return {
    meanF0:
      frequencies.reduce((total, frequency) => total + frequency, 0) /
      frequencies.length,
    durationSeconds,
    unitsPerSecond: result.events.length / durationSeconds,
  };
}

function relativeDifference(first: number, second: number): number {
  return Math.abs(first - second) / Math.max(Math.abs(first), Math.abs(second));
}

function expectPairwiseAcousticDifference(
  signatures: readonly AcousticSignature[],
): void {
  for (let first = 0; first < signatures.length; first += 1) {
    for (let second = first + 1; second < signatures.length; second += 1) {
      const left = signatures[first];
      const right = signatures[second];
      if (!left || !right) continue;
      const strongestDifference = Math.max(
        relativeDifference(left.meanF0, right.meanF0),
        relativeDifference(left.durationSeconds, right.durationSeconds),
        relativeDifference(left.unitsPerSecond, right.unitsPerSecond),
      );
      expect(strongestDifference).toBeGreaterThan(0.05);
    }
  }
}

describe("preset registry", () => {
  it("registers all five speakers with broad ascending scales", () => {
    expect(supportedSpeakers).toEqual([
      "default",
      "chirpy",
      "deep",
      "robotic",
      "songful",
    ]);
    for (const speaker of Object.values(speakerPresets)) {
      expect(speaker.scale.length).toBeGreaterThanOrEqual(28);
      expect(new Set(speaker.scale).size).toBe(speaker.scale.length);
      expect(
        speaker.scale.every(
          (frequency, index) =>
            index === 0 || frequency > (speaker.scale[index - 1] ?? Infinity),
        ),
      ).toBe(true);
    }
    expect(defaultSpeaker.scale).toHaveLength(32);
  });

  it("registers all seven emotions", () => {
    expect(supportedEmotions).toEqual([
      "neutral",
      "joy",
      "sad",
      "angry",
      "surprise",
      "calm",
      "fear",
    ]);
  });
});

describe("preset acoustic identity", () => {
  it("keeps every emotion acoustically distinct", () => {
    const signatures = supportedEmotions.map((name) =>
      acousticSignature(defaultSpeaker, emotionPresets[name]),
    );
    expectPairwiseAcousticDifference(signatures);
  });

  it("keeps every speaker acoustically distinct", () => {
    const signatures = supportedSpeakers.map((name) =>
      acousticSignature(speakerPresets[name], emotionPresets.neutral),
    );
    expectPairwiseAcousticDifference(signatures);
  });

  it("preserves deterministic PCM for every preset", () => {
    for (const emotion of supportedEmotions) {
      expect(synthesize(TEXT, { emotion }).pcm).toEqual(
        synthesize(TEXT, { emotion }).pcm,
      );
    }
    for (const speaker of supportedSpeakers) {
      expect(synthesize(TEXT, { speaker }).pcm).toEqual(
        synthesize(TEXT, { speaker }).pcm,
      );
    }
  });
});
