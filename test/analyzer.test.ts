import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  analyzeFallback,
  analyzeText,
  loadKuromojiAnalyzer,
  readingToMoras,
  setLanguageAnalyzer,
} from "../src/core/analyzer.js";

describe("language analyzer", () => {
  beforeAll(async () => {
    await loadKuromojiAnalyzer({
      dicPath: "node_modules/kuromoji/dict",
      throwOnError: true,
    });
  });

  afterAll(() => {
    setLanguageAnalyzer(null);
  });

  it("splits kana readings into actual mora", () => {
    expect(readingToMoras("キョウ").map((mora) => mora.text)).toEqual([
      "きょ",
      "う",
    ]);
    expect(readingToMoras("キンキュー").map((mora) => mora.text)).toEqual([
      "き",
      "ん",
      "きゅ",
      "ー",
    ]);
  });

  it("uses kuromoji reading and part-of-speech grouping", () => {
    const today = analyzeText("今日");
    expect(today).toHaveLength(1);
    expect(today[0]?.moras).toHaveLength(2);
    expect(today[0]?.tokens[0]?.partOfSpeech).toBe("名詞");

    const sentence = analyzeText("緊急事態が発生しました!");
    expect(sentence.length).toBeGreaterThan(1);
    expect(sentence.at(-1)?.boundary).toBe("exclamation");
    expect(sentence.some((phrase) => phrase.tokens.some((token) => token.partOfSpeech === "助詞"))).toBe(true);
  });

  it("keeps a dependency-free fallback available", () => {
    const fallback = analyzeFallback("今日です。");
    expect(fallback.length).toBeGreaterThan(0);
    expect(fallback.at(-1)?.boundary).toBe("period");
  });
});
