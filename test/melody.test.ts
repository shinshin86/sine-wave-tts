import { describe, expect, it } from "vitest";
import { fnv1a, xorshift32 } from "../src/core/melody.js";

describe("deterministic contour seeds", () => {
  it("hashes identical text to the same unsigned 32-bit value", () => {
    const first = fnv1a("同じ語は同じアクセントです");
    const second = fnv1a("同じ語は同じアクセントです");

    expect(first).toBe(second);
    expect(first).toBeGreaterThanOrEqual(0);
    expect(first).toBeLessThanOrEqual(0xffff_ffff);
    expect(fnv1a("異なる語です")).not.toBe(first);
  });

  it("produces a repeatable non-zero xorshift sequence", () => {
    const sequence = (seed: number): number[] => {
      const values: number[] = [];
      let state = seed;
      for (let index = 0; index < 8; index += 1) {
        state = xorshift32(state);
        values.push(state);
      }
      return values;
    };

    expect(sequence(123_456)).toEqual(sequence(123_456));
    expect(new Set(sequence(123_456)).size).toBe(8);
    expect(xorshift32(0)).not.toBe(0);
  });
});
