import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { Buffer } from "node:buffer";
import {
  isLanguageAnalyzerLoaded,
  synthesize,
  type SynthesisOptions,
} from "../index.js";
import { getEmotionPreset } from "../presets/emotions.js";
import { getSpeakerPreset } from "../presets/speakers.js";
import {
  findVoiceStyle,
  nativeEmotionList,
  nativeSpeakerList,
  SERVER_VERSION,
  voicevoxSpeakerList,
  type VoiceStyle,
} from "./styles.js";

const MAX_BODY_BYTES = 1_000_000;

class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

interface NativeSynthesisRequest {
  text: string;
  options: SynthesisOptions;
}

interface SineWaveQueryMetadata {
  text: string;
  speaker: string;
  emotion: string;
  styleId: number;
}

interface VoicevoxAudioQuery {
  accent_phrases: unknown[];
  speedScale: number;
  pitchScale: number;
  intonationScale: number;
  volumeScale: number;
  prePhonemeLength: number;
  postPhonemeLength: number;
  outputSamplingRate: number;
  outputStereo: boolean;
  kana: string;
  _sineWaveTts: SineWaveQueryMetadata;
}

function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Accept",
    "Access-Control-Max-Age": "86400",
  };
}

function sendJson(
  response: ServerResponse,
  status: number,
  value: unknown,
): void {
  const body = Buffer.from(JSON.stringify(value));
  response.writeHead(status, {
    ...corsHeaders(),
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": body.byteLength,
  });
  response.end(body);
}

function sendWav(response: ServerResponse, wav: ArrayBuffer): void {
  const body = Buffer.from(wav);
  response.writeHead(200, {
    ...corsHeaders(),
    "Content-Type": "audio/wav",
    "Content-Length": body.byteLength,
  });
  response.end(body);
}

function requireMethod(request: IncomingMessage, method: string): void {
  if (request.method !== method) {
    throw new ApiError(405, `Method ${request.method ?? "UNKNOWN"} is not allowed`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let total = 0;
  let tooLarge = false;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.byteLength;
    if (total > MAX_BODY_BYTES) {
      tooLarge = true;
      continue;
    }
    chunks.push(buffer);
  }

  if (tooLarge) throw new ApiError(413, "Request body is too large");
  if (chunks.length === 0) throw new ApiError(400, "JSON request body is required");

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch {
    throw new ApiError(400, "Request body must be valid JSON");
  }
}

function requiredText(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ApiError(400, '"text" must be a non-empty string');
  }
  if (Array.from(value).length > 5_000) {
    throw new ApiError(400, '"text" must contain at most 5000 characters');
  }
  return value;
}

function optionalPositiveNumber(
  value: unknown,
  name: string,
): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new ApiError(400, `"${name}" must be a positive finite number`);
  }
  return value;
}

function optionalVolume(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > 1
  ) {
    throw new ApiError(400, '"volume" must be between 0 and 1');
  }
  return value;
}

function nativeRequest(value: unknown): NativeSynthesisRequest {
  if (!isRecord(value)) throw new ApiError(400, "Request body must be a JSON object");
  const text = requiredText(value.text);
  const options: SynthesisOptions = {};

  if (value.speaker !== undefined) {
    if (typeof value.speaker !== "string") {
      throw new ApiError(400, '"speaker" must be a preset name');
    }
    try {
      getSpeakerPreset(value.speaker);
    } catch (error) {
      throw new ApiError(400, error instanceof Error ? error.message : "Unknown speaker");
    }
    options.speaker = value.speaker;
  }

  if (value.emotion !== undefined) {
    if (typeof value.emotion !== "string") {
      throw new ApiError(400, '"emotion" must be a preset name');
    }
    try {
      getEmotionPreset(value.emotion);
    } catch (error) {
      throw new ApiError(400, error instanceof Error ? error.message : "Unknown emotion");
    }
    options.emotion = value.emotion as SynthesisOptions["emotion"];
  }

  options.speed = optionalPositiveNumber(value.speed, "speed");
  options.pitch = optionalPositiveNumber(value.pitch, "pitch");
  options.volume = optionalVolume(value.volume);
  return { text, options };
}

function styleFromSearch(url: URL): VoiceStyle {
  const raw = url.searchParams.get("speaker");
  if (raw === null || !/^\d+$/u.test(raw)) {
    throw new ApiError(400, 'Query parameter "speaker" must be a style ID');
  }
  const style = findVoiceStyle(Number(raw));
  if (!style) {
    throw new ApiError(400, `Unknown style ID "${raw}"`);
  }
  return style;
}

function finiteVoicevoxNumber(
  value: unknown,
  name: string,
  defaultValue: number,
): number {
  if (value === undefined) return defaultValue;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new ApiError(400, `"${name}" must be a finite number`);
  }
  return value;
}

