# sine-wave-tts

*Read this in other languages: [日本語](./README.ja.md)*

A TypeScript library that makes text "speak" in beeping sine-wave tones.

The result sounds like a robot or a video-game character chattering in
electronic beeps. Instead of imitating a human voice, the library moves pitch
and rhythm to follow the readings and accents of the input text. No actual
words come through, but it still sounds like someone talking. It was built to
give a voice to AI characters and mascots that aren't human.

- The same text always produces the same sound, so each character keeps a
  consistent, recognizable voice
- Understands Japanese readings and accents and reflects them in the sound
  (kuromoji.js, with a built-in lightweight fallback)
- 5 voice characters and 7 emotions that can be combined in any pairing
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
modulation. The two axes are independent, so any speaker works with any emotion.

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

## Web demo (sample playback)

```bash
npm run webdemo
```

Open the printed local URL in your browser. Before startup, the kuromoji
dictionary is automatically synced into `demo/public/dict/`. While the
dictionary is loading, playback works via the fallback analyzer; once loading
finishes, the status indicator switches to "Kuromoji analyzer ready".

To build the static production files:

```bash
npm run webdemo:build
```

## HTTP API server

Start the dependency-free Node.js server (default: `127.0.0.1:50021`):

```bash
npm run serve
```

Select another port with `PORT=51000 npm run serve` or
`npm run serve -- --port 51000`. The command-line flag takes precedence.
The server loads kuromoji before listening and reports whether the analyzer is
`ready` or using the `fallback`. All routes allow CORS.

### Native API

| Method and path | Response |
|---|---|
| `POST /v1/synthesize` | WAV; send `Accept: application/json` for Base64 WAV and timings |
| `GET /v1/speakers` | Speaker presets and parameter summaries |
| `GET /v1/emotions` | Emotion presets |
| `GET /v1/health` | Server and analyzer status |

```bash
curl -sS -X POST http://127.0.0.1:50021/v1/synthesize \
  -H 'Content-Type: application/json' \
  --data '{"text":"こんにちは、APIです。","speaker":"chirpy","emotion":"joy"}' \
  --output native.wav
```

### VOICEVOX-compatible API

The compatibility layer exposes `/audio_query`, `/synthesis`, `/speakers`, and
`/version`. Each speaker × emotion pair is assigned a stable numeric style ID;
read `/speakers` instead of hard-coding IDs.

```bash
curl -sS -X POST \
  'http://127.0.0.1:50021/audio_query?text=こんにちは&speaker=0' \
  --output query.json

curl -sS -X POST \
  'http://127.0.0.1:50021/synthesis?speaker=0' \
  -H 'Content-Type: application/json' \
  --data-binary @query.json \
  --output voicevox.wav
```

`speedScale`, `pitchScale`, and `volumeScale` in the AudioQuery are mapped to
the native synthesis controls. This is a practical playback-compatible subset,
not a complete implementation of every VOICEVOX feature.

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
npm run webdemo:build
npm run serve
```
