import { mkdir, writeFile } from "node:fs/promises";
import {
  loadKuromojiAnalyzer,
  supportedEmotions,
  synthesize,
} from "../src/index.js";

const text = process.argv[2] ?? "今日はとても良い日ですね。いっしょに出かけませんか?";
await loadKuromojiAnalyzer({ throwOnError: true });
await mkdir("artifacts", { recursive: true });

for (const emotion of supportedEmotions) {
  const result = synthesize(text, { emotion });
  const outputPath = `artifacts/${emotion}.wav`;
  await writeFile(outputPath, Buffer.from(result.toWav()));
  console.log(
    `Wrote ${outputPath} (${result.durationMs.toFixed(0)} ms, ${result.pcm.length} samples)`,
  );
}