function positiveVoicevoxNumber(
  value: unknown,
  name: string,
  defaultValue: number,
): number {
  const result = finiteVoicevoxNumber(value, name, defaultValue);
  if (result <= 0) throw new ApiError(400, `"${name}" must be greater than zero`);
  return result;
}

function createAudioQuery(text: string, style: VoiceStyle): VoicevoxAudioQuery {
  return {
    accent_phrases: [],
    speedScale: 1,
    pitchScale: 0,
    intonationScale: 1,
    volumeScale: 1,
    prePhonemeLength: 0,
    postPhonemeLength: 0,
    outputSamplingRate: 44_100,
    outputStereo: false,
    kana: text,
    _sineWaveTts: {
      text,
      speaker: style.speaker,
      emotion: style.emotion,
      styleId: style.id,
    },
  };
}

function voicevoxSynthesisRequest(
  value: unknown,
  style: VoiceStyle,
): NativeSynthesisRequest {
  if (!isRecord(value)) throw new ApiError(400, "AudioQuery body must be a JSON object");
  const metadata = isRecord(value._sineWaveTts) ? value._sineWaveTts : undefined;
  const text = requiredText(metadata?.text ?? value.kana);
  const speed = positiveVoicevoxNumber(value.speedScale, "speedScale", 1);
  const pitchScale = finiteVoicevoxNumber(value.pitchScale, "pitchScale", 0);
  const pitch = 2 ** pitchScale;
  if (!Number.isFinite(pitch) || pitch <= 0) {
    throw new ApiError(400, '"pitchScale" is outside the supported range');
  }
  const volumeScale = finiteVoicevoxNumber(value.volumeScale, "volumeScale", 1);
  if (volumeScale < 0) {
    throw new ApiError(400, '"volumeScale" must be zero or greater');
  }

  return {
    text,
    options: {
      speaker: style.speaker,
      emotion: style.emotion,
      speed,
      pitch,
      volume: Math.min(1, 0.8 * volumeScale),
    },
  };
}

async function route(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const url = new URL(request.url ?? "/", "http://127.0.0.1");

  if (request.method === "OPTIONS") {
    response.writeHead(204, corsHeaders());
    response.end();
    return;
  }

  if (url.pathname === "/v1/health") {
    requireMethod(request, "GET");
    sendJson(response, 200, {
      status: "ok",
      analyzer: isLanguageAnalyzerLoaded() ? "ready" : "fallback",
    });
    return;
  }

  if (url.pathname === "/v1/speakers") {
    requireMethod(request, "GET");
    sendJson(response, 200, nativeSpeakerList());
    return;
  }

  if (url.pathname === "/v1/emotions") {
    requireMethod(request, "GET");
    sendJson(response, 200, nativeEmotionList());
    return;
  }

  if (url.pathname === "/v1/synthesize") {
    requireMethod(request, "POST");
    const input = nativeRequest(await readJson(request));
    const result = synthesize(input.text, input.options);
    const wav = result.toWav();
    if ((request.headers.accept ?? "").includes("application/json")) {
      sendJson(response, 200, {
        wavBase64: Buffer.from(wav).toString("base64"),
        sampleRate: result.sampleRate,
        durationMs: result.durationMs,
        timings: result.timings,
      });
    } else {
      sendWav(response, wav);
    }
    return;
  }

  if (url.pathname === "/audio_query") {
    requireMethod(request, "POST");
    const style = styleFromSearch(url);
    const text = requiredText(url.searchParams.get("text"));
    sendJson(response, 200, createAudioQuery(text, style));
    return;
  }

  if (url.pathname === "/synthesis") {
    requireMethod(request, "POST");
    const style = styleFromSearch(url);
    const input = voicevoxSynthesisRequest(await readJson(request), style);
    sendWav(response, synthesize(input.text, input.options).toWav());
    return;
  }

  if (url.pathname === "/speakers") {
    requireMethod(request, "GET");
    sendJson(response, 200, voicevoxSpeakerList());
    return;
  }

  if (url.pathname === "/version") {
    requireMethod(request, "GET");
    sendJson(response, 200, SERVER_VERSION);
    return;
  }

  throw new ApiError(404, `Route ${request.method ?? "UNKNOWN"} ${url.pathname} was not found`);
}

export function createApiServer() {
  return createServer((request, response) => {
    void route(request, response).catch((error: unknown) => {
      if (response.headersSent) {
        response.end();
        return;
      }
      if (error instanceof ApiError) {
        sendJson(response, error.status, { error: error.message });
        return;
      }
      console.error("Unhandled sine-wave-tts server error", error);
      sendJson(response, 500, { error: "Internal server error" });
    });
  });
}
