import { describe, expect, it } from "vitest";
import { encodeWav } from "../src/core/wav.js";

function ascii(view: DataView, offset: number, length: number): string {
  return String.fromCharCode(
    ...Array.from({ length }, (_, index) => view.getUint8(offset + index)),
  );
}

describe("encodeWav", () => {
  it("writes a valid mono 16-bit PCM RIFF header", () => {
    const pcm = new Float32Array([-1, -0.5, 0, 0.5, 1]);
    const wav = encodeWav(pcm, 44_100);
    const view = new DataView(wav);

    expect(ascii(view, 0, 4)).toBe("RIFF");
    expect(view.getUint32(4, true)).toBe(wav.byteLength - 8);
    expect(ascii(view, 8, 4)).toBe("WAVE");
    expect(ascii(view, 12, 4)).toBe("fmt ");
    expect(view.getUint16(20, true)).toBe(1);
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(44_100);
    expect(view.getUint16(34, true)).toBe(16);
    expect(ascii(view, 36, 4)).toBe("data");
    expect(view.getUint32(40, true)).toBe(pcm.length * 2);
    expect(wav.byteLength).toBe(44 + pcm.length * 2);
  });
});
