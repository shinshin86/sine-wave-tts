import { tokenize, type PhraseBoundary, type Utterance } from "./tokenizer.js";

export type MoraKind = "voiced" | "sokuon" | "long";
export type PhrasePause = "none" | "micro" | "short" | "long";

export interface Mora {
  text: string;
  kind: MoraKind;
  source: string;
}

export interface AnalyzedToken {
  surface: string;
  reading: string;
  pronunciation: string;
  basicForm: string;
  partOfSpeech: string;
  partOfSpeechDetail: string;
}

export interface AccentPhrase {
  phraseIndex: number;
  text: string;
  reading: string;
  accentKey: string;
  moras: Mora[];
  tokens: AnalyzedToken[];
  boundary: PhraseBoundary;
  pauseAfter: PhrasePause;
}

export interface LanguageAnalyzer {
  analyze(text: string): AccentPhrase[];
}

export interface KuromojiToken {
  surface_form: string;
  pos: string;
  pos_detail_1?: string;
  basic_form?: string;
  reading?: string;
  pronunciation?: string;
}

export interface KuromojiTokenizer {
  tokenize(text: string): KuromojiToken[];
}

export interface KuromojiApi {
  builder(options: { dicPath: string }): {
    build(
      callback: (
        error: Error | null,
        tokenizer?: KuromojiTokenizer,
      ) => void,
    ): void;
  };
}

export interface LoadKuromojiOptions {
  dicPath?: string;
  module?: KuromojiApi;
  throwOnError?: boolean;
}

const COMBINING_KANA = new Set([
  "ゃ",
  "ゅ",
  "ょ",
  "ぁ",
  "ぃ",
  "ぅ",
  "ぇ",
  "ぉ",
  "ゎ",
  "ゕ",
  "ゖ",
]);
const CONTENT_POS = new Set([
  "名詞",
  "動詞",
  "形容詞",
  "副詞",
  "連体詞",
  "感動詞",
  "接続詞",
  "フィラー",
]);

let activeAnalyzer: LanguageAnalyzer | null = null;
let analyzerLoadPromise: Promise<boolean> | null = null;

function katakanaToHiragana(value: string): string {
  return Array.from(value.normalize("NFC"), (character) => {
    const code = character.codePointAt(0) ?? 0;
    return code >= 0x30a1 && code <= 0x30f6
      ? String.fromCodePoint(code - 0x60)
      : character;
  }).join("");
}

export function readingToMoras(reading: string, source = reading): Mora[] {
  const hiragana = katakanaToHiragana(reading);
  const moras: Mora[] = [];

  for (const character of hiragana) {
    if (COMBINING_KANA.has(character) && moras.length > 0) {
      const previous = moras.at(-1);
      if (previous?.kind === "voiced") previous.text += character;
      continue;
    }
    if (character === "ー") {
      moras.push({ text: character, kind: "long", source });
      continue;
    }
    if (character === "っ") {
      moras.push({ text: character, kind: "sokuon", source });
      continue;
    }
    if (/[\u3041-\u3096]/u.test(character)) {
      moras.push({ text: character, kind: "voiced", source });
    }
  }
  return moras;
}

function fallbackUnitMoras(unit: Utterance): Mora[] {
  if (unit.pause === "sokuon") {
    return [{ text: unit.text, kind: "sokuon", source: unit.text }];
  }

  const parsed = readingToMoras(unit.text, unit.text);
  if (parsed.length >= unit.moraCount) return parsed;
  const moras = [...parsed];
  const missing = Math.max(0, Math.round(unit.moraCount) - moras.length);
  for (let index = 0; index < missing; index += 1) {
    moras.push({
      text: index === 0 && moras.length === 0 ? unit.text : "・",
      kind: "voiced",
      source: unit.text,
    });
  }
  return moras;
}

function createPhrase(
  phraseIndex: number,
  moras: Mora[],
  tokens: AnalyzedToken[],
  boundary: PhraseBoundary,
  pauseAfter: PhrasePause,
): AccentPhrase {
  const text = tokens.length > 0
    ? tokens.map((token) => token.surface).join("")
    : moras.map((mora) => mora.source).join("");
  const reading = tokens.length > 0
    ? tokens.map((token) => token.pronunciation || token.reading).join("")
    : moras.map((mora) => mora.text).join("");
  const content = tokens.filter((token) => CONTENT_POS.has(token.partOfSpeech));
  const accentKey =
    content.map((token) => token.basicForm || token.surface).join("") ||
    text ||
    reading;
  return {
    phraseIndex,
    text,
    reading,
    accentKey,
    moras,
    tokens,
    boundary,
    pauseAfter,
  };
}

export function analyzeFallback(text: string): AccentPhrase[] {
  const units = tokenize(text);
  const phrases: AccentPhrase[] = [];
  let moras: Mora[] = [];
  let boundary: PhraseBoundary = "none";

  const flush = (pauseAfter: PhrasePause): void => {
    if (moras.length === 0) return;
    phrases.push(
      createPhrase(phrases.length, moras, [], boundary, pauseAfter),
    );
    moras = [];
    boundary = "none";
  };

  for (const unit of units) {
    if (unit.kind === "voiced" || unit.pause === "sokuon") {
      moras.push(...fallbackUnitMoras(unit));
      if (unit.boundary !== "none") boundary = unit.boundary;
      if (unit.boundary === "question" || unit.boundary === "exclamation") {
        flush("none");
      }
      continue;
    }
    if (unit.pause === "short") {
      if (boundary === "none") boundary = "comma";
      flush("short");
    } else if (unit.pause === "long") {
      if (boundary === "none") boundary = "period";
      flush("long");
    }
  }
  flush("none");
  return phrases;
}

