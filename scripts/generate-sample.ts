import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { synthesize } from "../src/index.js";

const outputPath = process.argv[2] ?? "artifacts/sample.wav";
const text = process.argv[3] ?? "こんにちは、サイン波の声です。";
const result = synthesize(text, { emotion: "neutral" });

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, Buffer.from(result.toWav()));

console.log(
  `Wrote ${outputPath} (${result.durationMs.toFixed(0)} ms, ${result.pcm.length} samples)`,
);
