function writeAscii(view: DataView, offset: number, value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}

/** Encode mono Float32 PCM as a 16-bit little-endian RIFF/WAVE buffer. */
export function encodeWav(
  pcm: Float32Array,
  sampleRate = 44_100,
): ArrayBuffer {
  if (!Number.isSafeInteger(sampleRate) || sampleRate <= 0) {
    throw new RangeError("sampleRate must be a positive safe integer");
  }

  const bytesPerSample = 2;
  const dataSize = pcm.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true);
  view.setUint16(32, bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, dataSize, true);

  for (let index = 0; index < pcm.length; index += 1) {
    const value = pcm[index];
    const finite = value === undefined || !Number.isFinite(value) ? 0 : value;
    const clamped = Math.max(-1, Math.min(1, finite));
    const integer = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
    view.setInt16(44 + index * bytesPerSample, Math.round(integer), true);
  }

  return buffer;
}
