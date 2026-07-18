export interface AdsrPreset {
  attackMs: number;
  decayMs: number;
  sustainLevel: number;
  releaseMs: number;
}

export interface VibratoPreset {
  depth: number;
  rateHz: number;
}

export interface SpeakerPreset {
  /** Stable identifier used by the public API and demo selector. */
  name: string;
  /**
   * Ascending pitch-quantization frequencies in Hz. Around 30 notes across
   * two to three octaves gives the contour enough resolution without losing
   * the preset's musical character.
   */
  scale: readonly number[];
  /** Neutral speaking rate in mora per second. Larger values speak faster. */
  baseTempo: number;
  timbre: {
    /**
     * Relative amplitudes for the first, second, ... harmonic. The values are
     * normalized during synthesis; `[1]` is a pure sine wave.
     */
    harmonics: readonly number[];
    /** Baseline vibrato depth (ratio) and rate. Emotion vibrato is added. */
    vibrato: VibratoPreset;
    /** Base envelope in milliseconds; emotions apply multipliers to it. */
    adsr: AdsrPreset;
    /** Pitch-glide duration between voiced units. Zero produces hard steps. */
    portamentoMs: number;
  };
}

function midiToFrequency(note: number): number {
  return 440 * 2 ** ((note - 69) / 12);
}

function chromaticScale(startMidi: number, endMidi: number): number[] {
  return Array.from(
    { length: endMidi - startMidi + 1 },
    (_, index) => midiToFrequency(startMidi + index),
  );
}

const DEFAULT_MIDI_SCALE = chromaticScale(45, 76);

export const defaultSpeaker: SpeakerPreset = {
  name: "default",
  scale: DEFAULT_MIDI_SCALE,
  baseTempo: 7,
  timbre: {
    harmonics: [1, 0.16],
    vibrato: { depth: 0, rateHz: 0 },
    adsr: {
      attackMs: 12,
      decayMs: 28,
      sustainLevel: 0.72,
      releaseMs: 34,
    },
    portamentoMs: 32,
  },
};

export const speakerPresets = {
  default: defaultSpeaker,
  chirpy: {
    name: "chirpy",
    scale: chromaticScale(60, 91),
    baseTempo: 8.8,
    timbre: {
      harmonics: [1, 0.28, 0.1],
      vibrato: { depth: 0.006, rateHz: 7.5 },
      adsr: {
        attackMs: 5,
        decayMs: 18,
        sustainLevel: 0.78,
        releaseMs: 20,
      },
      portamentoMs: 14,
    },
  },
  deep: {
    name: "deep",
    scale: chromaticScale(33, 62),
    baseTempo: 5.4,
    timbre: {
      harmonics: [1, 0.04],
      vibrato: { depth: 0.004, rateHz: 3.2 },
      adsr: {
        attackMs: 24,
        decayMs: 42,
        sustainLevel: 0.76,
        releaseMs: 58,
      },
      portamentoMs: 68,
    },
  },
  robotic: {
    name: "robotic",
    scale: chromaticScale(48, 77),
    baseTempo: 7,
    timbre: {
      harmonics: [1, 0, 0.24, 0, 0.12],
      vibrato: { depth: 0, rateHz: 0 },
      adsr: {
        attackMs: 2,
        decayMs: 12,
        sustainLevel: 0.82,
        releaseMs: 8,
      },
      portamentoMs: 0,
    },
  },
  songful: {
    name: "songful",
    scale: chromaticScale(48, 84),
    baseTempo: 6.4,
    timbre: {
      harmonics: [1, 0.18, 0.06],
      vibrato: { depth: 0.018, rateHz: 5.3 },
      adsr: {
        attackMs: 18,
        decayMs: 36,
        sustainLevel: 0.8,
        releaseMs: 52,
      },
      portamentoMs: 92,
    },
  },
} as const satisfies Readonly<Record<string, SpeakerPreset>>;

export type SpeakerName = keyof typeof speakerPresets;

export const supportedSpeakers = Object.freeze(
  Object.keys(speakerPresets) as SpeakerName[],
);

export function getSpeakerPreset(name: string): SpeakerPreset {
  const speaker = (speakerPresets as Readonly<Record<string, SpeakerPreset>>)[
    name
  ];
  if (!speaker) {
    throw new RangeError(
      `Unknown speaker "${name}". Available speakers: ${supportedSpeakers.join(", ")}`,
    );
  }
  return speaker;
}
