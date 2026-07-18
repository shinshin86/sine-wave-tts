function join(...parts: string[]): string {
  const joined = parts
    .filter((part) => part.length > 0)
    .join("/")
    .replace(/\/{2,}/g, "/");
  const normalized = joined.length > 1 ? joined.replace(/\/$/u, "") : joined;

  // Browsers may transparently expand `.gz` responses before kuromoji sees
  // them. The dictionary bytes remain gzipped; only the public URL changes.
  return normalized.replace(/\.gz$/u, ".bin");
}

export { join };
export default { join };
