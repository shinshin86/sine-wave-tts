import { resolveServerPort, startApiServer } from "./index.js";

async function main(): Promise<void> {
  const port = resolveServerPort(process.argv.slice(2), process.env.PORT);
  const running = await startApiServer({
    port,
    host: process.env.HOST ?? "127.0.0.1",
    logger: console.log,
  });

  const shutdown = (): void => {
    running.server.close((error) => {
      if (error) {
        console.error("Failed to stop sine-wave-tts", error);
        process.exitCode = 1;
      }
    });
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
