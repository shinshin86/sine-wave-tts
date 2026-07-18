import type { Server } from "node:http";
import { loadKuromojiAnalyzer } from "../core/analyzer.js";
import { createApiServer } from "./api.js";

export interface StartApiServerOptions {
  port?: number;
  host?: string;
  dictionaryPath?: string;
  logger?: (message: string) => void;
}

export interface RunningApiServer {
  server: Server;
  host: string;
  port: number;
  analyzer: "ready" | "fallback";
}

function validPort(value: number, allowZero: boolean): boolean {
  return (
    Number.isSafeInteger(value) &&
    value >= (allowZero ? 0 : 1) &&
    value <= 65_535
  );
}

export function resolveServerPort(
  args: readonly string[],
  environmentPort?: string,
): number {
  let cliPort: string | undefined;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--port") {
      cliPort = args[index + 1];
      if (cliPort === undefined) throw new Error("--port requires a value");
      index += 1;
    } else if (argument?.startsWith("--port=")) {
      cliPort = argument.slice("--port=".length);
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }

  const raw = cliPort ?? environmentPort;
  if (raw === undefined || raw === "") return 50_021;
  if (!/^\d+$/u.test(raw)) throw new Error(`Invalid port: ${raw}`);
  const port = Number(raw);
  if (!validPort(port, false)) throw new Error(`Invalid port: ${raw}`);
  return port;
}

export async function startApiServer(
  options: StartApiServerOptions = {},
): Promise<RunningApiServer> {
  const port = options.port ?? 50_021;
  if (!validPort(port, true)) throw new RangeError(`Invalid port: ${port}`);
  const host = options.host ?? "127.0.0.1";
  const loaded = await loadKuromojiAnalyzer({
    dicPath: options.dictionaryPath ?? "node_modules/kuromoji/dict",
  });
  const analyzer = loaded ? "ready" : "fallback";
  const server = createApiServer();

  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error): void => {
      server.off("listening", onListening);
      reject(error);
    };
    const onListening = (): void => {
      server.off("error", onError);
      resolve();
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port, host);
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    throw new Error("HTTP server did not return a TCP address");
  }
  options.logger?.(
    `sine-wave-tts ready at http://${host}:${address.port} (analyzer: ${analyzer})`,
  );
  return { server, host, port: address.port, analyzer };
}

export { createApiServer } from "./api.js";
export {
  findVoiceStyle,
  nativeEmotionList,
  nativeSpeakerList,
  SERVER_VERSION,
  voiceStyles,
  voicevoxSpeakerList,
} from "./styles.js";
export type {
  VoiceStyle,
  VoicevoxSpeaker,
  VoicevoxStyle,
} from "./styles.js";
