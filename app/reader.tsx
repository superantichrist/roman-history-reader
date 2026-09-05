'use client';

/* oxlint-disable react/react-compiler */

import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  Clipboard,
  FileWarning,
  LibraryBig,
  Menu,
  Search,
  X,
} from 'lucide-react';
import Image from 'next/image';
import { tryWriteClipboard } from '../lib/reader-clipboard';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type TouchEvent,
} from 'react';
import {
  collectSearchResults,
  findReadingIndex,
  isSourceId,
  normalizeSearch,
  parseSavedPosition,
  readingUrl,
  resolveReadingTarget,
  swipeDirection,
  type ReadingPosition,
  type ReadingTarget,
  type SourceId,
} from '../lib/reader-navigation';

type SourceFilter = 'all' | SourceId;
type ViewMode = 'parallel' | 'original' | 'korean';

type TranslationNote = {
  label?: string;
  text: string;
};

type PassageIllustration = {
  src: string;
  alt: string;
  caption: string;
};

type PassageChronology = {
  label: string;
  yearStartBce: number;
  yearEndBce: number;
  certainty: 'exact' | 'range' | 'approximate';
  scope: 'narrative' | 'background' | 'overview' | 'composition' | 'mixed';
  basis: 'editorial';
  sourceIds: string[];
};

type Passage = {
  id: string;
  sourceId: SourceId;
  book: number;
  chapter: string;
  chapterStart?: string;
  chapterEnd?: string;
  chapterRefs?: string[];
  section: string;
  sectionStart: string;
  sectionEnd: string;
  sectionRefs: string[];
  locations?: string[];
  paragraph: number;
  ref: string;
  original: string;
  korean: string;
  notes: TranslationNote[];
  translationStatus: 'untranslated' | 'first-pass' | 'reviewed';
  parallelRefs: string[];
  chronology?: PassageChronology | null;
  illustration?: PassageIllustration;
};

type Volume = {
  sourceId: SourceId;
  book: number;
  bookLabel: string;
  sourceKind: 'full' | 'epitome' | 'fragment' | 'lost';
  preservationLabel: string;
  periodLabel: string;
  chapterCount: number;
  passageCount: number;
  translationCount: number;
  path: string;
};

type Collection = {
  id: SourceId;
  author: string;
  authorKo: string;
  workTitle: string;
  workTitleKo: string;
  language: string;
  languageLabel: string;
  bookCount: number;
  passageCount: number;
  translationCount: number;
  searchPath: string;
  volumes: Volume[];
};

type BookData = Omit<Volume, 'path'> & {
  author: string;
  authorKo: string;
  workTitle: string;
  workTitleKo: string;
  language: string;
  languageLabel: string;
  chapters: string[];
  passages: Passage[];
};

type SearchRow = Pick<
  Passage,
  | 'id'
  | 'book'
  | 'ref'
  | 'chapter'
  | 'section'
  | 'sectionEnd'
  | 'original'
  | 'korean'
>;

type TimelineItem = {
  id: string;
  label: string;
  primary: string[];
  description: string;
};

type SourceRecord = {
  id: string;
  urn: string;
  edition: string;
  url: string;
  sha256: string;
};

export type ReaderManifest = {
  title: string;
  subtitle: string;
  stats: {
    books: number;
    passages: number;
    originalWords: number;
    translatedPassages: number;
  };
  timeline: TimelineItem[];
  chronology: {
    method: string;
    sources: Record<string, { title: string; url: string }>;
  };
  collections: Collection[];
  sources: {
    license: string;
    repositories: Record<string, { url: string; commit: string }>;
    sources: SourceRecord[];
  };
};

const SOURCE_LABELS: Record<SourceId, { short: string; label: string }> = {
  livy: { short: 'LIV', label: '리비우스' },
  periochae: { short: 'PER', label: '페리오카이' },
  polybius: { short: 'POL', label: '폴리비오스' },
};

const STATUS_EXPLANATIONS: Record<BookData['sourceKind'], string> = {
  full: '해당 저작의 본문이 직접 전하는 서술입니다.',
  epitome:
    '소실된 리비우스 본문 자체가 아니라, 후대 요약자가 남긴 권별 개요입니다.',
  fragment:
    '인용과 발췌 등을 통해 일부만 전하는 본문입니다. 빈틈을 임의로 메우지 않았습니다.',
  lost: '이 권의 본문은 현재 전하지 않습니다. 권 번호만 보존 상태와 함께 남겼습니다.',
};

const CHRONOLOGY_SCOPE: Record<PassageChronology['scope'], string> = {
  narrative: '현재 서술',
  background: '회고·배경',
  overview: '기간 개관',
  composition: '저술 시기',
  mixed: '복수 연대',
};

