import type { AdsrPreset, SpeakerPreset, VibratoPreset } from "./speakers.js";

export interface AdsrTransform {
  attackMultiplier: number;
  decayMultiplier: number;
  sustainMultiplier: number;
  releaseMultiplier: number;
}

export interface EmotionPreset {
  name: string;
  /** Global pitch multiplier around A4 tuning. */
  pitchMultiplier: number;
  /** Expands (>1) or compresses (<1) distances from the scale center. */
  rangeMultiplier: number;
  /** Speaking-rate multiplier relative to speaker.baseTempo. */
  tempoMultiplier: number;
  /** Default ending direction when no explicit punctuation is present. */
  terminalPitchMultiplier: number;
  gainMultiplier: number;
  vibrato: VibratoPreset;
  adsr: AdsrTransform;
}

export const emotionPresets = {
  neutral: {
    name: "neutral",
    pitchMultiplier: 1,
    rangeMultiplier: 1,
    tempoMultiplier: 1,
    terminalPitchMultiplier: 0.95,
    gainMultiplier: 1,
    vibrato: { depth: 0, rateHz: 0 },
    adsr: {
      attackMultiplier: 1,
      decayMultiplier: 1,
      sustainMultiplier: 1,
      releaseMultiplier: 1,
    },
  },
  joy: {
    name: "joy",
    pitchMultiplier: 1.2,
    rangeMultiplier: 1.5,
    tempoMultiplier: 9 / 7,
    terminalPitchMultiplier: 1.06,
    gainMultiplier: 1.08,
    vibrato: { depth: 0.012, rateHz: 7 },
    adsr: {
      attackMultiplier: 0.5,
      decayMultiplier: 0.7,
      sustainMultiplier: 1.12,
      releaseMultiplier: 0.7,
    },
  },
  sad: {
    name: "sad",
    pitchMultiplier: 0.85,
    rangeMultiplier: 0.6,
    tempoMultiplier: 4.5 / 7,
    terminalPitchMultiplier: 0.82,
    gainMultiplier: 0.72,
    vibrato: { depth: 0.028, rateHz: 4 },
    adsr: {
      attackMultiplier: 2.4,
      decayMultiplier: 1.8,
      sustainMultiplier: 0.75,
      releaseMultiplier: 2.5,
    },
  },
  angry: {
    name: "angry",
    pitchMultiplier: 0.95,
    rangeMultiplier: 0.8,
    tempoMultiplier: 8.5 / 7,
    terminalPitchMultiplier: 0.76,
    gainMultiplier: 1.18,
    vibrato: { depth: 0, rateHz: 0 },
    adsr: {
      attackMultiplier: 0.35,
      decayMultiplier: 0.55,
      sustainMultiplier: 0.86,
      releaseMultiplier: 0.5,
    },
  },
  surprise: {
    name: "surprise",
    pitchMultiplier: 1.3,
    rangeMultiplier: 1.8,
    tempoMultiplier: 8 / 7,
    terminalPitchMultiplier: 1.16,
    gainMultiplier: 1.12,
    vibrato: { depth: 0, rateHz: 0 },
    adsr: {
      attackMultiplier: 0.3,
      decayMultiplier: 0.55,
      sustainMultiplier: 1.08,
      releaseMultiplier: 0.6,
    },
  },
  calm: {
    name: "calm",
    pitchMultiplier: 0.9,
    rangeMultiplier: 0.7,
    tempoMultiplier: 5 / 7,
    terminalPitchMultiplier: 0.92,
    gainMultiplier: 0.84,
    vibrato: { depth: 0.008, rateHz: 3.3 },
    adsr: {
      attackMultiplier: 1.8,
      decayMultiplier: 1.5,
      sustainMultiplier: 0.92,
      releaseMultiplier: 1.8,
    },
  },
  fear: {
    name: "fear",
    pitchMultiplier: 1.15,
    rangeMultiplier: 1.1,
    tempoMultiplier: 7.5 / 7,
    terminalPitchMultiplier: 1.02,
    gainMultiplier: 0.74,
    vibrato: { depth: 0.018, rateHz: 9 },
    adsr: {
      attackMultiplier: 0.45,
      decayMultiplier: 0.55,
      sustainMultiplier: 0.72,
      releaseMultiplier: 0.45,
    },
  },
} as const satisfies Readonly<Record<string, EmotionPreset>>;

export type EmotionName = keyof typeof emotionPresets;

export const supportedEmotions = Object.freeze(
  Object.keys(emotionPresets) as EmotionName[],
);

export function getEmotionPreset(name: string): EmotionPreset {
  const preset = (emotionPresets as Readonly<Record<string, EmotionPreset>>)[name];
  if (!preset) {
    throw new RangeError(
      `Unknown emotion "${name}". Available emotions: ${supportedEmotions.join(", ")}`,
    );
  }
  return preset;
}

export function transformAdsr(
  speaker: SpeakerPreset,
  emotion: EmotionPreset,
): AdsrPreset {
  const source = speaker.timbre.adsr;
  return {
    attackMs: source.attackMs * emotion.adsr.attackMultiplier,
    decayMs: source.decayMs * emotion.adsr.decayMultiplier,
    sustainLevel: Math.max(
      0,
      Math.min(1, source.sustainLevel * emotion.adsr.sustainMultiplier),
    ),
    releaseMs: source.releaseMs * emotion.adsr.releaseMultiplier,
  };
}
