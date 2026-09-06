// Plain character-based sliding window — no new dependency, mirrors the
// posture of the tool executors (simplest thing that works at MVP scale).
export function chunkText(
  text: string,
  size = 1500,
  overlap = 200,
): string[] {
  const trimmed = text.trim();

  if (!trimmed) {
    return [];
  }

  const chunks: string[] = [];
  let start = 0;

  while (start < trimmed.length) {
    const end = Math.min(start + size, trimmed.length);
    chunks.push(trimmed.slice(start, end));

    if (end === trimmed.length) {
      break;
    }

    start = end - overlap;
  }

  return chunks;
}