function chronologyTitle(chronology: PassageChronology) {
  if (chronology.scope === 'composition') {
    return '저술 시기 · 추정 범위. 서문이 다루는 사건의 연도가 아니라, 서문 작성 시기에 관한 학계의 견해를 편집 정보로 표시했습니다.';
  }
  const certainty =
    chronology.certainty === 'approximate'
      ? '추정 연대'
      : chronology.certainty === 'range'
        ? '여러 해에 걸친 범위'
        : '사건 연대';
  return `${CHRONOLOGY_SCOPE[chronology.scope]} · ${certainty}. 고대의 사건 순서·집정관·올림피아드 연대를 현대식 기원전 연도로 환산한 편집 정보입니다.`;
}

function volumeKey(sourceId: SourceId, book: number) {
  return `${sourceId}:${book}`;
}

function publicDataUrl(basePath: string, path: string) {
  return `${basePath}/${path}`.replace(/([^:]\/)\/+/g, '$1');
}

function parseTimelineTarget(value: string): { sourceId: SourceId; book: number } {
  const [sourceId, range] = value.split(':') as [SourceId, string];
  return { sourceId, book: Number(range.split('-')[0]) };
}

function readPreference(key: string) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writePreference(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Device preferences are optional; navigation still works through the URL.
  }
}

function ReaderDialog({ label, className, onClose, children }: {
  label: string;
  className: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current!;
    const previousOverflow = document.body.style.overflow;
    const previousScrollY = window.scrollY;
    dialog.showModal();
    document.body.style.overflow = 'hidden';
    return () => {
      dialog.close();
      document.body.style.overflow = previousOverflow;
      window.scrollTo({ top: previousScrollY, behavior: 'instant' });
    };
  }, []);
  useEffect(() => {
    const dialog = dialogRef.current!;
    const dismissBackdrop = (event: MouseEvent) => {
      if (event.target !== dialog) return;
      const rect = dialog.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose();
    };
    dialog.addEventListener('click', dismissBackdrop);
    return () => dialog.removeEventListener('click', dismissBackdrop);
  }, [onClose]);
  return (
    <dialog
      ref={dialogRef}
      className={className}
      aria-label={label}
      onCancel={(event) => { event.preventDefault(); onClose(); }}
    >{children}</dialog>
  );
}

