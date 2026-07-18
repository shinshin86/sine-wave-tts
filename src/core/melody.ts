import type { PhraseBoundary } from "./tokenizer.js";

export interface MelodyEvent {
  unitIndex: number;
  text: string;
  frequencyHz: number | null;
  durationSeconds: number;
  boundary: PhraseBoundary;
  /** Per-event amplitude applied by the synthesizer. */
  gain?: number;
}

/** 32-bit FNV-1a, used only to derive deterministic contour seeds. */
export function fnv1a(text: string): number {
  let hash = 0x811c9dc5;
  for (const character of text) {
    const codePoint = character.codePointAt(0) ?? 0;
    hash ^= codePoint;
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Return the next xorshift32 state. Zero becomes a fixed non-zero state. */
export function xorshift32(state: number): number {
  let next = state >>> 0;
  if (next === 0) next = 0x9e3779b9;
  next ^= next << 13;
  next ^= next >>> 17;
  next ^= next << 5;
  return next >>> 0;
}
