import type { SpeakerPreset } from "../presets/speakers.js";
import type { PhraseBoundary, Utterance } from "./tokenizer.js";

export interface MelodyEvent {
  unitIndex: number;
  text: string;
  frequencyHz: number | null;
  durationSeconds: number;
  boundary: PhraseBoundary;
  /** Per-event amplitude applied by the synthesizer. */
  gain?: number;
}

export interface MelodizeOptions {
  speed?: number;
  pitch?: number;
}

/** 32-bit FNV-1a, used only to derive the deterministic PRNG seed. */
export function fnv1a(text: string): number {
  let hash = 0x811c9dc5;
  for (const character of text) {
    const codePoint = character.codePointAt(0) ?? 0;
    hash ^= codePoint;
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Return the next xorshift32 state. Zero is replaced with a fixed non-zero state. */
export function xorshift32(state: number): number {
  let next = state >>> 0;
  if (next === 0) next = 0x9e3779b9;
  next ^= next << 13;
  next ^= next >>> 17;
  next ^= next << 5;
  return next >>> 0;
}

function positiveFinite(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${label} must be a finite number greater than zero`);
  }
  return value;
}

function validateSpeaker(speaker: SpeakerPreset): void {
  positiveFinite(speaker.baseTempo, "speaker.baseTempo");
  if (speaker.scale.length === 0) {
    throw new RangeError("speaker.scale must contain at least one frequency");
  }
  for (const frequency of speaker.scale) {
    positiveFinite(frequency, "speaker.scale frequency");
  }
}

/**
 * Map utterance units onto a speaker's discrete scale.
 *
 * A text-derived xorshift sequence selects a small scale step for each voiced
 * unit. Steps are limited to two scale degrees so the contour resembles speech
 * rather than an unconstrained melody.
 */
export function melodize(
  units: readonly Utterance[],
  speaker: SpeakerPreset,
  options: MelodizeOptions = {},
): MelodyEvent[] {
  validateSpeaker(speaker);
  const speed = positiveFinite(options.speed ?? 1, "speed");
  const pitch = positiveFinite(options.pitch ?? 1, "pitch");
  const seedText = units
    .map((unit) => `${unit.text}:${unit.boundary}:${unit.moraCount}`)
    .join("|");
  let randomState = fnv1a(seedText);
  randomState = xorshift32(randomState);

  const center = Math.floor(speaker.scale.length / 2);
  let scaleIndex = Math.min(
    speaker.scale.length - 1,
    Math.max(0, center + ((randomState % 5) - 2)),
  );
  const weightedSteps = [-2, -1, -1, 0, 0, 0, 1, 1, 2] as const;
  let hasVoicedUnit = false;

  return units.map((unit, unitIndex) => {
    const durationSeconds = unit.moraCount / (speaker.baseTempo * speed);
    if (unit.kind === "pause") {
      return {
        unitIndex,
        text: unit.text,
        frequencyHz: null,
        durationSeconds,
        boundary: unit.boundary,
      };
    }

    if (hasVoicedUnit) {
      randomState = xorshift32(randomState);
      const step = weightedSteps[randomState % weightedSteps.length] ?? 0;
      scaleIndex = Math.min(
        speaker.scale.length - 1,
        Math.max(0, scaleIndex + step),
      );
    }
    hasVoicedUnit = true;

    const frequency = speaker.scale[scaleIndex];
    if (frequency === undefined) {
      throw new RangeError("Unable to select a frequency from speaker.scale");
    }

    return {
      unitIndex,
      text: unit.text,
      frequencyHz: frequency * pitch,
      durationSeconds,
      boundary: unit.boundary,
    };
  });
}
