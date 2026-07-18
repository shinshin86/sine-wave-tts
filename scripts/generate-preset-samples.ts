import { mkdir, writeFile } from "node:fs/promises";
import {
  loadKuromojiAnalyzer,
  supportedEmotions,
  supportedSpeakers,
  synthesize,
} from "../src/index.js";

const text = process.argv[2] ?? "今日は新しい声を試します。どんな響きになるでしょう?";
await loadKuromojiAnalyzer({ throwOnError: true });

const root = "artifacts/presets";
await Promise.all([
  mkdir(`${root}/speakers`, { recursive: true }),
  mkdir(`${root}/emotions`, { recursive: true }),
]);

for (const speaker of supportedSpeakers) {
  const result = synthesize(text, { speaker, emotion: "neutral" });
  const outputPath = `${root}/speakers/${speaker}.wav`;
  await writeFile(outputPath, Buffer.from(result.toWav()));
  console.log(`Wrote ${outputPath} (${result.durationMs.toFixed(0)} ms)`);
}

for (const emotion of supportedEmotions) {
  const result = synthesize(text, { speaker: "default", emotion });
  const outputPath = `${root}/emotions/${emotion}.wav`;
  await writeFile(outputPath, Buffer.from(result.toWav()));
  console.log(`Wrote ${outputPath} (${result.durationMs.toFixed(0)} ms)`);
}
