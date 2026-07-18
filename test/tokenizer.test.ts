import { describe, expect, it } from "vitest";
import { tokenize } from "../src/core/tokenizer.js";

describe("tokenize", () => {
  it("approximates Japanese mora and turns punctuation into metadata", () => {
    const units = tokenize("きゃっとー、AI。");

    expect(units).toEqual([
      {
        text: "きゃ",
        kind: "voiced",
        moraCount: 1,
        boundary: "none",
        pause: null,
      },
      {
        text: "っ",
        kind: "pause",
        moraCount: 0.5,
        boundary: "none",
        pause: "sokuon",
      },
      {
        text: "とー",
        kind: "voiced",
        moraCount: 2,
        boundary: "comma",
        pause: null,
      },
      {
        text: "、",
        kind: "pause",
        moraCount: 0.75,
        boundary: "none",
        pause: "short",
      },
      {
        text: "A",
        kind: "voiced",
        moraCount: 2,
        boundary: "none",
        pause: null,
      },
      {
        text: "I",
        kind: "voiced",
        moraCount: 2,
        boundary: "period",
        pause: null,
      },
      {
        text: "。",
        kind: "pause",
        moraCount: 2,
        boundary: "none",
        pause: "long",
      },
    ]);
  });

  it("records question and exclamation phrase endings", () => {
    expect(tokenize("はい?").at(-1)?.boundary).toBe("question");
    expect(tokenize("はい!").at(-1)?.boundary).toBe("exclamation");
  });

  it("returns an empty list for punctuation-only text", () => {
    expect(tokenize("?! 、。")).toEqual([]);
  });
});
