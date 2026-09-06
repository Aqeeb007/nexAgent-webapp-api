import { chunkText } from './chunk-text';

describe('chunkText', () => {
  it('returns an empty array for empty or whitespace-only input', () => {
    expect(chunkText('')).toEqual([]);
    expect(chunkText('   \n  ')).toEqual([]);
  });

  it('returns a single chunk when the text fits within one window', () => {
    expect(chunkText('hello world', 1500, 200)).toEqual(['hello world']);
  });

  it('splits long text into overlapping windows', () => {
    const text = 'a'.repeat(2000);

    const chunks = chunkText(text, 1500, 200);

    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toHaveLength(1500);
    // The second chunk starts 200 chars before the first chunk ended.
    expect(chunks[1]).toHaveLength(700);
  });

  it('always makes forward progress and terminates', () => {
    const text = 'b'.repeat(5000);

    const chunks = chunkText(text, 1500, 200);

    expect(chunks.join('').length).toBeGreaterThanOrEqual(text.length);
    expect(chunks.length).toBeGreaterThan(1);
  });
});