function punctuation(
  surface: string,
): { boundary: PhraseBoundary; pause: PhrasePause } | null {
  if (surface === "、" || surface === "," || surface === "，") {
    return { boundary: "comma", pause: "short" };
  }
  if (surface === "。" || surface === "." || surface === "．") {
    return { boundary: "period", pause: "long" };
  }
  if (surface === "?" || surface === "？") {
    return { boundary: "question", pause: "none" };
  }
  if (surface === "!" || surface === "！") {
    return { boundary: "exclamation", pause: "none" };
  }
  return null;
}

function shouldStartPhrase(
  current: readonly AnalyzedToken[],
  next: AnalyzedToken,
): boolean {
  if (current.length === 0 || !CONTENT_POS.has(next.partOfSpeech)) return false;
  const previous = current.at(-1);
  if (!previous) return false;
  if (previous.partOfSpeech === "名詞" && next.partOfSpeech === "名詞") {
    return false;
  }
  if (previous.partOfSpeech === "名詞" && next.basicForm === "する") {
    return false;
  }
  return true;
}

export function createKuromojiAnalyzer(
  tokenizer: KuromojiTokenizer,
): LanguageAnalyzer {
  return {
    analyze(text: string): AccentPhrase[] {
      const phrases: AccentPhrase[] = [];
      let tokens: AnalyzedToken[] = [];
      let moras: Mora[] = [];

      const flush = (
        boundary: PhraseBoundary = "none",
        pauseAfter: PhrasePause = "micro",
      ): void => {
        if (moras.length === 0) return;
        phrases.push(
          createPhrase(phrases.length, moras, tokens, boundary, pauseAfter),
        );
        tokens = [];
        moras = [];
      };

      for (const raw of tokenizer.tokenize(text)) {
        const punctuationInfo = punctuation(raw.surface_form);
        if (punctuationInfo) {
          flush(punctuationInfo.boundary, punctuationInfo.pause);
          continue;
        }

        const token: AnalyzedToken = {
          surface: raw.surface_form,
          reading: raw.reading ?? raw.surface_form,
          pronunciation: raw.pronunciation ?? raw.reading ?? raw.surface_form,
          basicForm:
            raw.basic_form && raw.basic_form !== "*"
              ? raw.basic_form
              : raw.surface_form,
          partOfSpeech: raw.pos,
          partOfSpeechDetail: raw.pos_detail_1 ?? "*",
        };
        if (shouldStartPhrase(tokens, token)) flush("none", "micro");

        let tokenMoras = readingToMoras(token.pronunciation, token.surface);
        if (tokenMoras.length === 0) {
          tokenMoras = analyzeFallback(token.surface).flatMap(
            (phrase) => phrase.moras,
          );
        }
        if (tokenMoras.length === 0) continue;
        tokens.push(token);
        moras.push(...tokenMoras);
      }

      flush("none", "none");
      const finalPhrase = phrases.at(-1);
      if (finalPhrase && finalPhrase.boundary === "none") {
        finalPhrase.pauseAfter = "none";
      }
      return phrases;
    },
  };
}

export function setLanguageAnalyzer(analyzer: LanguageAnalyzer | null): void {
  activeAnalyzer = analyzer;
}

export function isLanguageAnalyzerLoaded(): boolean {
  return activeAnalyzer !== null;
}

export function analyzeText(text: string): AccentPhrase[] {
  return (activeAnalyzer ?? { analyze: analyzeFallback }).analyze(text);
}

async function importKuromoji(): Promise<KuromojiApi> {
  const loaded = (await import(
    "kuromoji"
  )) as unknown as KuromojiApi & { default?: KuromojiApi };
  return loaded.default ?? loaded;
}

export async function loadKuromojiAnalyzer(
  options: LoadKuromojiOptions = {},
): Promise<boolean> {
  if (activeAnalyzer) return true;
  if (analyzerLoadPromise) return analyzerLoadPromise;

  analyzerLoadPromise = (async () => {
    try {
      const api = options.module ?? (await importKuromoji());
      const tokenizer = await new Promise<KuromojiTokenizer>((resolve, reject) => {
        api
          .builder({ dicPath: options.dicPath ?? "node_modules/kuromoji/dict" })
          .build((error, builtTokenizer) => {
            if (error) reject(error);
            else if (!builtTokenizer) reject(new Error("kuromoji returned no tokenizer"));
            else resolve(builtTokenizer);
          });
      });
      activeAnalyzer = createKuromojiAnalyzer(tokenizer);
      return true;
    } catch (error) {
      if (options.throwOnError) throw error;
      return false;
    } finally {
      analyzerLoadPromise = null;
    }
  })();
  return analyzerLoadPromise;
}
