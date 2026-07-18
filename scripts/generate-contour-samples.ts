import { mkdir, writeFile } from "node:fs/promises";
import {
  loadKuromojiAnalyzer,
  synthesize,
} from "../src/index.js";

const loaded = await loadKuromojiAnalyzer({ throwOnError: true });
if (!loaded) throw new Error("Unable to load kuromoji analyzer");

const examples = {
  greeting: "こんにちは、サイン波の声です。",
  emergency: "緊急事態が発生しました!",
} as const;
await mkdir("artifacts", { recursive: true });

for (const [name, text] of Object.entries(examples)) {
  const result = synthesize(text, { emotion: "neutral" });
  const outputPath = `artifacts/${name}.wav`;
  await writeFile(outputPath, Buffer.from(result.toWav()));
  console.log(
    `Wrote ${outputPath} (${result.durationMs.toFixed(0)} ms, ${result.timings.length} units)`,
  );
}
