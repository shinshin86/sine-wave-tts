# sine-wave-tts

*他の言語で読む: [English](./README.md)*

テキストを入力すると、サイン波の「ピコピコ音」で喋っているかのような音を生成する
TypeScript ライブラリです。

イメージは、ロボットやゲームのキャラクターが電子音でおしゃべりしている感じです。
人の声を真似るのではなく、入力した日本語の読みやアクセントに合わせて音の高さと
リズムが動くので、言葉は聞き取れないのに「何か話している」ように聞こえます。
人間ではない AI キャラクターやマスコットの「声」として使うことを想定しています。

- 同じテキストからはいつも同じ音が生まれるので、「その子の声」として一貫する
- 日本語の読みとアクセントを解析して音に反映(kuromoji.js。未ロード時も簡易解析で動作)
- 声質 5 種類 × 感情 7 種類を自由に組み合わせ可能
- 44.1 kHz / mono / 16-bit の WAV と、字幕・口パク同期用のタイミング情報を出力
- Node.js とブラウザの両方で動作

## 必要環境

- Node.js 20 以上
- Node.js 付属の npm

Corepack、pnpm、Yarn は使用しません。

## インストール

リポジトリで試す場合:

```bash
npm install
npm test
```

ライブラリとして公開後に利用する場合:

```bash
npm install sine-wave-tts
```

## 基本API

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

同期的に PCM を生成します。kuromoji analyzer が未ロードの場合も、内蔵の近似解析で
すぐに合成できます。

### `synthesizeAsync(text, options?)`

TTS サービスと差し替えやすい Promise 形式のラッパーです。解析器のロード自体は
`loadKuromojiAnalyzer()` で明示的に行います。

### `SynthesisOptions`

| 項目 | 型 | 既定値 | 説明 |
|---|---|---|---|
| `speaker` | `string \| SpeakerPreset` | `"default"` | 声域・テンポ・倍音・ポルタメント |
| `emotion` | `string \| EmotionPreset` | `"neutral"` | ピッチ・音域・テンポ・句末・音量包絡 |
| `speed` | `number` | `1` | 全体速度。正の値 |
| `pitch` | `number` | `1` | 全体ピッチ倍率。正の値 |
| `volume` | `number` | `0.8` | 出力音量。`0..1` |

### `SynthesisResult`

| 項目 | 型 | 説明 |
|---|---|---|
| `pcm` | `Float32Array` | 44.1 kHz mono PCM |
| `sampleRate` | `number` | 現在は `44100` |
| `durationMs` | `number` | 合成音声の長さ |
| `timings` | `UnitTiming[]` | 発話単位ごとの開始・終了時刻 |
| `toWav()` | `() => ArrayBuffer` | 16-bit PCM WAV へ変換 |

## プリセット

speaker は声質と基本リズム、emotion は発話感情を担当し、互いに独立して
組み合わせられます。

| speaker | 特徴 |
|---|---|
| `default` | 約2.6オクターブ・32音の標準信号音 |
| `chirpy` | 高域、速め、明るい倍音、小動物的 |
| `deep` | 低域、遅め、純音寄り、長い音程遷移 |
| `robotic` | 中域、奇数倍音、ポルタメントなし |
| `songful` | 3オクターブ、標準ビブラート、歌うような遷移 |

emotion は `neutral`、`joy`、`sad`、`angry`、`surprise`、`calm`、`fear` を
利用できます。登録済み一覧は `supportedSpeakers` と `supportedEmotions` から
動的に取得できます。

独自の `SpeakerPreset` では、昇順の周波数スケール、モーラ毎秒の
`baseTempo`、倍音、ビブラート、ADSR、ポルタメント時間を指定します。
型定義内のコメントに調整方向を記載しています。

## デモ

```bash
npm run demo
```

表示されたローカルURLをブラウザで開きます。起動前に kuromoji の辞書が
`demo/public/dict/` へ自動同期されます。辞書ロード中でもフォールバック解析で
再生でき、完了後は画面上の状態が `Kuromoji analyzer ready` に切り替わります。

本番用の静的ファイルは次で生成します。

```bash
npm run demo:build
```

## 試聴WAV

```bash
npm run samples          # 全 emotion
npm run contour-samples  # 挨拶文と緊急文
npm run preset-samples   # 5 speaker + 7 emotion
```

生成先は `artifacts/` です。`preset-samples` は
`artifacts/presets/speakers/` と `artifacts/presets/emotions/` に出力します。

## アーキテクチャ

```text
text
  → analyzer      読み・品詞・アクセント句（失敗時はfallback）
  → contour       モーラ長・アクセント・自然下降・スケール量子化
  → prosody       speaker × emotion × 句末記号
  → synthesizer   倍音・ADSR・ポルタメント・ビブラート → PCM
  → wav/timings   WAVエンコードと同期情報
```

合成コアは Web Audio API に依存せず、ブラウザ再生はデモ側で行います。
日本語解析のみ kuromoji.js と辞書データを使用します。

## 開発

```bash
npm run typecheck
npm test
npm run build
npm run demo:build
```
