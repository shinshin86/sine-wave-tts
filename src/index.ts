import { analyzeText, loadKuromojiAnalyzer } from "./core/analyzer.js";
import { generateContour } from "./core/contour.js";
import { melodize } from "./core/melodizer.js";
import { applyProsody, createUnitTimings, type UnitTiming } from "./core/prosody.js";
import { synthesizePcm } from "./core/synthesizer.js";
import { tokenize } from "./core/tokenizer.js";
import { encodeWav } from "./core/wav.js";
import {
  defaultSpeaker,
  getSpeakerPreset,
  type SpeakerPreset,
} from "./presets/speakers.js";
import {
  getEmotionPreset,
  type EmotionName,
  type EmotionPreset,
} from "./presets/emotions.js";

export const SAMPLE_RATE = 44_100;

export interface SynthesisOptions {
  speaker?: string | SpeakerPreset;
  emotion?: EmotionName | EmotionPreset;
  speed?: number;
  pitch?: number;
  volume?: number;
}

export interface SynthesisResult {
  pcm: Float32Array;
  sampleRate: number;
  durationMs: number;
  timings: UnitTiming[];
  toWav(): ArrayBuffer;
}

function resolveSpeaker(speaker: SynthesisOptions["speaker"]): SpeakerPreset {
  if (typeof speaker === "string") return getSpeakerPreset(speaker);
  return speaker ?? defaultSpeaker;
}

function resolveEmotion(
  emotion: SynthesisOptions["emotion"],
): EmotionPreset {
  if (typeof emotion === "string") return getEmotionPreset(emotion);
  return emotion ?? getEmotionPreset("neutral");
}

/** Synchronously synthesize deterministic neutral vocalization from text. */
export function synthesize(
  text: string,
  options: SynthesisOptions = {},
): SynthesisResult {
  const sampleRate = SAMPLE_RATE;
  const speaker = resolveSpeaker(options.speaker);
  const emotion = resolveEmotion(options.emotion);
  const phrases = analyzeText(text);
  const melody = generateContour(phrases, speaker);
  const prosody = applyProsody(melody, speaker, emotion, {
    speed: options.speed,
    pitch: options.pitch,
  });
  const pcm = synthesizePcm(prosody.events, speaker, {
    sampleRate,
    volume: options.volume,
    adsr: prosody.adsr,
    vibrato: prosody.vibrato,
  });
  const timings = createUnitTimings(prosody.events, sampleRate);

  return {
    pcm,
    sampleRate,
    durationMs: (pcm.length / sampleRate) * 1_000,
    timings,
    toWav: () => encodeWav(pcm, sampleRate),
  };
}

/** Promise wrapper for callers that use an asynchronous TTS interface. */
export async function synthesizeAsync(
  text: string,
  options: SynthesisOptions = {},
): Promise<SynthesisResult> {
  return synthesize(text, options);
}

export {
  analyzeFallback,
  analyzeText,
  createKuromojiAnalyzer,
  isLanguageAnalyzerLoaded,
  loadKuromojiAnalyzer,
  readingToMoras,
  setLanguageAnalyzer,
} from "./core/analyzer.js";
export { generateContour, getAccentPattern } from "./core/contour.js";
export { melodize, fnv1a, xorshift32 } from "./core/melodizer.js";
export { applyProsody, createUnitTimings } from "./core/prosody.js";
export { synthesizePcm } from "./core/synthesizer.js";
export { tokenize } from "./core/tokenizer.js";
export { encodeWav } from "./core/wav.js";
export {
  defaultSpeaker,
  getSpeakerPreset,
  speakerPresets,
  supportedSpeakers,
} from "./presets/speakers.js";
export {
  emotionPresets,
  getEmotionPreset,
  supportedEmotions,
  transformAdsr,
} from "./presets/emotions.js";
export type { MelodyEvent, MelodizeOptions } from "./core/melodizer.js";
export type {
  AccentPhrase,
  AnalyzedToken,
  KuromojiApi,
  KuromojiToken,
  KuromojiTokenizer,
  LanguageAnalyzer,
  LoadKuromojiOptions,
  Mora,
  MoraKind,
  PhrasePause,
} from "./core/analyzer.js";
export type {
  AccentPattern,
  AccentType,
  ContourOptions,
} from "./core/contour.js";
export type { SynthesizerOptions } from "./core/synthesizer.js";
export type {
  ProsodyOptions,
  ProsodyResult,
  UnitTiming,
} from "./core/prosody.js";
export type {
  PauseKind,
  PhraseBoundary,
  Utterance,
} from "./core/tokenizer.js";
export type {
  AdsrPreset,
  SpeakerName,
  SpeakerPreset,
  VibratoPreset,
} from "./presets/speakers.js";
export type {
  AdsrTransform,
  EmotionName,
  EmotionPreset,
} from "./presets/emotions.js";
