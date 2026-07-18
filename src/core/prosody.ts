import type { MelodyEvent } from "./melody.js";
import type { AdsrPreset, SpeakerPreset, VibratoPreset } from "../presets/speakers.js";
import {
  transformAdsr,
  type EmotionPreset,
} from "../presets/emotions.js";

export interface ProsodyOptions {
  speed?: number;
  pitch?: number;
}

export interface ProsodyResult {
  events: MelodyEvent[];
  adsr: AdsrPreset;
  vibrato: VibratoPreset;
}

export interface UnitTiming {
  unitIndex: number;
  text: string;
  kind: "voiced" | "pause";
  startMs: number;
  endMs: number;
}

function positiveFinite(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${label} must be a finite number greater than zero`);
  }
  return value;
}

function validateEmotion(emotion: EmotionPreset): void {
  positiveFinite(emotion.pitchMultiplier, "emotion.pitchMultiplier");
  positiveFinite(emotion.rangeMultiplier, "emotion.rangeMultiplier");
  positiveFinite(emotion.tempoMultiplier, "emotion.tempoMultiplier");
  positiveFinite(
    emotion.terminalPitchMultiplier,
    "emotion.terminalPitchMultiplier",
  );
  positiveFinite(emotion.gainMultiplier, "emotion.gainMultiplier");
  if (
    !Number.isFinite(emotion.vibrato.depth) ||
    emotion.vibrato.depth < 0 ||
    !Number.isFinite(emotion.vibrato.rateHz) ||
    emotion.vibrato.rateHz < 0
  ) {
    throw new RangeError("emotion.vibrato values must be finite and non-negative");
  }
}

function forceDirection(
  current: number,
  previous: number | null,
  multiplier: number,
): number {
  if (previous === null) return current * multiplier;
  const target = previous * multiplier;
  return multiplier >= 1 ? Math.max(current, target) : Math.min(current, target);
}

/** Apply emotion-wide modulation and punctuation-local terminal contours. */
export function applyProsody(
  events: readonly MelodyEvent[],
  speaker: SpeakerPreset,
  emotion: EmotionPreset,
  options: ProsodyOptions = {},
): ProsodyResult {
  validateEmotion(emotion);
  const speed = positiveFinite(options.speed ?? 1, "speed");
  const pitch = positiveFinite(options.pitch ?? 1, "pitch");
  const center = speaker.scale[Math.floor(speaker.scale.length / 2)];
  if (center === undefined || !Number.isFinite(center) || center <= 0) {
    throw new RangeError("speaker.scale must contain positive frequencies");
  }

  const shaped = events.map<MelodyEvent>((event) => ({
    ...event,
    durationSeconds:
      event.durationSeconds / (emotion.tempoMultiplier * speed),
    frequencyHz:
      event.frequencyHz === null
        ? null
        : center *
          (event.frequencyHz / center) ** emotion.rangeMultiplier *
          emotion.pitchMultiplier *
          pitch,
    gain: (event.gain ?? 1) * emotion.gainMultiplier,
  }));

  let previousVoicedIndex: number | null = null;
  for (let index = 0; index < shaped.length; index += 1) {
    const event = shaped[index];
    if (!event || event.frequencyHz === null) {
      previousVoicedIndex = null;
      continue;
    }

    const previousFrequency =
      previousVoicedIndex === null
        ? null
        : (shaped[previousVoicedIndex]?.frequencyHz ?? null);
    if (event.boundary === "comma") {
      event.frequencyHz = forceDirection(event.frequencyHz, previousFrequency, 0.96);
    } else if (event.boundary === "period") {
      event.frequencyHz = forceDirection(event.frequencyHz, previousFrequency, 0.88);
    } else if (event.boundary === "question") {
      event.frequencyHz = forceDirection(event.frequencyHz, previousFrequency, 1.12);
    } else if (event.boundary === "exclamation") {
      event.frequencyHz = forceDirection(event.frequencyHz, previousFrequency, 1.1);
      event.gain = (event.gain ?? 1) * 1.22;
    }
    previousVoicedIndex = index;
  }

  let finalIndex = -1;
  let finalPreviousIndex = -1;
  for (let index = shaped.length - 1; index >= 0; index -= 1) {
    const event = shaped[index];
    if (!event || event.frequencyHz === null) {
      if (finalIndex >= 0) break;
      continue;
    }
    if (finalIndex < 0) finalIndex = index;
    else {
      finalPreviousIndex = index;
      break;
    }
  }

  const finalEvent = shaped[finalIndex];
  if (finalEvent?.frequencyHz !== null && finalEvent?.boundary === "none") {
    const previousFrequency =
      finalPreviousIndex >= 0
        ? (shaped[finalPreviousIndex]?.frequencyHz ?? null)
        : null;
    finalEvent.frequencyHz = forceDirection(
      finalEvent.frequencyHz,
      previousFrequency,
      emotion.terminalPitchMultiplier,
    );
  }

  return {
    events: shaped,
    adsr: transformAdsr(speaker, emotion),
    vibrato: {
      depth: speaker.timbre.vibrato.depth + emotion.vibrato.depth,
      rateHz:
        emotion.vibrato.rateHz > 0
          ? emotion.vibrato.rateHz
          : speaker.timbre.vibrato.rateHz,
    },
  };
}

/** Build timing data using the same per-event sample rounding as synthesis. */
export function createUnitTimings(
  events: readonly MelodyEvent[],
  sampleRate: number,
): UnitTiming[] {
  if (!Number.isSafeInteger(sampleRate) || sampleRate <= 0) {
    throw new RangeError("sampleRate must be a positive safe integer");
  }

  let sampleCursor = 0;
  return events.map((event) => {
    const sampleCount = Math.max(
      0,
      Math.round(event.durationSeconds * sampleRate),
    );
    const timing: UnitTiming = {
      unitIndex: event.unitIndex,
      text: event.text,
      kind: event.frequencyHz === null ? "pause" : "voiced",
      startMs: (sampleCursor / sampleRate) * 1_000,
      endMs: ((sampleCursor + sampleCount) / sampleRate) * 1_000,
    };
    sampleCursor += sampleCount;
    return timing;
  });
}
