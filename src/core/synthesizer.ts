import type { MelodyEvent } from "./melodizer.js";
import type {
  AdsrPreset,
  SpeakerPreset,
  VibratoPreset,
} from "../presets/speakers.js";

export interface SynthesizerOptions {
  sampleRate?: number;
  volume?: number;
  adsr?: AdsrPreset;
  vibrato?: VibratoPreset;
}

const TWO_PI = Math.PI * 2;

function envelopeAt(
  sampleIndex: number,
  sampleCount: number,
  sampleRate: number,
  adsr: AdsrPreset,
): number {
  let attack = Math.round((adsr.attackMs / 1_000) * sampleRate);
  let decay = Math.round((adsr.decayMs / 1_000) * sampleRate);
  let release = Math.round((adsr.releaseMs / 1_000) * sampleRate);
  const shapedSamples = attack + decay + release;

  if (shapedSamples > sampleCount && shapedSamples > 0) {
    const ratio = sampleCount / shapedSamples;
    attack = Math.floor(attack * ratio);
    decay = Math.floor(decay * ratio);
    release = sampleCount - attack - decay;
  }

  if (attack > 0 && sampleIndex < attack) {
    return sampleIndex / attack;
  }
  if (decay > 0 && sampleIndex < attack + decay) {
    const progress = (sampleIndex - attack) / decay;
    return 1 + (adsr.sustainLevel - 1) * progress;
  }
  if (release > 0 && sampleIndex >= sampleCount - release) {
    return (
      adsr.sustainLevel *
      Math.max(0, (sampleCount - sampleIndex - 1) / release)
    );
  }
  return adsr.sustainLevel;
}

function validateOptions(sampleRate: number, volume: number): void {
  if (!Number.isSafeInteger(sampleRate) || sampleRate <= 0) {
    throw new RangeError("sampleRate must be a positive safe integer");
  }
  if (!Number.isFinite(volume) || volume < 0 || volume > 1) {
    throw new RangeError("volume must be between 0 and 1");
  }
}

/** Convert melody events to mono floating-point PCM without platform APIs. */
export function synthesizePcm(
  events: readonly MelodyEvent[],
  speaker: SpeakerPreset,
  options: SynthesizerOptions = {},
): Float32Array {
  const sampleRate = options.sampleRate ?? 44_100;
  const volume = options.volume ?? 0.8;
  validateOptions(sampleRate, volume);
  const adsr = options.adsr ?? speaker.timbre.adsr;
  const vibrato = options.vibrato ?? speaker.timbre.vibrato;

  const eventSampleCounts = events.map((event) =>
    Math.max(0, Math.round(event.durationSeconds * sampleRate)),
  );
  const totalSamples = eventSampleCounts.reduce((sum, count) => sum + count, 0);
  const pcm = new Float32Array(totalSamples);
  const harmonicNormalization = Math.max(
    1,
    speaker.timbre.harmonics.reduce(
      (sum, amplitude) => sum + Math.abs(amplitude),
      0,
    ),
  );
  const portamentoSamples = Math.max(
    0,
    Math.round((speaker.timbre.portamentoMs / 1_000) * sampleRate),
  );

  let writeIndex = 0;
  let phase = 0;
  let previousFrequency: number | null = null;

  for (let eventIndex = 0; eventIndex < events.length; eventIndex += 1) {
    const event = events[eventIndex];
    const sampleCount = eventSampleCounts[eventIndex] ?? 0;
    if (!event || event.frequencyHz === null) {
      writeIndex += sampleCount;
      previousFrequency = null;
      phase = 0;
      continue;
    }

    const targetFrequency = event.frequencyHz;
    for (let localIndex = 0; localIndex < sampleCount; localIndex += 1) {
      const glide =
        previousFrequency !== null && portamentoSamples > 0
          ? Math.min(1, localIndex / portamentoSamples)
          : 1;
      const baseFrequency =
        previousFrequency === null
          ? targetFrequency
          : previousFrequency + (targetFrequency - previousFrequency) * glide;
      const elapsedSeconds = localIndex / sampleRate;
      const frequency =
        baseFrequency *
        (1 +
          vibrato.depth * Math.sin(TWO_PI * vibrato.rateHz * elapsedSeconds));

      phase = (phase + (TWO_PI * frequency) / sampleRate) % TWO_PI;
      let sample = 0;
      for (
        let harmonicIndex = 0;
        harmonicIndex < speaker.timbre.harmonics.length;
        harmonicIndex += 1
      ) {
        const amplitude = speaker.timbre.harmonics[harmonicIndex] ?? 0;
        sample += amplitude * Math.sin(phase * (harmonicIndex + 1));
      }

      const envelope = envelopeAt(
        localIndex,
        sampleCount,
        sampleRate,
        adsr,
      );
      const output =
        (sample / harmonicNormalization) *
        envelope *
        volume *
        (event.gain ?? 1);
      pcm[writeIndex + localIndex] = Math.max(-1, Math.min(1, output));
    }

    writeIndex += sampleCount;
    previousFrequency = targetFrequency;
  }

  return pcm;
}
