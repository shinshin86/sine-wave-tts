export type PhraseBoundary =
  | "none"
  | "comma"
  | "period"
  | "question"
  | "exclamation";

export type PauseKind = "short" | "long" | "sokuon";

export interface Utterance {
  /** The source characters represented by this unit. */
  text: string;
  /** Voiced units become notes; pause units become silence. */
  kind: "voiced" | "pause";
  /** Approximate duration, expressed in mora units. */
  moraCount: number;
  /** Phrase metadata attached to the preceding voiced unit. */
  boundary: PhraseBoundary;
  pause: PauseKind | null;
}

const COMBINING_KANA = new Set(["ゃ", "ゅ", "ょ", "ャ", "ュ", "ョ"]);
const SOKUON = new Set(["っ", "ッ"]);
const LONG_MARK = "ー";

function lastVoiced(units: Utterance[]): Utterance | undefined {
  for (let index = units.length - 1; index >= 0; index -= 1) {
    const unit = units[index];
    if (unit?.kind === "voiced") return unit;
  }
  return undefined;
}

function appendPause(units: Utterance[], pause: PauseKind): void {
  const previous = units.at(-1);
  if (previous?.kind === "pause" && previous.pause !== "sokuon") {
    if (pause === "long") {
      previous.text = "。";
      previous.pause = "long";
      previous.moraCount = 2;
    }
    return;
  }

  units.push({
    text: pause === "short" ? "、" : pause === "long" ? "。" : "っ",
    kind: "pause",
    moraCount: pause === "short" ? 0.75 : pause === "long" ? 2 : 0.5,
    boundary: "none",
    pause,
  });
}

function appendBoundary(
  units: Utterance[],
  boundary: Exclude<PhraseBoundary, "none">,
): void {
  const voiced = lastVoiced(units);
  if (!voiced) return;
  voiced.boundary = boundary;

  if (boundary === "comma") appendPause(units, "short");
  if (boundary === "period") appendPause(units, "long");
}

function isKana(character: string): boolean {
  return /[\u3041-\u3096\u30a1-\u30fa]/u.test(character);
}

function isHan(character: string): boolean {
  return /\p{Script=Han}/u.test(character);
}

function isLetterOrNumber(character: string): boolean {
  return /[\p{Letter}\p{Number}]/u.test(character);
}

/**
 * Split text into a dependency-free Japanese mora approximation.
 *
 * Kanji and alphanumeric characters are deliberately treated as two mora;
 * phonetic conversion is outside the v1 scope.
 */
export function tokenize(text: string): Utterance[] {
  const units: Utterance[] = [];

  for (const character of text.normalize("NFC")) {
    if (COMBINING_KANA.has(character)) {
      const voiced = lastVoiced(units);
      if (voiced && voiced === units.at(-1)) voiced.text += character;
      else {
        units.push({
          text: character,
          kind: "voiced",
          moraCount: 1,
          boundary: "none",
          pause: null,
        });
      }
      continue;
    }

    if (character === LONG_MARK) {
      const voiced = lastVoiced(units);
      if (voiced && voiced === units.at(-1)) {
        voiced.text += character;
        voiced.moraCount += 1;
      }
      continue;
    }

    if (SOKUON.has(character)) {
      appendPause(units, "sokuon");
      continue;
    }

    if (character === "、" || character === "," || character === "，") {
      appendBoundary(units, "comma");
      continue;
    }

    if (character === "。" || character === "." || character === "．") {
      appendBoundary(units, "period");
      continue;
    }

    if (character === "?" || character === "？") {
      appendBoundary(units, "question");
      continue;
    }

    if (character === "!" || character === "！") {
      appendBoundary(units, "exclamation");
      continue;
    }

    if (/\s/u.test(character)) {
      if (units.length > 0) appendPause(units, "short");
      continue;
    }

    if (isKana(character)) {
      units.push({
        text: character,
        kind: "voiced",
        moraCount: 1,
        boundary: "none",
        pause: null,
      });
      continue;
    }

    if (isHan(character) || isLetterOrNumber(character)) {
      units.push({
        text: character,
        kind: "voiced",
        moraCount: 2,
        boundary: "none",
        pause: null,
      });
    }
  }

  while (units.at(-1)?.kind === "pause" && units.at(-1)?.pause === "short") {
    units.pop();
  }

  return units;
}
