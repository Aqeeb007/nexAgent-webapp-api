// Shared response-size cap so no executor (HTTP fetch, database result set) can
// pull an unbounded amount of data into the tool-calling loop / LLM context.
export const MAX_RESPONSE_BYTES = 256 * 1024;

export async function readWithLimit(
  response: Response,
  maxBytes: number,
): Promise<{ text: string; truncated: boolean }> {
  const reader = response.body?.getReader();

  if (!reader) {
    return { text: await response.text(), truncated: false };
  }

  const decoder = new TextDecoder();
  let received = 0;
  let text = '';

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    received += value.byteLength;

    if (received > maxBytes) {
      await reader.cancel();
      return { text, truncated: true };
    }

    text += decoder.decode(value, { stream: true });
  }

  return { text, truncated: false };
}

// Row-set counterpart for the database executor: truncates once the
// serialized JSON would exceed maxBytes, mirroring readWithLimit's contract.
export function capRows<T>(
  rows: T[],
  maxRows: number,
  maxBytes: number,
): { rows: T[]; truncated: boolean } {
  if (rows.length > maxRows) {
    return { rows: rows.slice(0, maxRows), truncated: true };
  }

  let bytes = 0;
  for (let i = 0; i < rows.length; i++) {
    bytes += Buffer.byteLength(JSON.stringify(rows[i]));

    if (bytes > maxBytes) {
      return { rows: rows.slice(0, i), truncated: true };
    }
  }

  return { rows, truncated: false };
}
