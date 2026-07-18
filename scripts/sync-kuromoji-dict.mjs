import { copyFile, mkdir, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const source = fileURLToPath(
  new URL("../node_modules/kuromoji/dict/", import.meta.url),
);
const destination = fileURLToPath(
  new URL("../demo/public/dict/", import.meta.url),
);

await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });

const files = await readdir(source);
await Promise.all(
  files.map((file) =>
    copyFile(
      path.join(source, file),
      path.join(destination, file.replace(/\.gz$/u, ".bin")),
    ),
  ),
);

console.log("Synced kuromoji dictionary to demo/public/dict/ as binary assets");
