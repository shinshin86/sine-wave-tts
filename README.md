# sine-wave-tts

*Read this in other languages: [日本語](./README.ja.md)*

A TypeScript library that turns text into a deterministic sequence of sine-wave tones.
Instead of imitating a human voice like conventional speech synthesis, it expresses
accent phrases, mora timing, emotion, and voice character as an electronic,
speech-like signal — a "voice" for characters that are not human.

- The same text, speaker, and emotion always produce the same PCM / WAV
- Japanese reading and part-of-speech analysis via kuromoji.js, with a lightweight
  fallback when the analyzer is not loaded
- 5 speakers × 7 emotions, freely combinable
- Outputs 44.1 kHz / mono / 16-bit WAV plus per-unit timings for subtitles and lip sync
- Works in both Node.js and the browser

## Requirements

- Node.js 20 or later
- npm (bundled with Node.js)

Corepack, pnpm, and Yarn are not used.

## Installation

To try it from the repository:

```bash
npm install
npm test
```

To use it as a library once published:

```bash
npm install sine-wave-tts
```

## Basic API

```ts
import {
  loadKuromojiAnalyzer,
  synthesizeAsync,
} from "sine-wave-tts";

await loadKuromojiAnalyzer({ throwOnError: true });

const result = await synthesizeAsync("こんにちは、サイン波の声です。", {
  speaker: "songful",
  emotion: "joy",
  speed: 1,
  pitch: 1,
  volume: 0.8,
});

console.log(result.durationMs, result.timings);
const wav = result.toWav();
```

### `synthesize(text, options?)`

Generates PCM synchronously. When the kuromoji analyzer is not loaded yet, it still
synthesizes immediately using the built-in approximate analysis.

### `synthesizeAsync(text, options?)`

A Promise-based wrapper that makes it easy to swap in for a real TTS service.
Loading the analyzer itself is done explicitly with `loadKuromojiAnalyzer()`.

### `SynthesisOptions`

| Field | Type | Default | Description |
|---|---|---|---|
| `speaker` | `string \| SpeakerPreset` | `"default"` | Register, tempo, harmonics, portamento |
| `emotion` | `string \| EmotionPreset` | `"neutral"` | Pitch, range, tempo, phrase endings, envelope |
| `speed` | `number` | `1` | Overall speed. Positive number |
| `pitch` | `number` | `1` | Overall pitch multiplier. Positive number |
| `volume` | `number` | `0.8` | Output volume, `0..1` |

### `SynthesisResult`

| Field | Type | Description |
|---|---|---|
| `pcm` | `Float32Array` | 44.1 kHz mono PCM |
| `sampleRate` | `number` | Currently `44100` |
| `durationMs` | `number` | Length of the synthesized audio |
| `timings` | `UnitTiming[]` | Start / end time of each utterance unit |
| `toWav()` | `() => ArrayBuffer` | Encode as 16-bit PCM WAV |

## Presets

Speakers define voice character and base rhythm; emotions define expressive
modulation. The two axes are independent and freely combinable.

| Speaker | Character |
|---|---|
| `default` | Standard signal voice, 32 tones over ~2.6 octaves |
| `chirpy` | High register, fast, bright harmonics, small-creature-like |
| `deep` | Low register, slow, near-pure tone, long glides |
| `robotic` | Mid register, odd harmonics, no portamento |
| `songful` | 3 octaves, standard vibrato, singing-like glides |

Available emotions are `neutral`, `joy`, `sad`, `angry`, `surprise`, `calm`,
and `fear`. The registered lists can be read at runtime from
`supportedSpeakers` and `supportedEmotions`.

A custom `SpeakerPreset` specifies an ascending frequency scale, `baseTempo`
in morae per second, harmonics, vibrato, ADSR, and portamento time. Comments
in the type definitions describe which direction to adjust each parameter.

## Demo

```bash
npm run demo
```

Open the printed local URL in your browser. Before startup, the kuromoji
dictionary is automatically synced into `demo/public/dict/`. While the
dictionary is loading, playback works via the fallback analyzer; once loading
finishes, the status indicator switches to "Kuromoji analyzer ready".

To build the static production files:

```bash
npm run demo:build
```

## Sample WAVs

```bash
npm run samples          # all emotions
npm run contour-samples  # greeting vs. emergency sentence
npm run preset-samples   # 5 speakers + 7 emotions
```

Output goes to `artifacts/`. `preset-samples` writes into
`artifacts/presets/speakers/` and `artifacts/presets/emotions/`.

## Architecture

```text
text
  → analyzer      readings, POS, accent phrases (falls back on failure)
  → contour       mora timing, accent, declination, scale quantization
  → prosody       speaker × emotion × phrase-final punctuation
  → synthesizer   harmonics, ADSR, portamento, vibrato → PCM
  → wav/timings   WAV encoding and sync information
```

The synthesis core does not depend on the Web Audio API; browser playback is
handled by the demo. Only the Japanese analysis layer uses kuromoji.js and its
dictionary data.

## Development

```bash
npm run typecheck
npm test
npm run build
npm run demo:build
```
