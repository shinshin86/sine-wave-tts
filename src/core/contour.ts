import { fnv1a, xorshift32, type MelodyEvent } from "./melodizer.js";
import type { AccentPhrase, Mora, PhrasePause } from "./analyzer.js";
import type { SpeakerPreset } from "../presets/speakers.js";

export type AccentType = "heiban" | "atamadaka" | "nakadaka";

export interface AccentPattern {
  type: AccentType;
  nucleus: number | null;
}

export interface ContourOptions {
  ornamentProbability?: number;
}

function accentPattern(phrase: AccentPhrase): AccentPattern {
  const hash = fnv1a(phrase.accentKey);
  const folded = (hash ^ (hash >>> 16)) >>> 0;
  const typeIndex = folded % 3;
  if (typeIndex === 0) return { type: "heiban", nucleus: null };
  if (typeIndex === 1) return { type: "atamadaka", nucleus: 0 };
  const possibleNuclei = Math.max(1, phrase.moras.length - 1);
  return {
    type: "nakadaka",
    nucleus: 1 + ((folded >>> 8) % possibleNuclei),
  };
}

function isHigh(index: number, pattern: AccentPattern): boolean {
  if (pattern.type === "heiban") return index > 0;
  if (pattern.type === "atamadaka") return index === 0;
  return index > 0 && index <= (pattern.nucleus ?? 1);
}

function nearestScaleIndex(scale: readonly number[], frequency: number): number {
  let nearest = 0;
  let nearestDistance = Infinity;
  for (let index = 0; index < scale.length; index += 1) {
    const candidate = scale[index];
    if (candidate === undefined) continue;
    const distance = Math.abs(Math.log2(candidate / frequency));
    if (distance < nearestDistance) {
      nearest = index;
      nearestDistance = distance;
    }
  }
  return nearest;
}

function moraLength(mora: Mora, index: number, phrase: AccentPhrase): number {
  if (mora.kind === "sokuon") return 0.72;
  if (mora.kind === "long") return 1.45;
  let length = 1;
  if (mora.text === "ん") length *= 1.12;
  if (index === 0) length *= 0.96;
  if (index === phrase.moras.length - 1) length *= 1.18;
  return length;
}

function pauseMoras(pause: PhrasePause): number {
  if (pause === "micro") return 0.32;
  if (pause === "short") return 0.78;
  if (pause === "long") return 2;
  return 0;
}

/** Generate an accent-phrase contour, then quantize it to the speaker scale. */
export function generateContour(
  phrases: readonly AccentPhrase[],
  speaker: SpeakerPreset,
  options: ContourOptions = {},
): MelodyEvent[] {
  if (speaker.scale.length === 0) {
    throw new RangeError("speaker.scale must contain at least one frequency");
  }
  if (!Number.isFinite(speaker.baseTempo) || speaker.baseTempo <= 0) {
    throw new RangeError("speaker.baseTempo must be positive and finite");
  }
  const ornamentProbability = options.ornamentProbability ?? 0.32;
  if (
    !Number.isFinite(ornamentProbability) ||
    ornamentProbability < 0 ||
    ornamentProbability > 1
  ) {
    throw new RangeError("ornamentProbability must be between 0 and 1");
  }

  const center = speaker.scale[Math.floor(speaker.scale.length / 2)];
  if (center === undefined) throw new RangeError("speaker.scale is invalid");
  const events: MelodyEvent[] = [];
  let unitIndex = 0;
  let phraseInSentence = 0;
  let previousFrequency: number | null = null;

  for (let phraseIndex = 0; phraseIndex < phrases.length; phraseIndex += 1) {
    const phrase = phrases[phraseIndex];
    if (!phrase) continue;
    const pattern = accentPattern(phrase);
    const phraseDeclinationSemitones = phraseInSentence * -0.65;
    const phraseHash = fnv1a(phrase.accentKey);
    const foldedPhraseHash = (phraseHash ^ (phraseHash >>> 16)) >>> 0;
    const lexicalRegisterSemitones = ((foldedPhraseHash % 3) - 1) * 0.75;
    let randomState = fnv1a(`${phrase.accentKey}:${phrase.reading}`);

    for (let moraIndex = 0; moraIndex < phrase.moras.length; moraIndex += 1) {
      const mora = phrase.moras[moraIndex];
      if (!mora) continue;
      randomState = xorshift32(randomState);
      const timingJitter = [0.94, 0.98, 1, 1.03, 1.07][randomState % 5] ?? 1;
      const durationSeconds =
        (moraLength(mora, moraIndex, phrase) * timingJitter) /
        speaker.baseTempo;
      const boundary =
        moraIndex === phrase.moras.length - 1 ? phrase.boundary : "none";

      if (mora.kind === "sokuon") {
        events.push({
          unitIndex,
          text: mora.text,
          frequencyHz: null,
          durationSeconds,
          boundary,
        });
        unitIndex += 1;
        previousFrequency = null;
        continue;
      }

      const high = isHigh(moraIndex, pattern);
      const accentSemitones = high ? 1.8 : -1.8;
      const withinPhraseDeclination = moraIndex * -0.08;
      const continuousFrequency =
        center *
        2 **
          ((phraseDeclinationSemitones +
            lexicalRegisterSemitones +
            accentSemitones +
            withinPhraseDeclination) /
            12);
      let scaleIndex = nearestScaleIndex(speaker.scale, continuousFrequency);
      const decorate =
        moraIndex >= 2 &&
        (randomState % 1000) / 1000 < ornamentProbability;
      if (decorate) {
        const direction = ((randomState >>> 10) & 1) === 0 ? -1 : 1;
        scaleIndex = Math.max(
          0,
          Math.min(speaker.scale.length - 1, scaleIndex + direction),
        );
      }

      let frequency = speaker.scale[scaleIndex] ?? center;
      if (mora.kind === "long" && previousFrequency !== null) {
        frequency = previousFrequency;
      }
      events.push({
        unitIndex,
        text: mora.text,
        frequencyHz: frequency,
        durationSeconds,
        boundary,
      });
      unitIndex += 1;
      previousFrequency = frequency;
    }

    const pauseLength = pauseMoras(phrase.pauseAfter);
    if (pauseLength > 0) {
      events.push({
        unitIndex,
        text:
          phrase.pauseAfter === "short"
            ? "、"
            : phrase.pauseAfter === "long"
              ? "。"
              : " ",
        frequencyHz: null,
        durationSeconds: pauseLength / speaker.baseTempo,
        boundary: "none",
      });
      unitIndex += 1;
      previousFrequency = null;
    }

    if (
      phrase.boundary === "period" ||
      phrase.boundary === "question" ||
      phrase.boundary === "exclamation"
    ) {
      phraseInSentence = 0;
    } else {
      phraseInSentence += 1;
    }
  }

  return events;
}

export function getAccentPattern(phrase: AccentPhrase): AccentPattern {
  return accentPattern(phrase);
}
