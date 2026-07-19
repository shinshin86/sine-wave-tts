import {
  loadKuromojiAnalyzer,
  speakerPresets,
  supportedEmotions,
  synthesizeAsync,
  type EmotionName,
  type SynthesisResult,
} from "../src/index.js";
import "./style.css";

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("#app was not found");

const brandLogoUrl = new URL(
  "../assets/brand/sine-wave-tts-logo.png",
  import.meta.url,
).href;
const brandMarkUrl = new URL(
  "../assets/brand/sine-wave-tts-mark.png",
  import.meta.url,
).href;

const favicon = document.createElement("link");
favicon.rel = "icon";
favicon.type = "image/png";
favicon.href = brandMarkUrl;
document.head.append(favicon);

app.innerHTML = `
  <main class="shell">
    <header class="masthead">
      <div class="brand">
        <img class="brand-logo" src="${brandLogoUrl}" alt="Sine Wave TTS" />
      </div>
      <a
        class="source-link"
        href="https://github.com/shinshin86/sine-wave-tts"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="GitHub repository: shinshin86/sine-wave-tts"
      >
        <span class="source-label-full">shinshin86/sine-wave-tts</span>
        <span class="source-label-compact" aria-hidden="true">GitHub</span>
        <span aria-hidden="true">↗</span>
      </a>
    </header>

    <section class="hero" aria-labelledby="page-title">
      <p class="eyebrow"><span></span> Text to vocalization</p>
      <h1 id="page-title">
        <span class="hero-line">言葉を<em>喋らない</em>、</span><br />
        <span class="hero-line">音声エンジン。</span>
      </h1>
      <p class="intro">
        文字列をサイン波の音程列へ変換します。<br />
        同じ言葉からは、いつでも同じ声が生まれます。
      </p>
    </section>

    <section class="console" aria-labelledby="console-title">
      <div class="console-head">
        <h2 id="console-title">Signal console</h2>
        <div class="live-indicator" id="analyzer-state" data-state="loading" aria-live="polite">
          <span></span><strong id="analyzer-label">Analyzer loading · fallback ready</strong>
        </div>
      </div>

      <form id="synthesis-form">
        <label class="field text-field" for="text-input">
          <span class="label-row">
            <span>Input text</span>
            <output id="character-count">0 chars</output>
          </span>
          <textarea id="text-input" rows="4" maxlength="280">こんにちは、サイン波の声です。</textarea>
        </label>

        <div class="controls">
          <label class="field" for="speaker-select">
            <span>Speaker</span>
            <span class="select-wrap">
              <select id="speaker-select"></select>
            </span>
          </label>
          <label class="field" for="emotion-select">
            <span>Emotion</span>
            <span class="select-wrap">
              <select id="emotion-select"></select>
            </span>
          </label>
        </div>

        <div class="wave-panel">
          <canvas id="waveform" aria-label="生成音声の波形"></canvas>
          <div class="wave-placeholder" id="wave-placeholder">
            <span>∿</span>
            <p>Waveform appears here</p>
          </div>
          <div class="timecode" id="timecode">00:00.000</div>
        </div>

        <div class="actions">
          <button class="play-button" id="play-button" type="submit">
            <span class="play-icon" aria-hidden="true"></span>
            <span>Generate &amp; play</span>
          </button>
          <button class="download-button" id="download-button" type="button">
            <span aria-hidden="true">↓</span>
            <span>Download WAV</span>
          </button>
        </div>
      </form>

      <div class="status-row" aria-live="polite">
        <span class="status-dot" id="status-dot"></span>
        <p id="status">テキストを入力して再生してください</p>
        <span id="duration">—</span>
      </div>
    </section>

    <footer>
      <span>44.1 kHz · Mono · 16-bit WAV</span>
      <span>No model. No tracking. Pure signal.</span>
    </footer>
  </main>
`;

function element<T extends Element>(selector: string): T {
  const target = document.querySelector<T>(selector);
  if (!target) throw new Error(`${selector} was not found`);
  return target;
}

const form = element<HTMLFormElement>("#synthesis-form");
const textInput = element<HTMLTextAreaElement>("#text-input");
const speakerSelect = element<HTMLSelectElement>("#speaker-select");
const emotionSelect = element<HTMLSelectElement>("#emotion-select");
const characterCount = element<HTMLOutputElement>("#character-count");
const playButton = element<HTMLButtonElement>("#play-button");
const downloadButton = element<HTMLButtonElement>("#download-button");
const status = element<HTMLParagraphElement>("#status");
const statusDot = element<HTMLSpanElement>("#status-dot");
const duration = element<HTMLSpanElement>("#duration");
const timecode = element<HTMLDivElement>("#timecode");
const canvas = element<HTMLCanvasElement>("#waveform");
const wavePlaceholder = element<HTMLDivElement>("#wave-placeholder");
const analyzerStateElement = element<HTMLDivElement>("#analyzer-state");
const analyzerLabel = element<HTMLElement>("#analyzer-label");

for (const name of Object.keys(speakerPresets)) {
  const option = document.createElement("option");
  option.value = name;
  option.textContent = name;
  speakerSelect.append(option);
}

for (const name of supportedEmotions) {
  const option = document.createElement("option");
  option.value = name;
  option.textContent = name;
  emotionSelect.append(option);
}

let latestResult: SynthesisResult | null = null;
let audioContext: AudioContext | null = null;
let activeSource: AudioBufferSourceNode | null = null;
let analyzerState: "loading" | "ready" | "fallback" = "loading";

