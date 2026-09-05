import test from 'node:test';
import assert from 'node:assert/strict';
import { tryWriteClipboard } from '../lib/reader-clipboard.ts';

test('clipboard success writes the exact original, translation, note and permalink', async () => {
  const text = 'Liv. 37.1.10\nutrum plus regi Antiocho\n패장 한니발\n[각주]\nvicto는 한니발을 수식한다.\n?source=livy&book=37&chapter=1&section=10';
  let received;
  assert.equal(await tryWriteClipboard(text, { async writeText(value) { received = value; } }), true);
  assert.equal(received, text);
});

test('denied clipboard triggers manual-copy fallback without throwing', async () => {
  assert.equal(await tryWriteClipboard('원문', { async writeText() { throw new DOMException('Denied', 'NotAllowedError'); } }), false);
});

test('unavailable clipboard triggers manual-copy fallback', async () => {
  assert.equal(await tryWriteClipboard('원문', undefined), false);
});
