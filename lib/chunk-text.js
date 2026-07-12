// Splits a normalized contract into analysis-sized blocks WITHOUT summarizing,
// so every clause reaches the model verbatim. Chunks are cut on sentence/word
// boundaries (never mid-word) and carry a small overlap so a clause that
// straddles a seam is still seen whole by at least one chunk. Duplicates from
// that overlap are removed later in the reduce step.

// Overall input ceiling (~30k words). compactLeaseText slices to this before
// chunking, so a single huge upload can't fan out into unbounded API calls.
export const MAX_LEASE_CHARS = 120000;

// Target size of a single chunk. Kept comfortably below the model's per-call
// working size so each chunk's JSON output fits inside the 4k output budget.
export const CHUNK_MAX_CHARS = 12000;

// Chars carried back into the next chunk so a clause spanning the seam is fully
// visible in one of them.
export const CHUNK_OVERLAP = 500;

// Hard backstop on chunk count (≈ MAX_LEASE_CHARS / CHUNK_MAX_CHARS + margin).
// With the ceiling above this is never reached in practice; it bounds cost if
// the ceiling is ever raised.
export const MAX_CHUNKS = 12;

/**
 * @param {string} text  Whitespace-normalized contract text.
 * @param {{maxChars?: number, overlap?: number, maxChunks?: number}} [opts]
 * @returns {string[]}   Ordered chunks. Empty input → []; short input → [text].
 */
export function chunkText(text, {
  maxChars = CHUNK_MAX_CHARS,
  overlap = CHUNK_OVERLAP,
  maxChunks = MAX_CHUNKS,
} = {}) {
  const clean = (text || '').trim();
  if (!clean) return [];
  if (clean.length <= maxChars) return [clean];

  const chunks = [];
  // How far back from the hard cut we'll look for a clean boundary.
  const searchWindow = Math.min(1000, Math.floor(maxChars / 4));
  let start = 0;

  while (start < clean.length && chunks.length < maxChunks) {
    let end = Math.min(start + maxChars, clean.length);

    // For any non-final slice, back up to a boundary so we don't cut a clause
    // mid-sentence: prefer a sentence end ("`. `"), else a word boundary.
    if (end < clean.length) {
      const windowStart = end - searchWindow;
      const sentenceBreak = clean.lastIndexOf('. ', end);
      const wordBreak = clean.lastIndexOf(' ', end);
      if (sentenceBreak >= windowStart && sentenceBreak > start) {
        end = sentenceBreak + 1; // keep the period with this chunk
      } else if (wordBreak >= windowStart && wordBreak > start) {
        end = wordBreak;
      }
      // else: no boundary in window — accept the hard cut rather than loop.
    }

    chunks.push(clean.slice(start, end).trim());

    if (end >= clean.length) break;

    // Advance, carrying `overlap` chars back so a clause spanning the seam is
    // fully visible in the next chunk. Snap that start forward to a word
    // boundary so the next chunk never *begins* mid-word either. The slice is
    // always much larger than `overlap`, so start strictly increases.
    let nextStart = end - overlap;
    if (nextStart > start) {
      const wordStart = clean.indexOf(' ', nextStart);
      if (wordStart !== -1 && wordStart < end) nextStart = wordStart + 1;
      start = nextStart;
    } else {
      start = end;
    }
  }

  return chunks;
}
