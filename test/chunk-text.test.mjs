// Unit tests for chunkText — pure function, no server/DB/network needed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  chunkText,
  CHUNK_MAX_CHARS,
  CHUNK_OVERLAP,
  MAX_CHUNKS,
} from '../lib/chunk-text.js';

test('empty or whitespace input returns no chunks', () => {
  assert.deepEqual(chunkText(''), []);
  assert.deepEqual(chunkText('   '), []);
  assert.deepEqual(chunkText(null), []);
  assert.deepEqual(chunkText(undefined), []);
});

test('short input passes through as a single chunk', () => {
  const text = 'The tenant shall pay rent on the first of each month.';
  assert.deepEqual(chunkText(text), [text]);
});

test('input exactly at the limit stays one chunk', () => {
  const text = 'a'.repeat(CHUNK_MAX_CHARS);
  const chunks = chunkText(text);
  assert.equal(chunks.length, 1);
  assert.equal(chunks[0].length, CHUNK_MAX_CHARS);
});

test('long input splits into multiple chunks that cover everything', () => {
  // Build sentences so boundary detection has something to grab.
  const sentence = 'The landlord may enter the premises with proper notice. ';
  const text = sentence.repeat(1000).trim(); // well over one chunk
  const chunks = chunkText(text);

  assert.ok(chunks.length > 1, 'should produce multiple chunks');
  assert.ok(chunks.length <= MAX_CHUNKS, 'never exceeds the chunk cap');

  // No chunk is oversized.
  for (const c of chunks) {
    assert.ok(c.length <= CHUNK_MAX_CHARS, `chunk within ${CHUNK_MAX_CHARS}`);
  }

  // First and last of the source text are present (nothing silently dropped
  // off either end).
  assert.ok(chunks[0].startsWith('The landlord may enter'));
  assert.ok(chunks[chunks.length - 1].endsWith('proper notice.'));
});

test('chunks overlap so a seam-spanning clause survives in one chunk', () => {
  const filler = 'x'.repeat(CHUNK_MAX_CHARS - 200);
  // A distinctive clause placed right around the first seam.
  const clause = ' TENANT WAIVES THE RIGHT TO A JURY TRIAL IN ANY DISPUTE. ';
  const tail = 'y'.repeat(4000);
  const text = filler + clause + tail;

  const chunks = chunkText(text);
  assert.ok(chunks.length >= 2);

  // The clause must appear intact in at least one chunk, not be sliced across
  // the boundary into fragments that neither chunk contains whole.
  const intact = chunks.some((c) => c.includes(clause.trim()));
  assert.ok(intact, 'seam clause should be wholly present in some chunk');
});

test('does not cut words in half at boundaries', () => {
  const word = 'indemnification ';
  const text = word.repeat(2000).trim();
  const chunks = chunkText(text);
  assert.ok(chunks.length > 1);
  // Every chunk should start and end on a whole "indemnification" token
  // (allowing the overlap to begin mid-stream but never mid-word).
  for (const c of chunks) {
    const words = c.split(' ');
    for (const w of words) {
      assert.ok(w === '' || w === 'indemnification', `unexpected fragment: "${w}"`);
    }
  }
});

test('respects a custom maxChunks cap', () => {
  const text = 'The agreement is binding. '.repeat(5000).trim();
  const chunks = chunkText(text, { maxChunks: 3 });
  assert.ok(chunks.length <= 3);
});

test('overlap is bounded and progress is always made', () => {
  // Pathological: no spaces at all, so no boundary can be found.
  const text = 'z'.repeat(CHUNK_MAX_CHARS * 3);
  const chunks = chunkText(text);
  assert.ok(chunks.length >= 3);
  // Overlap means total emitted chars exceed the source, but only modestly.
  const total = chunks.reduce((n, c) => n + c.length, 0);
  assert.ok(total >= text.length, 'covers all source chars');
  assert.ok(total <= text.length + chunks.length * CHUNK_OVERLAP, 'overlap bounded');
});
