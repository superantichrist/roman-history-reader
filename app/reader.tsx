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
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type TouchEvent,
} from 'react';

type SourceId = 'livy' | 'periochae' | 'polybius';
type SourceFilter = 'all' | SourceId;
type ViewMode = 'parallel' | 'original' | 'korean';

type TranslationNote = {
  label?: string;
  text: string;
};

type Passage = {
  id: string;
  sourceId: SourceId;
  book: number;
  chapter: string;
  section: string;
  sectionStart: string;
  sectionEnd: string;
  sectionRefs: string[];
  paragraph: number;
  ref: string;
  original: string;
  korean: string;
  notes: TranslationNote[];
  translationStatus: 'untranslated' | 'first-pass' | 'reviewed';
  parallelRefs: string[];
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
  const [viewMode, setViewMode] = useState<ViewMode>('parallel');
  const [loading, setLoading] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [activePassage, setActivePassage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<
    Array<SearchRow & { sourceId: SourceId }>
  >([]);
  const bookCache = useRef(
    new Map<string, BookData>([
      [volumeKey(initialBook.sourceId, initialBook.book), initialBook],
    ]),
  );
  const searchCache = useRef(new Map<SourceId, SearchRow[]>());
  const touchStartX = useRef<number | null>(null);

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

  const findVolume = useCallback(
    (sourceId: SourceId, volume: number) =>
      collections
        .get(sourceId)
        ?.volumes.find((candidate) => candidate.book === volume),
    [collections],
  );

  const scrollToPassage = useCallback((targetId?: string) => {
    window.setTimeout(() => {
      const target = targetId ? document.getElementById(`passage-${targetId}`) : null;
      if (target) target.scrollIntoView({ block: 'start', behavior: 'auto' });
      else window.scrollTo({ top: 0, behavior: 'auto' });
    }, 60);
  }, []);

  const loadBook = useCallback(
    async (sourceId: SourceId, volumeNumber: number, targetId?: string) => {
      const volume = findVolume(sourceId, volumeNumber);
      if (!volume) return;
      const key = volumeKey(sourceId, volumeNumber);
      setRequestedKey(key);
      setLoading(true);
      try {
        let nextBook = bookCache.current.get(key);
        if (!nextBook) {
          const response = await fetch(publicDataUrl(basePath, volume.path));
          if (!response.ok) throw new Error(`Failed to load ${key}`);
          nextBook = (await response.json()) as BookData;
          bookCache.current.set(key, nextBook);
        }
        setBook(nextBook);
        setActivePassage(1);
        const passage = targetId?.startsWith('@')
          ? (() => {
              const [chapter, section] = targetId.slice(1).split('|');
              return nextBook.passages.find(
                (candidate) =>
                  candidate.chapter === chapter &&
                  candidate.sectionRefs.includes(section),
              );
            })()
          : targetId
            ? nextBook.passages.find((candidate) => candidate.id === targetId)
            : nextBook.passages[0];
        const url = new URL(window.location.href);
        url.searchParams.set('source', sourceId);
        url.searchParams.set('book', String(volumeNumber));
        if (passage) {
          url.searchParams.set('chapter', passage.chapter);
          url.searchParams.set('section', passage.sectionStart);
        } else {
          url.searchParams.delete('chapter');
          url.searchParams.delete('section');
        }
        window.history.replaceState({}, '', url);
        window.localStorage.setItem(
          'roma-fontes-position',
          JSON.stringify({ sourceId, book: volumeNumber, passageId: passage?.id }),
        );
        scrollToPassage(passage?.id);
      } finally {
        setLoading(false);
        setMenuOpen(false);
        setSearchOpen(false);
      }
    },
    [basePath, findVolume, scrollToPassage],
  );

  useEffect(() => {
    const savedMode = window.localStorage.getItem('roma-fontes-view') as ViewMode;
    if (['parallel', 'original', 'korean'].includes(savedMode)) {
      setViewMode(savedMode);
    }
    const url = new URL(window.location.href);
    const querySource = url.searchParams.get('source') as SourceId | null;
    const queryBook = Number(url.searchParams.get('book'));
    const chapter = url.searchParams.get('chapter');
    const section = url.searchParams.get('section');
    if (
      querySource &&
      ['livy', 'periochae', 'polybius'].includes(querySource) &&
      findVolume(querySource, queryBook)
    ) {
      const locator = chapter && section ? `@${chapter}|${section}` : undefined;
      void loadBook(querySource, queryBook, locator);
      return;
    }
    const saved = window.localStorage.getItem('roma-fontes-position');
    if (saved) {
      try {
        const position = JSON.parse(saved) as {
          sourceId?: SourceId;
          book?: number;
          passageId?: string;
        };
        if (
          position.sourceId &&
          position.book &&
          findVolume(position.sourceId, position.book)
        ) {
          void loadBook(position.sourceId, position.book, position.passageId);
        }
      } catch {
        // A malformed local preference should never prevent the first volume opening.
      }
    }
  }, [findVolume, loadBook]);

  useEffect(() => {
    const nodes = Array.from(
      document.querySelectorAll<HTMLElement>('[data-passage]'),
    );
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (!visible) return;
        const node = visible.target as HTMLElement;
        setActivePassage(Number(node.dataset.paragraph || 1));
      },
      { rootMargin: '-18% 0px -68% 0px' },
    );
    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [book]);

  const chooseFilter = (nextFilter: SourceFilter) => {
    setFilter(nextFilter);
    if (nextFilter !== 'all' && nextFilter !== book.sourceId) {
      const first = collections.get(nextFilter)?.volumes[0];
      if (first) void loadBook(nextFilter, first.book);
    }
  };

  const changeView = (nextMode: ViewMode) => {
    setViewMode(nextMode);
    window.localStorage.setItem('roma-fontes-view', nextMode);
  };

  const copyPassage = async (passage: Passage) => {
    const url = new URL(window.location.href);
    url.searchParams.set('source', passage.sourceId);
    url.searchParams.set('book', String(passage.book));
    url.searchParams.set('chapter', passage.chapter);
    url.searchParams.set('section', passage.sectionStart);
    const parts = [
      `${currentCollection.authorKo} 《${currentCollection.workTitleKo}》 ${passage.ref}`,
      '',
      passage.original,
    ];
    if (passage.korean) parts.push('', passage.korean);
    parts.push('', url.toString());
    await navigator.clipboard.writeText(parts.join('\n'));
    setCopiedId(passage.id);
    window.setTimeout(() => setCopiedId(null), 1400);
  };

  const runSearch = async () => {
    const query = searchQuery.trim().toLocaleLowerCase();
    if (query.length < 2) return;
    setSearching(true);
    setSearchOpen(true);
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
            );
            if (!response.ok) throw new Error(`Search index ${sourceId} failed`);
            index = (await response.json()) as SearchRow[];
            searchCache.current.set(sourceId, index);
          }
          return index
            .filter((row) =>
              `${row.original} ${row.korean} ${row.ref}`
                .toLocaleLowerCase()
                .includes(query),
            )
            .slice(0, 40)
            .map((row) => ({ ...row, sourceId }));
        }),
      );
      setSearchResults(rows.flat().slice(0, 80));
    } finally {
      setSearching(false);
    }
  };

  const moveFromSearch = (result: SearchRow & { sourceId: SourceId }) => {
    void loadBook(result.sourceId, result.book, result.id);
  };

  const goToTimeline = (value: string) => {
    const target = parseTimelineTarget(value);
    setFilter('all');
    void loadBook(target.sourceId, target.book);
  };

  const onTouchStart = (event: TouchEvent<HTMLElement>) => {
    touchStartX.current = event.touches[0]?.clientX ?? null;
  };

  const onTouchEnd = (event: TouchEvent<HTMLElement>) => {
    if (touchStartX.current === null) return;
    const end = event.changedTouches[0]?.clientX ?? touchStartX.current;
    const distance = end - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(distance) < 90) return;
    const target = distance < 0 ? nextVolume : previousVolume;
    if (target) void loadBook(book.sourceId, target.book);
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
        <a className="brand" href={basePath || '/'} aria-label="처음으로">
          <span className="brand-seal" aria-hidden="true">SPQR</span>
          <span>
            <strong>ROMA · FONTES</strong>
            <small>로마사 원전 읽기</small>
          </span>
        </a>

        <div className="header-search">
          <Search aria-hidden="true" />
          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void runSearch();
            }}
            placeholder="라틴어·그리스어·한국어 검색"
            aria-label="전체 본문 검색"
          />
          <button type="button" onClick={() => void runSearch()}>검색</button>
        </div>

        <div className="header-actions">
          <button type="button" className="source-button" onClick={() => setSourcesOpen(true)}>
            <LibraryBig /> <span>판본</span>
          </button>
          <button type="button" className="menu-button" onClick={() => setMenuOpen(true)}>
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
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
        >
          <div className="mobile-timeline">{timeline}</div>

          <section className="reader-toolbar" aria-label="읽기 설정">
            <label className="volume-select">
              <span className="sr-only">권 선택</span>
              <select
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
                  onClick={() => changeView(mode)}
                >
                  {label}
                </button>
              ))}
            </div>
          </section>

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
            <p><strong>{book.preservationLabel}</strong>{STATUS_EXPLANATIONS[book.sourceKind]}</p>
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
                  data-paragraph={passage.paragraph}
                >
                  <header className="passage-meta">
                    <a
                      href={`?source=${passage.sourceId}&book=${passage.book}&chapter=${encodeURIComponent(passage.chapter)}&section=${encodeURIComponent(passage.sectionStart)}`}
                      aria-label={`${passage.ref} 영구 링크`}
                    >
                      {passage.ref}
                    </a>
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
                </article>
              ))}
            </div>
          )}

          <nav className="volume-navigation" aria-label="앞뒤 권">
            <button
              type="button"
              disabled={!previousVolume}
              onClick={() => previousVolume && void loadBook(book.sourceId, previousVolume.book)}
            >
              <ChevronLeft />
              <span><small>이전 권</small>{previousVolume ? `제${previousVolume.book}권` : '처음'}</span>
            </button>
            <span>{currentVolumeIndex + 1} / {currentCollection.volumes.length}</span>
            <button
              type="button"
              disabled={!nextVolume}
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
        <div className="overlay">
          <button className="overlay-dismiss" type="button" onClick={() => setMenuOpen(false)} aria-label="목차 닫기" />
          <dialog open className="drawer toc-drawer" aria-label="전체 목차">
            <header><div><span>INDEX LIBRORUM</span><h2>전체 목차</h2></div><button type="button" onClick={() => setMenuOpen(false)} aria-label="닫기"><X /></button></header>
            <div className="drawer-filters">
              {(['all', 'livy', 'periochae', 'polybius'] as SourceFilter[]).map((id) => (
                <button type="button" key={id} data-active={filter === id} onClick={() => chooseFilter(id)}>
                  {id === 'all' ? '전체' : SOURCE_LABELS[id].label}
                </button>
              ))}
            </div>
            <div className="volume-grid">
              {visibleVolumes.map((volume) => (
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
          </dialog>
        </div>
      )}

      {sourcesOpen && (
        <div className="overlay">
          <button className="overlay-dismiss" type="button" onClick={() => setSourcesOpen(false)} aria-label="판본 닫기" />
          <dialog open className="drawer sources-drawer" aria-label="판본과 원문 출처">
            <header><div><span>FONTES</span><h2>판본과 원문 출처</h2></div><button type="button" onClick={() => setSourcesOpen(false)} aria-label="닫기"><X /></button></header>
            <p className="source-intro">원문은 고정된 공개 학술 데이터의 커밋과 해시를 기록해 재현할 수 있게 했습니다. 번역은 이 프로젝트에서 원문으로부터 직접 작성합니다.</p>
            <div className="source-cards">
              {manifest.sources.sources
                .filter((source) => ['livy-01-40', 'livy-periochae-46-142', 'polybius-histories'].includes(source.id))
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
          </dialog>
        </div>
      )}

      {searchOpen && (
        <div className="overlay">
          <button className="overlay-dismiss" type="button" onClick={() => setSearchOpen(false)} aria-label="검색 결과 닫기" />
          <dialog open className="search-dialog" aria-label="검색 결과">
            <header>
              <div><span>QUAERE</span><h2>“{searchQuery.trim()}” 검색</h2></div>
              <button type="button" onClick={() => setSearchOpen(false)} aria-label="닫기"><X /></button>
            </header>
            <p className="search-summary">{searching ? '색인을 불러오는 중…' : `${searchResults.length}개 결과${searchResults.length === 80 ? ' (상위 80개)' : ''}`}</p>
            <div className="search-results">
              {!searching && searchResults.map((result) => (
                <button type="button" key={`${result.sourceId}-${result.id}`} onClick={() => moveFromSearch(result)}>
                  <span>{SOURCE_LABELS[result.sourceId].label} · {result.ref}</span>
                  <p>{result.korean || result.original}</p>
                  <ArrowRight />
                </button>
              ))}
              {!searching && searchResults.length === 0 && <p className="empty-search">검색 결과가 없습니다.</p>}
            </div>
          </dialog>
        </div>
      )}

      <div className="mobile-book-nav" aria-label="모바일 앞뒤 권">
        <button type="button" disabled={!previousVolume} onClick={() => previousVolume && void loadBook(book.sourceId, previousVolume.book)}><ArrowLeft /> 이전</button>
        <button type="button" onClick={() => setMenuOpen(true)}><BookOpen /> 목차</button>
        <button type="button" disabled={!nextVolume} onClick={() => nextVolume && void loadBook(book.sourceId, nextVolume.book)}>다음 <ArrowRight /></button>
      </div>
    </div>
  );
}
