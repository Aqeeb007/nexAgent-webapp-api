// Bounds a worst-case PDF upload's request time and embedding cost — same
// idiom as src/tools/executors/response-limits.ts's MAX_RESPONSE_BYTES.
export const MAX_PDF_BYTES = 20 * 1024 * 1024; // 20MB

// Applied to the extracted text before chunking, so an unusually
// text-dense PDF can't blow up chunk/embedding count regardless of file
// size. ~250k chars is roughly a 400-500 page book.
export const MAX_EXTRACTED_CHARS = 250_000;