function setAnalyzerState(
  state: "loading" | "ready" | "fallback",
  label: string,
): void {
  analyzerState = state;
  analyzerStateElement.dataset.state = state;
  analyzerLabel.textContent = label;
}

const analyzerTimeout = window.setTimeout(() => {
  if (analyzerState === "loading") {
    setAnalyzerState("fallback", "Fallback analyzer");
    setStatus("辞書の読み込みがタイムアウトしたため、近似解析で動作します", "error");
  }
}, 20_000);

void loadKuromojiAnalyzer({ dicPath: "/dict/", throwOnError: true })
  .then((loaded) => {
    window.clearTimeout(analyzerTimeout);
    if (loaded) {
      setAnalyzerState("ready", "Kuromoji analyzer ready");
      setStatus("日本語辞書の読み込みが完了しました", "idle");
    } else {
      setAnalyzerState("fallback", "Fallback analyzer");
      setStatus("辞書を読み込めないため、近似解析で動作します", "error");
    }
  })
  .catch((error: unknown) => {
    window.clearTimeout(analyzerTimeout);
    console.warn("Kuromoji analyzer failed to load; using fallback.", error);
    setAnalyzerState("fallback", "Fallback analyzer");
    setStatus("辞書を読み込めないため、近似解析で動作します", "error");
  });

function formatTime(milliseconds: number): string {
  const totalSeconds = milliseconds / 1_000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const millis = Math.round(milliseconds % 1_000);
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(millis).padStart(3, "0")}`;
}

function updateCount(): void {
  characterCount.value = `${Array.from(textInput.value).length} chars`;
}

function setStatus(message: string, state: "idle" | "working" | "playing" | "error"): void {
  status.textContent = message;
  statusDot.dataset.state = state;
}

function drawWaveform(pcm: Float32Array): void {
  const rect = canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.round(rect.width * ratio));
  canvas.height = Math.max(1, Math.round(rect.height * ratio));
  const context = canvas.getContext("2d");
  if (!context) return;

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = "#b8ff38";
  context.lineWidth = Math.max(1, ratio);
  context.beginPath();
  const center = canvas.height / 2;
  const pixels = Math.max(1, Math.floor(canvas.width / ratio));
  const samplesPerPixel = Math.max(1, Math.floor(pcm.length / pixels));

  for (let x = 0; x < pixels; x += 1) {
    let minimum = 1;
    let maximum = -1;
    const start = x * samplesPerPixel;
    const end = Math.min(pcm.length, start + samplesPerPixel);
    for (let index = start; index < end; index += 1) {
      const sample = pcm[index] ?? 0;
      minimum = Math.min(minimum, sample);
      maximum = Math.max(maximum, sample);
    }
    const screenX = x * ratio;
    context.moveTo(screenX, center + minimum * center * 0.76);
    context.lineTo(screenX, center + maximum * center * 0.76);
  }
  context.stroke();
  wavePlaceholder.hidden = true;
}

async function generate(): Promise<SynthesisResult> {
  const text = textInput.value.trim();
  if (!text) throw new Error("テキストを入力してください");
  const result = await synthesizeAsync(text, {
    speaker: speakerSelect.value,
    emotion: emotionSelect.value as EmotionName,
  });
  latestResult = result;
  drawWaveform(result.pcm);
  duration.textContent = `${(result.durationMs / 1_000).toFixed(2)} sec`;
  timecode.textContent = formatTime(result.durationMs);
  return result;
}

async function play(result: SynthesisResult): Promise<void> {
  audioContext ??= new AudioContext();
  if (audioContext.state === "suspended") await audioContext.resume();
  activeSource?.stop();

  const buffer = audioContext.createBuffer(
    1,
    result.pcm.length,
    result.sampleRate,
  );
  buffer.getChannelData(0).set(result.pcm);
  const source = audioContext.createBufferSource();
  source.buffer = buffer;
  source.connect(audioContext.destination);
  activeSource = source;
  source.onended = () => {
    if (activeSource !== source) return;
    activeSource = null;
    playButton.disabled = false;
    setStatus("再生が完了しました", "idle");
  };
  source.start();
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  playButton.disabled = true;
  setStatus("信号を生成しています…", "working");
  try {
    const usingFallback = analyzerState !== "ready";
    if (usingFallback) {
      setStatus("辞書ロード中のため、近似解析で生成しています…", "working");
    }
    const result = await generate();
    await play(result);
    setStatus(
      usingFallback
        ? "サイン波を再生しています（近似解析）"
        : "サイン波を再生しています（kuromoji解析）",
      "playing",
    );
  } catch (error) {
    playButton.disabled = false;
    setStatus(error instanceof Error ? error.message : "生成に失敗しました", "error");
  }
});

downloadButton.addEventListener("click", async () => {
  try {
    const result = latestResult ?? (await generate());
    const blob = new Blob([result.toWav()], { type: "audio/wav" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "sine-wave-tts.wav";
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
    setStatus("WAVを保存しました", "idle");
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "保存に失敗しました", "error");
  }
});

textInput.addEventListener("input", () => {
  latestResult = null;
  updateCount();
});
speakerSelect.addEventListener("change", () => {
  latestResult = null;
});
emotionSelect.addEventListener("change", () => {
  latestResult = null;
});

new ResizeObserver(() => {
  if (latestResult) drawWaveform(latestResult.pcm);
}).observe(canvas);

updateCount();
