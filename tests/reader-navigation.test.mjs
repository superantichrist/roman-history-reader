import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  collectSearchResults, findReadingIndex, normalizeSearch, parseSavedPosition,
  readingUrl, resolveReadingTarget, swipeDirection,
} from '../lib/reader-navigation.ts';

const root = fileURLToPath(new URL('../public/data/books/', import.meta.url));
const books = fs.readdirSync(root).flatMap((source) =>
  fs.readdirSync(path.join(root, source)).filter((name) => name.endsWith('.json'))
    .map((name) => JSON.parse(fs.readFileSync(path.join(root, source, name), 'utf8'))));
const polybius = books.find((book) => book.sourceId === 'polybius' && book.book === 1);

test('every published passage can be reopened from its source/book/chapter/section permalink', () => {
  let count = 0;
  for (const book of books) for (const passage of book.passages) {
    const url = readingUrl('https://example.org/roman-history-reader/', {
      sourceId: book.sourceId, book: book.book, chapter: passage.chapter, section: passage.sectionStart,
    });
    const resolved = resolveReadingTarget(book.passages, Object.fromEntries(url.searchParams));
    assert.equal(resolved.passage?.id, passage.id, passage.ref);
    count += 1;
  }
  assert.equal(count, 10295);
});

test('every chapter opens, including chapters beginning inside a joined reading paragraph', () => {
  for (const book of books) for (const chapter of book.chapters) {
    const resolved = resolveReadingTarget(book.passages, { chapter });
    assert.ok(resolved.passage, `${book.sourceId} ${book.book}.${chapter}`);
    assert.equal(resolved.chapter, chapter);
    assert.equal(resolveReadingTarget(book.passages, resolved).passage.id, resolved.passage.id);
  }
  const chapter9 = resolveReadingTarget(polybius.passages, { chapter: '9' });
  assert.equal(chapter9.passage.id, 'polybius-01-8-005-to-9-003');
  assert.equal(chapter9.chapter, '9');
  assert.equal(chapter9.section, '1');
});

test('stale saved IDs fall back to the saved chapter and section', () => {
  assert.equal(resolveReadingTarget(polybius.passages, {
    passageId: 'old-id', chapter: '72', section: '7',
  }).passage.id, 'polybius-01-72-007');
});

test('an invalid section stays in the requested chapter; an empty lost book is supported', () => {
  assert.equal(resolveReadingTarget(polybius.passages, { chapter: '72', section: '999' }).chapter, '72');
  assert.equal(resolveReadingTarget([], { chapter: '1' }).passage, undefined);
});

test('malformed or blocked device preferences do not become navigation targets', () => {
  for (const raw of [null, '{', 'null', '42', '{}', '{"sourceId":"unknown","book":1}', '{"sourceId":"livy","book":1.5}']) {
    assert.equal(parseSavedPosition(raw), undefined);
  }
  assert.equal(parseSavedPosition('{"sourceId":"livy","book":37,"passageId":"livy-37-1-010"}').book, 37);
});

test('a restored paragraph is selected beyond the sticky controls, including fractional CSS pixels', () => {
  const bottoms = [184.28125, 459.15625, 900];
  assert.equal(findReadingIndex(3, (index) => bottoms[index], 188), 1);
  assert.equal(findReadingIndex(3, (index) => bottoms[index], 600), 2);
  assert.equal(findReadingIndex(3, (index) => bottoms[index], 188, true), 2);
  assert.equal(findReadingIndex(0, () => 0, 188), -1);
});

test('scrolling across a very long paragraph keeps that paragraph active', () => {
  const bottoms = [-200, 2200, 2700];
  assert.equal(findReadingIndex(3, (index) => bottoms[index], 270), 1);
});

test('vertical reading gestures, slow text selections and small drags do not turn the book', () => {
  assert.equal(swipeDirection(-130, 400, 300), 0);
  assert.equal(swipeDirection(140, 10, 1500), 0);
  assert.equal(swipeDirection(-30, 0, 100), 0);
  assert.equal(swipeDirection(-150, 15, 300), 1);
  assert.equal(swipeDirection(150, -15, 300), -1);
});

test('Greek accent variants and final sigma are searchable without affecting Korean', () => {
  assert.equal(normalizeSearch('Ῥωμαῖος'), normalizeSearch('ρωμαιοσ'));
  assert.equal(normalizeSearch('카르타고'), normalizeSearch('카르타고'.normalize('NFD')));
  assert.equal(normalizeSearch('로').length, 1, 'Hangul syllables must not count as multiple search characters');
});

test('all-source search includes each matching work and reports the full match count separately', () => {
  const groups = ['livy', 'periochae', 'polybius'].map((source) => Array.from({ length: 100 }, (_, index) => `${source}:${index}`));
  const results = collectSearchResults(groups);
  assert.equal(results.length, 80);
  assert.deepEqual(results.slice(0, 3), ['livy:0', 'periochae:0', 'polybius:0']);
  assert.deepEqual(collectSearchResults([[], ['one'], []]), ['one']);
});

test('reading URLs preserve the project path and drop obsolete anchors or empty sections', () => {
  const url = readingUrl('https://example.org/roman-history-reader/?chapter=3&section=4#old', { sourceId: 'polybius', book: 17 });
  assert.equal(url.pathname, '/roman-history-reader/');
  assert.equal(url.searchParams.has('chapter'), false);
  assert.equal(url.hash, '');
});