export function RomanHistoryReader({
  initialBook,
  manifest,
  basePath,
}: {
  initialBook: BookData;
  manifest: ReaderManifest;
  basePath: string;
}) {
  const [book, setBook] = useState<BookData>(initialBook);
  const [requestedKey, setRequestedKey] = useState(
    volumeKey(initialBook.sourceId, initialBook.book),
  );
  const [filter, setFilter] = useState<SourceFilter>('all');
  const [tocFilter, setTocFilter] = useState<SourceFilter>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('parallel');
  const [loading, setLoading] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copyFallback, setCopyFallback] = useState('');
  const [activePassage, setActivePassage] = useState(1);
  const [activeChapter, setActiveChapter] = useState(initialBook.passages[0]?.chapter ?? '');
  const [scrollTarget, setScrollTarget] = useState<{ id?: string; sequence: number } | null>(null);
  const [loadError, setLoadError] = useState<ReadingPosition | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [searchTotal, setSearchTotal] = useState(0);
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [searchResults, setSearchResults] = useState<
    Array<SearchRow & { sourceId: SourceId }>
  >([]);
  const bookCache = useRef(
    new Map<string, BookData>([
      [volumeKey(initialBook.sourceId, initialBook.book), initialBook],
    ]),
  );
  const searchCache = useRef(new Map<SourceId, SearchRow[]>());
  const touchStart = useRef<{ x: number; y: number; time: number } | null>(null);
  const lastSavedPosition = useRef<ReadingPosition | null>(null);
  const restoringPosition = useRef(true);
  const scrollSequence = useRef(0);
  const bookRequest = useRef(0);
  const searchRequest = useRef(0);
  const loadedBook = useRef(initialBook);
  const fetchController = useRef<AbortController | null>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const viewportWidth = useRef(0);

  const collections = useMemo(
    () =>
      new Map(manifest.collections.map((collection) => [collection.id, collection])),
    [manifest.collections],
  );
  const allVolumes = useMemo(
    () => manifest.collections.flatMap((collection) => collection.volumes),
    [manifest.collections],
  );
  const visibleVolumes = useMemo(
    () =>
      filter === 'all'
        ? allVolumes
        : collections.get(filter)?.volumes ?? [],
    [allVolumes, collections, filter],
  );
  const tocVolumes = useMemo(
    () => tocFilter === 'all' ? allVolumes : collections.get(tocFilter)?.volumes ?? [],
    [allVolumes, collections, tocFilter],
  );
  const currentCollection = collections.get(book.sourceId)!;
  const currentVolumeIndex = currentCollection.volumes.findIndex(
    (volume) => volume.book === book.book,
  );
  const previousVolume = currentCollection.volumes[currentVolumeIndex - 1];
  const nextVolume = currentCollection.volumes[currentVolumeIndex + 1];
  const progress = Math.min(
    100,
    (activePassage / Math.max(1, book.passageCount)) * 100,
  );
  const activeRow = book.passages[Math.max(0, activePassage - 1)];

  const findVolume = useCallback(
    (sourceId: SourceId, volume: number) =>
      collections
        .get(sourceId)
        ?.volumes.find((candidate) => candidate.book === volume),
    [collections],
  );

  const scrollToPassage = useCallback((targetId?: string) => {
    restoringPosition.current = true;
    setScrollTarget({ id: targetId, sequence: ++scrollSequence.current });
  }, []);

  const saveReadingPosition = useCallback(
    (position: ReadingPosition, historyMode: 'push' | 'replace' = 'replace') => {
      const previous = lastSavedPosition.current;
      const url = readingUrl(window.location.href, position);
      if (url.href !== window.location.href) {
        if (historyMode === 'push') window.history.pushState(window.history.state, '', url);
        else window.history.replaceState(window.history.state, '', url);
      }
      if (JSON.stringify(previous) !== JSON.stringify(position)) {
        lastSavedPosition.current = position;
        writePreference('roma-fontes-position', JSON.stringify(position));
      }
    },
    [],
  );

  const loadBook = useCallback(
    async (sourceId: SourceId, volumeNumber: number, target: ReadingTarget = {}, historyMode: 'push' | 'replace' = 'push') => {
      const volume = findVolume(sourceId, volumeNumber);
      if (!volume) return;
      const key = volumeKey(sourceId, volumeNumber);
      const request = ++bookRequest.current;
      fetchController.current?.abort();
      const controller = new AbortController();
      fetchController.current = controller;
      restoringPosition.current = true;
      setRequestedKey(key);
      setLoading(true);
      setLoadError(null);
      try {
        let nextBook = bookCache.current.get(key);
        if (!nextBook) {
          const response = await fetch(publicDataUrl(basePath, volume.path), {
            cache: 'no-store',
            signal: controller.signal,
          });
          if (!response.ok) throw new Error(`Failed to load ${key}`);
          nextBook = (await response.json()) as BookData;
          if (nextBook.sourceId !== sourceId || nextBook.book !== volumeNumber || !Array.isArray(nextBook.passages)) throw new Error('Invalid volume data');
          bookCache.current.set(key, nextBook);
        }
        if (request !== bookRequest.current) return;
        loadedBook.current = nextBook;
        setBook(nextBook);
        setFilter((current) => current !== 'all' && current !== sourceId ? 'all' : current);
        const { passage, chapter, section } = resolveReadingTarget(nextBook.passages, target);
        setActivePassage(passage?.paragraph ?? 1);
        setActiveChapter(chapter ?? '');
        saveReadingPosition({ sourceId, book: volumeNumber, passageId: passage?.id, chapter, section }, historyMode);
        scrollToPassage(passage?.id);
      } catch {
        if (request !== bookRequest.current) return;
        setRequestedKey(volumeKey(loadedBook.current.sourceId, loadedBook.current.book));
        setFilter((current) => current !== 'all' && current !== loadedBook.current.sourceId ? 'all' : current);
        setLoadError({ sourceId, book: volumeNumber, ...target });
      } finally {
        if (request === bookRequest.current) {
          setLoading(false);
          setMenuOpen(false);
          setSearchOpen(false);
        }
      }
    },
    [basePath, findVolume, saveReadingPosition, scrollToPassage],
  );

  const cancelPendingWork = useCallback(() => {
    ++bookRequest.current;
    fetchController.current?.abort();
    if (copyTimer.current) clearTimeout(copyTimer.current);
  }, []);

  useEffect(() => {
    const savedMode = readPreference('roma-fontes-view') as ViewMode;
    if (['parallel', 'original', 'korean'].includes(savedMode)) {
      setViewMode(savedMode);
    }
    const previousRestoration = window.history.scrollRestoration;
    window.history.scrollRestoration = 'manual';
    const restore = (useSaved: boolean) => {
      const url = new URL(window.location.href);
      const sourceId = url.searchParams.get('source');
      const volume = Number(url.searchParams.get('book'));
      if (isSourceId(sourceId) && findVolume(sourceId, volume)) {
        void loadBook(sourceId, volume, {
          chapter: url.searchParams.get('chapter') ?? undefined,
          section: url.searchParams.get('section') ?? undefined,
        }, 'replace');
        return;
      }
      const saved = useSaved ? parseSavedPosition(readPreference('roma-fontes-position')) : undefined;
      if (saved && findVolume(saved.sourceId, saved.book)) {
        void loadBook(saved.sourceId, saved.book, saved, 'replace');
      } else {
        void loadBook(initialBook.sourceId, initialBook.book, {}, 'replace');
      }
    };
    restore(true);
    const onPopState = () => restore(false);
    window.addEventListener('popstate', onPopState);
    return () => {
      window.removeEventListener('popstate', onPopState);
      window.history.scrollRestoration = previousRestoration;
      cancelPendingWork();
    };
  }, [cancelPendingWork, findVolume, initialBook, loadBook]);

  useEffect(() => {
    const shell = document.querySelector<HTMLElement>('.reader-shell')!;
    const sizes = [['.site-header', '--header-height'], ['.source-strip', '--source-height'], ['.reader-toolbar', '--toolbar-height']] as const;
    const measure = () => sizes.forEach(([selector, property]) => {
      const element = document.querySelector(selector);
      if (element) shell.style.setProperty(property, `${element.getBoundingClientRect().height}px`);
    });
    const observer = new ResizeObserver(measure);
    sizes.forEach(([selector]) => observer.observe(document.querySelector(selector)!));
    measure();
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!scrollTarget) return;
    let frame = window.requestAnimationFrame(() => {
      const target = scrollTarget.id ? document.getElementById(`passage-${scrollTarget.id}`) : null;
      if (target) target.scrollIntoView({ block: 'start', behavior: 'instant' });
      else window.scrollTo({ top: 0, behavior: 'instant' });
      frame = window.requestAnimationFrame(() => { restoringPosition.current = false; });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [scrollTarget, viewMode]);

  useEffect(() => {
    const nodes = Array.from(document.querySelectorAll<HTMLElement>('[data-passage]'));
    if (!viewportWidth.current) viewportWidth.current = window.innerWidth;
    let frame = 0;
    const updatePosition = () => {
      frame = 0;
      if (viewportWidth.current !== window.innerWidth) {
        viewportWidth.current = window.innerWidth;
        if (!loading && !loadError) scrollToPassage(lastSavedPosition.current?.passageId);
        return;
      }
      if (restoringPosition.current || loading || loadError || menuOpen || sourcesOpen || searchOpen || copyFallback) return;
      const top = Math.max(...['.site-header', '.source-strip', '.reader-toolbar'].map((selector) => document.querySelector(selector)?.getBoundingClientRect().bottom ?? 0));
      // Read just inside the restored passage, beyond its 10px scroll margin.
      // Fractional CSS pixels at browser zoom must not select the previous row.
      const readingLine = Math.min(window.innerHeight - 32, top + 14);
      const atEnd = window.scrollY > 0 && window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2;
      const index = findReadingIndex(nodes.length, (i) => nodes[i].getBoundingClientRect().bottom, readingLine, atEnd);
      const passage = book.passages[index];
      if (!passage || lastSavedPosition.current?.passageId === passage.id) return;
      setActivePassage(passage.paragraph);
      setActiveChapter(passage.chapter);
      saveReadingPosition({ sourceId: book.sourceId, book: book.book, passageId: passage.id, chapter: passage.chapter, section: passage.sectionStart });
    };
    const schedule = () => { if (!frame) frame = window.requestAnimationFrame(updatePosition); };
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    window.addEventListener('pagehide', updatePosition);
    const observer = new ResizeObserver(schedule);
    const list = document.querySelector('.passage-list');
    if (list) observer.observe(list);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      window.removeEventListener('pagehide', updatePosition);
      observer.disconnect();
    };
  }, [book, loading, loadError, menuOpen, sourcesOpen, searchOpen, copyFallback, saveReadingPosition, scrollToPassage]);

  const chooseFilter = (nextFilter: SourceFilter) => {
    setFilter(nextFilter);
    if (nextFilter !== 'all' && nextFilter !== book.sourceId) {
      const first = collections.get(nextFilter)?.volumes[0];
      if (first) void loadBook(nextFilter, first.book);
    }
  };

  const changeView = (nextMode: ViewMode) => {
    if (nextMode === viewMode) return;
    scrollToPassage(activeRow?.id);
    setViewMode(nextMode);
    writePreference('roma-fontes-view', nextMode);
  };

  const copyPassage = async (passage: Passage) => {
    const url = new URL(window.location.href);
    url.searchParams.set('source', passage.sourceId);
    url.searchParams.set('book', String(passage.book));
    url.searchParams.set('chapter', passage.chapter);
    url.searchParams.set('section', passage.sectionStart);
    const parts = [
      `${currentCollection.authorKo} 《${currentCollection.workTitleKo}》 ${passage.ref}${passage.chronology ? ` · ${passage.chronology.label}` : ''}`,
      '',
      passage.original,
    ];
    if (passage.korean) parts.push('', passage.korean);
    if (passage.notes.length) {
      parts.push('', '[각주]', ...passage.notes.map((note, index) => `${note.label ?? index + 1}. ${note.text}`));
    }
    parts.push('', url.toString());
    const text = parts.join('\n');
    if (await tryWriteClipboard(text, navigator.clipboard)) {
      setCopiedId(passage.id);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopiedId(null), 1400);
    } else {
      setCopyFallback(text);
    }
  };

  const runSearch = async () => {
    const request = ++searchRequest.current;
    const query = normalizeSearch(searchQuery);
    setSubmittedQuery(searchQuery.trim());
    setSearchOpen(true);
    setSearchResults([]);
    setSearchTotal(0);
    if (query.length < 2) {
      setSearching(false);
      setSearchError('검색어를 두 글자 이상 입력해 주세요.');
      return;
    }
    setSearching(true);
    setSearchError('');
    try {
      const ids: SourceId[] =
        filter === 'all' ? ['livy', 'periochae', 'polybius'] : [filter];
      const rows = await Promise.all(
        ids.map(async (sourceId) => {
          let index = searchCache.current.get(sourceId);
          if (!index) {
            const collection = collections.get(sourceId)!;
            const response = await fetch(
              publicDataUrl(basePath, collection.searchPath),
              { cache: 'no-store' },
            );
            if (!response.ok) throw new Error(`Search index ${sourceId} failed`);
            index = (await response.json()) as SearchRow[];
            searchCache.current.set(sourceId, index);
          }
          return index
            .filter((row) =>
              normalizeSearch(`${row.original} ${row.korean} ${row.ref}`).includes(query),
            )
            .map((row) => ({ ...row, sourceId }));
        }),
      );
      if (request !== searchRequest.current) return;
      setSearchTotal(rows.reduce((total, group) => total + group.length, 0));
      setSearchResults(collectSearchResults(rows));
    } catch {
      if (request !== searchRequest.current) return;
      setSearchResults([]);
      setSearchError('검색 색인을 불러오지 못했습니다. 잠시 뒤 다시 시도해 주세요.');
    } finally {
      if (request === searchRequest.current) setSearching(false);
    }
  };

  const goToChapter = (chapter: string) => {
    const { passage, section } = resolveReadingTarget(book.passages, { chapter });
    if (!passage) return;
    setActivePassage(passage.paragraph);
    setActiveChapter(chapter);
    saveReadingPosition({ sourceId: book.sourceId, book: book.book, passageId: passage.id, chapter, section }, 'push');
    scrollToPassage(passage.id);
  };

  const moveFromSearch = (result: SearchRow & { sourceId: SourceId }) => {
    void loadBook(result.sourceId, result.book, { passageId: result.id });
  };

  const goToTimeline = (value: string) => {
    const target = parseTimelineTarget(value);
    setFilter('all');
    void loadBook(target.sourceId, target.book);
  };

  const onTouchStart = (event: TouchEvent<HTMLElement>) => {
    const target = event.target as HTMLElement;
    if (loading || event.touches.length !== 1 || target.closest('button, a, input, select, textarea, .mobile-timeline, .reader-toolbar') || window.getSelection()?.toString()) {
      touchStart.current = null;
      return;
    }
    touchStart.current = { x: event.touches[0].clientX, y: event.touches[0].clientY, time: Date.now() };
  };

  const onTouchEnd = (event: TouchEvent<HTMLElement>) => {
    const start = touchStart.current;
    touchStart.current = null;
    const end = event.changedTouches[0];
    if (!start || !end || event.touches.length || window.getSelection()?.toString()) return;
    const direction = swipeDirection(end.clientX - start.x, end.clientY - start.y, Date.now() - start.time);
    if (!direction) return;
    const target = direction > 0 ? nextVolume : previousVolume;
    if (target) void loadBook(book.sourceId, target.book);
  };

  const openContents = () => {
    setTocFilter(filter);
    setMenuOpen(true);
  };

  const timeline = (
    <nav className="timeline-list" aria-label="연대별 사료 지도">
      {manifest.timeline.map((item) => (
        <section className="timeline-entry" key={item.id}>
          <span>{item.label}</span>
          <strong>{item.description}</strong>
          <div className="timeline-targets">
            {item.primary.map((target) => {
                const parsed = parseTimelineTarget(target);
                return (
                  <button type="button" key={target} onClick={() => goToTimeline(target)}>
                    {SOURCE_LABELS[parsed.sourceId].short} {target.split(':')[1]}
                  </button>
                );
              })}
          </div>
        </section>
      ))}
    </nav>
  );

  return (
    <div className="reader-shell">
      <div className="reading-progress" style={{ width: `${progress}%` }} />
      <header className="site-header">
        <a className="brand" href={`${basePath || '/'}?source=${initialBook.sourceId}&book=${initialBook.book}`} aria-label="처음으로" onClick={(event) => {
          if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
          event.preventDefault();
          setFilter('all');
          void loadBook(initialBook.sourceId, initialBook.book);
        }}>
          <span className="brand-seal" aria-hidden="true">SPQR</span>
          <span>
            <strong>ROMA · FONTES</strong>
            <small>로마사 원전 읽기</small>
          </span>
        </a>

        <form className="header-search" aria-label="전체 본문 검색" onSubmit={(event) => { event.preventDefault(); void runSearch(); }}>
          <Search aria-hidden="true" />
          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="라틴어·그리스어·한국어 검색"
            aria-label="전체 본문 검색"
          />
          <button type="submit">검색</button>
        </form>

        <div className="header-actions">
          <button type="button" className="source-button" aria-label="판본" onClick={() => setSourcesOpen(true)}>
            <LibraryBig /> <span>판본</span>
          </button>
          <button type="button" className="menu-button" aria-label="목차" onClick={openContents}>
            <Menu /> <span>목차</span>
          </button>
        </div>
      </header>

      <nav className="source-strip" aria-label="저작 선택">
        {(
          [
            ['all', '전체'],
            ['livy', '리비우스'],
            ['periochae', '페리오카이'],
            ['polybius', '폴리비오스'],
          ] as Array<[SourceFilter, string]>
        ).map(([id, label]) => (
          <button
            type="button"
            key={id}
            data-active={filter === id}
            onClick={() => chooseFilter(id)}
          >
            {label}
          </button>
        ))}
        <span className="corpus-count">
          {manifest.stats.books}권 · {manifest.stats.passages.toLocaleString()}단락
        </span>
      </nav>

      <div className="reader-layout">
        <aside className="desktop-timeline">
          <div className="aside-heading">
            <span>ANNALES</span>
            <h2>연대와 사료</h2>
          </div>
          {timeline}
          <p className="method-note">
            소실된 리비우스는 요약과 병행 사료로 읽되, 어느 텍스트도 리비우스의 복원문으로 꾸미지 않습니다.
          </p>
        </aside>

        <main
          className="reading-main"
          aria-busy={loading}
          data-active-passage={activeRow?.id}
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
          onTouchCancel={() => { touchStart.current = null; }}
        >
          <div className="mobile-timeline">{timeline}</div>

          <section className="reader-toolbar" aria-label="읽기 설정">
            <div className="location-selects">
              <label className="volume-select">
                <span className="sr-only">권 선택</span>
                <select
                  aria-label="권 선택"
                  value={requestedKey}
                  onChange={(event) => {
                    const [sourceId, volume] = event.target.value.split(':') as [SourceId, string];
                    void loadBook(sourceId, Number(volume));
                  }}
                >
                  {visibleVolumes.map((volume) => (
                    <option key={volumeKey(volume.sourceId, volume.book)} value={volumeKey(volume.sourceId, volume.book)}>
                      {SOURCE_LABELS[volume.sourceId].label} · 제{volume.book}권 · {volume.preservationLabel}
                    </option>
                  ))}
                </select>
              </label>
              {book.chapters.length > 1 && (
                <label className="chapter-select">
                  <span className="sr-only">장 선택</span>
                  <select aria-label="장 선택" value={activeChapter || book.chapters[0]} disabled={loading} onChange={(event) => goToChapter(event.target.value)}>
                    {book.chapters.map((chapter) => (
                      <option key={chapter} value={chapter}>
                        {chapter === 'pr' ? '서문' : chapter === 'per' ? '요약' : `제${chapter}장`}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>

            <div className="view-switch" aria-label="표시 방식">
              {(
                [
                  ['parallel', '나란히'],
                  ['original', '원문'],
                  ['korean', '직역'],
                ] as Array<[ViewMode, string]>
              ).map(([mode, label]) => (
                <button
                  type="button"
                  key={mode}
                  data-active={viewMode === mode}
                  aria-pressed={viewMode === mode}
                  disabled={loading}
                  onClick={() => changeView(mode)}
                >
                  {label}
                </button>
              ))}
            </div>
          </section>

          {loading && <output className="reader-notice">본문을 불러오는 중…</output>}
          {loadError && <div className="reader-notice load-error" role="alert">
            <span>{SOURCE_LABELS[loadError.sourceId].label} 제{loadError.book}권을 불러오지 못했습니다. 연결을 확인하고 다시 시도해 주세요.</span>
            <button type="button" onClick={() => void loadBook(loadError.sourceId, loadError.book, loadError)}>다시 시도</button>
          </div>}

          <header className="book-heading">
            <div>
              <p className="eyebrow">
                {currentCollection.author.toUpperCase()} · {currentCollection.workTitle}
              </p>
              <h1>{currentCollection.workTitleKo} <span>제{book.book}권</span></h1>
              <p>{book.periodLabel} · {book.languageLabel} · {book.passageCount.toLocaleString()}개 읽기 단락</p>
            </div>
            <span className={`preservation-badge ${book.sourceKind}`}>
              {book.preservationLabel}
            </span>
          </header>

          <aside className={`preservation-note ${book.sourceKind}`}>
            <FileWarning aria-hidden="true" />
            <p><strong>{book.preservationLabel}</strong>{STATUS_EXPLANATIONS[book.sourceKind]}{book.sourceId === 'periochae' && ' 절 번호는 이 독서판에서 라틴어 문장을 나눈 번호입니다.'}</p>
          </aside>

          {book.passages.length === 0 ? (
            <section className="lost-volume">
              <span>LIBER XVII</span>
              <h2>본문이 전하지 않습니다</h2>
              <p>폴리비오스 《역사》 17권에 배정할 수 있는 연속 본문은 현전하지 않습니다. 다음 권의 단편으로 이동할 수 있습니다.</p>
            </section>
          ) : (
            <div className="passage-list" data-view={viewMode}>
              {book.passages.map((passage) => (
                <article
                  className="passage"
                  id={`passage-${passage.id}`}
                  key={passage.id}
                  data-passage
                  data-passage-id={passage.id}
                  data-paragraph={passage.paragraph}
                >
                  <header className="passage-meta">
                    <div className="passage-source">
                      <a
                        href={`?source=${passage.sourceId}&book=${passage.book}&chapter=${encodeURIComponent(passage.chapter)}&section=${encodeURIComponent(passage.sectionStart)}`}
                        aria-label={`${passage.ref} 영구 링크`}
                      >
                        {passage.ref}
                      </a>
                      {passage.chronology && (
                        <span
                          className="chronology-badge"
                          data-scope={passage.chronology.scope}
                          title={chronologyTitle(passage.chronology)}
                          aria-label={`편집 연대 ${passage.chronology.label}, ${CHRONOLOGY_SCOPE[passage.chronology.scope]}`}
                        >
                          {passage.chronology.scope === 'narrative'
                            ? passage.chronology.label
                            : `${CHRONOLOGY_SCOPE[passage.chronology.scope]} · ${passage.chronology.label}`}
                        </span>
                      )}
                    </div>
                    <span>읽기 단락 {passage.paragraph}</span>
                    <button
                      type="button"
                      onClick={() => void copyPassage(passage)}
                      aria-label={`${passage.ref} 원문과 직역 복사`}
                    >
                      {copiedId === passage.id ? <Check /> : <Clipboard />}
                      {copiedId === passage.id ? '복사됨' : '원문 포함 복사'}
                    </button>
                  </header>

                  <div className="passage-columns">
                    <div className="original-column" lang={book.language}>
                      <span className="column-label">{book.languageLabel} 원문</span>
                      <p>{passage.original}</p>
                    </div>
                    <div className="korean-column" lang="ko">
                      <span className="column-label">한국어 직역</span>
                      {passage.korean ? (
                        <p>{passage.korean}</p>
                      ) : (
                        <p className="translation-pending">
                          직역 준비 중
                          <small>원문은 먼저 전권 공개했으며, 한국어는 직접 옮겨 순차적으로 덧붙입니다.</small>
                        </p>
                      )}
                      {passage.notes.length > 0 && (
                        <ol className="translation-notes" aria-label="번역 각주">
                          {passage.notes.map((note, index) => (
                            <li key={`${passage.id}-note-${index}`}>
                              <span>{note.label ?? index + 1}</span>{note.text}
                            </li>
                          ))}
                        </ol>
                      )}
                    </div>
                  </div>
                  {passage.illustration && (
                    <figure className="passage-illustration">
                      <Image
                        src={publicDataUrl(basePath, passage.illustration.src)}
                        alt={passage.illustration.alt}
                        width={1536}
                        height={1024}
                        unoptimized
                        loading="lazy"
                      />
                      <figcaption>
                        <strong>장면 재구성</strong>
                        <span>{passage.illustration.caption}</span>
                        <small>본문의 공간 관계를 이해하기 위한 생성 이미지이며 정밀한 고고학 복원도는 아닙니다.</small>
                      </figcaption>
                    </figure>
                  )}
                </article>
              ))}
            </div>
          )}

          <nav className="volume-navigation" aria-label="앞뒤 권">
            <button
              type="button"
              disabled={!previousVolume || loading}
              onClick={() => previousVolume && void loadBook(book.sourceId, previousVolume.book)}
            >
              <ChevronLeft />
              <span><small>이전 권</small>{previousVolume ? `제${previousVolume.book}권` : '처음'}</span>
            </button>
            <span>{currentVolumeIndex + 1} / {currentCollection.volumes.length}</span>
            <button
              type="button"
              disabled={!nextVolume || loading}
              onClick={() => nextVolume && void loadBook(book.sourceId, nextVolume.book)}
            >
              <span><small>다음 권</small>{nextVolume ? `제${nextVolume.book}권` : '끝'}</span>
              <ChevronRight />
            </button>
          </nav>
          <p className="swipe-hint">모바일에서는 본문을 좌우로 밀어 앞뒤 권으로 이동할 수 있습니다.</p>
        </main>
      </div>

      {menuOpen && (
          <ReaderDialog className="drawer toc-drawer" label="전체 목차" onClose={() => setMenuOpen(false)}>
            <header><div><span>INDEX LIBRORUM</span><h2>전체 목차</h2></div><button type="button" onClick={() => setMenuOpen(false)} aria-label="닫기"><X /></button></header>
            <div className="drawer-filters">
              {(['all', 'livy', 'periochae', 'polybius'] as SourceFilter[]).map((id) => (
                <button type="button" key={id} data-active={tocFilter === id} aria-pressed={tocFilter === id} onClick={() => setTocFilter(id)}>
                  {id === 'all' ? '전체' : SOURCE_LABELS[id].label}
                </button>
              ))}
            </div>
            <div className="volume-grid">
              {tocVolumes.map((volume) => (
                <button
                  type="button"
                  key={volumeKey(volume.sourceId, volume.book)}
                  data-active={requestedKey === volumeKey(volume.sourceId, volume.book)}
                  onClick={() => void loadBook(volume.sourceId, volume.book)}
                >
                  <span>{SOURCE_LABELS[volume.sourceId].short}</span>
                  <strong>제{volume.book}권</strong>
                  <small>{volume.periodLabel}</small>
                  <em>{volume.preservationLabel} · {volume.passageCount}단락</em>
                </button>
              ))}
            </div>
          </ReaderDialog>
      )}

      {sourcesOpen && (
          <ReaderDialog className="drawer sources-drawer" label="판본과 원문 출처" onClose={() => setSourcesOpen(false)}>
            <header><div><span>FONTES</span><h2>판본과 원문 출처</h2></div><button type="button" onClick={() => setSourcesOpen(false)} aria-label="닫기"><X /></button></header>
            <p className="source-intro">원문은 고정된 공개 학술 데이터의 커밋과 해시를 기록해 재현할 수 있게 했습니다. 번역은 이 프로젝트에서 원문으로부터 직접 작성합니다.</p>
            <div className="source-cards">
              {manifest.sources.sources
                .map((source) => (
                  <article key={source.id}>
                    <span>{source.id}</span>
                    <h3>{source.edition}</h3>
                    <code>{source.urn}</code>
                    <small>SHA-256 {source.sha256.slice(0, 18)}…</small>
                    <a href={source.url} target="_blank" rel="noreferrer">원문 파일 열기 <ArrowRight /></a>
                  </article>
                ))}
            </div>
            <h3 className="source-subheading">연대 환산 근거</h3>
            <p className="source-intro chronology-method">{manifest.chronology.method}</p>
            <div className="source-cards chronology-sources">
              {Object.entries(manifest.chronology.sources).map(([id, source]) => (
                <article key={id}>
                  <span>{id}</span>
                  <h3>{source.title}</h3>
                  <a href={source.url} target="_blank" rel="noreferrer">대조 자료 열기 <ArrowRight /></a>
                </article>
              ))}
            </div>
          </ReaderDialog>
      )}

      {searchOpen && (
          <ReaderDialog className="search-dialog" label="검색 결과" onClose={() => setSearchOpen(false)}>
            <header>
              <div><span>QUAERE</span><h2>“{submittedQuery}” 검색</h2></div>
              <button type="button" onClick={() => setSearchOpen(false)} aria-label="닫기"><X /></button>
            </header>
            <output className="search-summary">{searching ? '색인을 불러오는 중…' : searchError || `${searchTotal.toLocaleString()}개 결과${searchTotal > searchResults.length ? ` 중 ${searchResults.length}개 표시 · 저작을 선택하면 범위를 좁힐 수 있습니다.` : ''}`}</output>
            <div className="search-results">
              {!searching && searchResults.map((result) => (
                <button type="button" key={`${result.sourceId}-${result.id}`} onClick={() => moveFromSearch(result)}>
                  <span>{SOURCE_LABELS[result.sourceId].label} · {result.ref}</span>
                  <p>{result.korean || result.original}</p>
                  <ArrowRight />
                </button>
              ))}
              {!searching && !searchError && searchResults.length === 0 && <p className="empty-search">검색 결과가 없습니다.</p>}
            </div>
          </ReaderDialog>
      )}

      {copyFallback && <ReaderDialog className="search-dialog copy-dialog" label="원문과 직역 복사" onClose={() => setCopyFallback('')}>
        <header><h2>원문과 직역 복사</h2><button type="button" onClick={() => setCopyFallback('')} aria-label="닫기"><X /></button></header>
        <p className="source-intro">자동 복사가 허용되지 않았습니다. 아래 내용을 선택해 복사해 주세요.</p>
        <textarea aria-label="복사할 원문과 직역" readOnly value={copyFallback} onFocus={(event) => event.currentTarget.select()} />
      </ReaderDialog>}

      <div className="mobile-book-nav" aria-label="모바일 앞뒤 권">
        <button type="button" disabled={!previousVolume || loading} onClick={() => previousVolume && void loadBook(book.sourceId, previousVolume.book)}><ArrowLeft /> 이전</button>
        <button type="button" onClick={openContents}><BookOpen /> 목차</button>
        <button type="button" disabled={!nextVolume || loading} onClick={() => nextVolume && void loadBook(book.sourceId, nextVolume.book)}>다음 <ArrowRight /></button>
      </div>
    </div>
  );
}
