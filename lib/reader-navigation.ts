export type SourceId = 'livy' | 'periochae' | 'polybius';
export type ReadingTarget = {
  passageId?: string;
  chapter?: string;
  section?: string;
};
export type ReadingPosition = ReadingTarget & { sourceId: SourceId; book: number };

type LocatedPassage = {
  id: string;
  chapter: string;
  sectionStart: string;
  sectionRefs: string[];
  chapterRefs?: string[];
  locations?: string[];
};

export function isSourceId(value: unknown): value is SourceId {
  return value === 'livy' || value === 'periochae' || value === 'polybius';
}

export function parseSavedPosition(raw: string | null): ReadingPosition | undefined {
  if (!raw) return;
  try {
    const value = JSON.parse(raw);
    if (!value || !isSourceId(value.sourceId) || !Number.isInteger(value.book) || value.book < 1) return;
    return {
      sourceId: value.sourceId,
      book: value.book,
      passageId: typeof value.passageId === 'string' ? value.passageId : undefined,
      chapter: typeof value.chapter === 'string' ? value.chapter : undefined,
      section: typeof value.section === 'string' ? value.section : undefined,
    };
  } catch {
    return;
  }
}

export function resolveReadingTarget<T extends LocatedPassage>(passages: T[], target: ReadingTarget = {}) {
  const atChapter = (passage: T) =>
    (passage.chapterRefs ?? [passage.chapter]).includes(target.chapter ?? '');
  const atSection = (passage: T) => target.chapter && target.section && (
    passage.locations
      ? passage.locations.includes(`${target.chapter}.${target.section}`)
      : passage.chapter === target.chapter && passage.sectionRefs.includes(target.section)
  );
  const passage = (target.passageId && passages.find((row) => row.id === target.passageId)) ||
    passages.find(atSection) || passages.find(atChapter) || passages[0];
  if (!passage) return { passage: undefined, chapter: undefined, section: undefined };

  // A reading paragraph can span chapters. Keep the requested chapter in the
  // selector and permalink while opening the complete, unbroken paragraph.
  const chapter = atChapter(passage) ? target.chapter! : passage.chapter;
  const section = atSection(passage)
    ? target.section!
    : passage.locations?.find((location) => location.startsWith(`${chapter}.`))?.slice(chapter.length + 1) ?? passage.sectionStart;
  return { passage, chapter, section };
}

export function readingUrl(href: string, position: ReadingPosition) {
  const url = new URL(href);
  url.searchParams.set('source', position.sourceId);
  url.searchParams.set('book', String(position.book));
  for (const key of ['chapter', 'section'] as const) {
    if (position[key]) url.searchParams.set(key, position[key]);
    else url.searchParams.delete(key);
  }
  url.hash = '';
  return url;
}

export function findReadingIndex(count: number, bottomAt: (index: number) => number, readingLine: number, atEnd = false) {
  if (!count) return -1;
  if (atEnd) return count - 1;
  let low = 0;
  let high = count - 1;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (bottomAt(middle) <= readingLine) low = middle + 1;
    else high = middle;
  }
  return low;
}

export function swipeDirection(dx: number, dy: number, elapsedMs: number) {
  if (Math.abs(dx) < 90 || Math.abs(dx) < Math.abs(dy) * 1.8 || elapsedMs > 700) return 0;
  return dx < 0 ? 1 : -1;
}

export function normalizeSearch(value: string) {
  return value.normalize('NFD').replace(/\p{M}/gu, '').normalize('NFC').toLocaleLowerCase().replace(/ς/g, 'σ').replace(/\s+/g, ' ').trim();
}

export function collectSearchResults<T>(groups: T[][], limit = 80) {
  const results: T[] = [];
  for (let index = 0; results.length < limit; index += 1) {
    let found = false;
    for (const group of groups) {
      if (index < group.length) {
        results.push(group[index]);
        found = true;
        if (results.length === limit) break;
      }
    }
    if (!found) break;
  }
  return results;
}
