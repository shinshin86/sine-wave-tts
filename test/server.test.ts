import { Buffer } from "node:buffer";
import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  resolveServerPort,
  startApiServer,
  voiceStyles,
} from "../src/server/index.js";

let server: Server | undefined;
let baseUrl: string;

function expectWav(bytes: Uint8Array): void {
  expect(bytes.byteLength).toBeGreaterThan(44);
  expect(Buffer.from(bytes.subarray(0, 4)).toString("ascii")).toBe("RIFF");
  expect(Buffer.from(bytes.subarray(8, 12)).toString("ascii")).toBe("WAVE");
}

async function nativeSynthesis(
  body: object,
  accept = "audio/wav",
): Promise<Response> {
  return fetch(`${baseUrl}/v1/synthesize`, {
    method: "POST",
    headers: {
      Accept: accept,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

async function openAiSpeech(body: object): Promise<Response> {
  return fetch(`${baseUrl}/v1/audio/speech`, {
    method: "POST",
    headers: {
      Authorization: "Bearer ignored-by-local-server",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

beforeAll(async () => {
  const running = await startApiServer({
    port: 0,
    host: "127.0.0.1",
    logger: () => undefined,
  });
  server = running.server;
  baseUrl = `http://${running.host}:${running.port}`;
});

afterAll(async () => {
  if (!server) return;
  const runningServer = server;
  await new Promise<void>((resolve, reject) => {
    runningServer.close((error) => (error ? reject(error) : resolve()));
  });
});

describe("native HTTP API", () => {
  it("reports health and complete preset catalogs with CORS", async () => {
    const healthResponse = await fetch(`${baseUrl}/v1/health`);
    expect(healthResponse.status).toBe(200);
    expect(healthResponse.headers.get("access-control-allow-origin")).toBe("*");
    expect(await healthResponse.json()).toEqual({
      status: "ok",
      analyzer: "ready",
    });

    const speakers = (await (await fetch(`${baseUrl}/v1/speakers`)).json()) as unknown[];
    const emotions = (await (await fetch(`${baseUrl}/v1/emotions`)).json()) as unknown[];
    expect(speakers).toHaveLength(5);
    expect(emotions).toHaveLength(7);
  });

  it("returns deterministic playable WAV bytes", async () => {
    const request = {
      text: "HTTP APIの決定論を確認します。",
      speaker: "chirpy",
      emotion: "surprise",
      speed: 1.1,
      volume: 0.7,
    };
    const firstResponse = await nativeSynthesis(request);
    const secondResponse = await nativeSynthesis(request);
    expect(firstResponse.status).toBe(200);
    expect(firstResponse.headers.get("content-type")).toBe("audio/wav");
    const first = new Uint8Array(await firstResponse.arrayBuffer());
    const second = new Uint8Array(await secondResponse.arrayBuffer());
    expectWav(first);
    expect(first).toEqual(second);
  });

  it("returns Base64 WAV and timings in JSON mode", async () => {
    const response = await nativeSynthesis(
      { text: "タイミング情報です。", emotion: "calm" },
      "application/json",
    );
    const body = (await response.json()) as {
      wavBase64: string;
      sampleRate: number;
      durationMs: number;
      timings: Array<{ startMs: number; endMs: number }>;
    };
    expect(response.status).toBe(200);
    expect(body.sampleRate).toBe(44_100);
    expect(body.durationMs).toBeGreaterThan(0);
    expect(body.timings.length).toBeGreaterThan(0);
    expect(body.timings[0]?.startMs).toBe(0);
    expectWav(Buffer.from(body.wavBase64, "base64"));
  });

  it("returns useful 400-series errors", async () => {
    const unknown = await nativeSynthesis({
      text: "エラーです。",
      speaker: "missing",
    });
    expect(unknown.status).toBe(400);
    expect(((await unknown.json()) as { error: string }).error).toContain(
      "Available speakers",
    );

    const unknownEmotion = await nativeSynthesis({
      text: "エラーです。",
      emotion: "missing",
    });
    expect(unknownEmotion.status).toBe(400);
    expect(
      ((await unknownEmotion.json()) as { error: string }).error,
    ).toContain("Available emotions");

    const invalidJson = await fetch(`${baseUrl}/v1/synthesize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{",
    });
    expect(invalidJson.status).toBe(400);
    expect(((await invalidJson.json()) as { error: string }).error).toContain(
      "valid JSON",
    );

    const options = await fetch(`${baseUrl}/v1/synthesize`, {
      method: "OPTIONS",
    });
    expect(options.status).toBe(204);
    expect(options.headers.get("access-control-allow-origin")).toBe("*");
  });
});

describe("OpenAI-compatible API", () => {
  it("returns deterministic WAV with the default response format", async () => {
    const request = {
      model: "tts-1",
      input: "OpenAI互換APIの決定論を確認します。",
      voice: "songful:calm",
      speed: 1.1,
    };
    const firstResponse = await openAiSpeech(request);
    const secondResponse = await openAiSpeech(request);
    expect(firstResponse.status).toBe(200);
    expect(firstResponse.headers.get("content-type")).toBe("audio/wav");
    const first = new Uint8Array(await firstResponse.arrayBuffer());
    const second = new Uint8Array(await secondResponse.arrayBuffer());
    expectWav(first);
    expect(first).toEqual(second);
  });

  it("returns raw 44.1 kHz mono 16-bit little-endian PCM", async () => {
    const response = await openAiSpeech({
      model: "tts-1",
      input: "PCM形式です。",
      voice: "robotic",
      response_format: "pcm",
    });
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("audio/pcm");
    expect(bytes.byteLength).toBeGreaterThan(0);
    expect(bytes.byteLength % 2).toBe(0);
    expect(Buffer.from(bytes.subarray(0, 4)).toString("ascii")).not.toBe(
      "RIFF",
    );
  });

  it("returns OpenAI-shaped errors for unsupported formats and voices", async () => {
    const unsupportedFormat = await openAiSpeech({
      model: "tts-1",
      input: "未対応形式です。",
      voice: "default",
      response_format: "mp3",
    });
    expect(unsupportedFormat.status).toBe(400);
    expect(await unsupportedFormat.json()).toEqual({
      error: {
        message: 'Unsupported "response_format". Specify "wav" or "pcm".',
        type: "invalid_request_error",
      },
    });

    const unknownVoice = await openAiSpeech({
      model: "tts-1",
      input: "未知の声です。",
      voice: "missing",
    });
    expect(unknownVoice.status).toBe(400);
    const unknownBody = (await unknownVoice.json()) as {
      error: { message: string; type: string };
    };
    expect(unknownBody.error.type).toBe("invalid_request_error");
    expect(unknownBody.error.message).toContain("Available voices");
    expect(unknownBody.error.message).toContain("speaker:emotion");
  });

  it("rejects speed values outside the OpenAI range", async () => {
    for (const speed of [0.24, 4.01]) {
      const response = await openAiSpeech({
        model: "tts-1",
        input: "速度範囲の確認です。",
        voice: "default",
        speed,
      });
      expect(response.status).toBe(400);
      expect(
        ((await response.json()) as { error: { message: string } }).error
          .message,
      ).toContain("0.25 and 4.0");
    }
  });

  it("lists its OpenAI-compatible model", async () => {
    const response = await fetch(`${baseUrl}/v1/models`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      object: "list",
      data: [
        {
          id: "sine-wave-tts",
          object: "model",
          created: 0,
          owned_by: "sine-wave-tts",
        },
      ],
    });
  });
});

describe("VOICEVOX-compatible API", () => {
  it("exposes deterministic speaker and style IDs", async () => {
    const response = await fetch(`${baseUrl}/speakers`);
    const speakers = (await response.json()) as Array<{
      name: string;
      styles: Array<{ name: string; id: number }>;
    }>;
    expect(speakers).toHaveLength(5);
    expect(speakers.flatMap((speaker) => speaker.styles)).toHaveLength(35);
    expect(speakers[0]?.styles[0]).toEqual({
      name: "neutral",
      id: 0,
      type: "talk",
    });
    expect(new Set(voiceStyles.map((style) => style.id)).size).toBe(35);
    expect(await (await fetch(`${baseUrl}/version`)).json()).toBe("0.1.0");
  });

  it("connects audio_query to synthesis and returns WAV", async () => {
    const style = voiceStyles.find(
      (candidate) =>
        candidate.speaker === "robotic" && candidate.emotion === "angry",
    );
    expect(style).toBeDefined();
    const queryResponse = await fetch(
      `${baseUrl}/audio_query?text=${encodeURIComponent("互換APIの確認です!")}&speaker=${style?.id}`,
      { method: "POST" },
    );
    expect(queryResponse.status).toBe(200);
    const query = (await queryResponse.json()) as Record<string, unknown>;
    query.speedScale = 1.15;
    query.pitchScale = 0.08;
    query.volumeScale = 0.75;

    const synthesisResponse = await fetch(
      `${baseUrl}/synthesis?speaker=${style?.id}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(query),
      },
    );
    expect(synthesisResponse.status).toBe(200);
    expect(synthesisResponse.headers.get("content-type")).toBe("audio/wav");
    expectWav(new Uint8Array(await synthesisResponse.arrayBuffer()));
  });

  it("rejects unknown style IDs", async () => {
    const response = await fetch(
      `${baseUrl}/audio_query?text=test&speaker=9999`,
      { method: "POST" },
    );
    expect(response.status).toBe(400);
    expect(((await response.json()) as { error: string }).error).toContain(
      "Unknown style ID",
    );
  });
});

describe("server CLI configuration", () => {
  it("resolves CLI, environment, and default ports", () => {
    expect(resolveServerPort([], undefined)).toBe(50_021);
    expect(resolveServerPort([], "51000")).toBe(51_000);
    expect(resolveServerPort(["--port", "52000"], "51000")).toBe(52_000);
    expect(resolveServerPort(["--port=53000"], undefined)).toBe(53_000);
    expect(() => resolveServerPort(["--port", "0"], undefined)).toThrow(
      "Invalid port",
    );
  });
});
