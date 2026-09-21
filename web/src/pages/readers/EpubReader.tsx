import { useEffect, useRef, useState } from "react";
import ePub from "epubjs";
import { api, type Book } from "../../api/client.js";
import NextInSeriesCard from "../../components/NextInSeriesCard.js";
import GoToMenu from "../../components/GoToMenu.js";

interface Props {
  book: Book;
  initialLocation: string | null;
  fullscreen: boolean;
}

interface EpubLocation {
  start: { cfi: string; index?: number };
  atStart?: boolean;
  atEnd?: boolean;
}

interface TocEntry {
  href: string;
  label: string;
  depth: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function flattenToc(items: any[], depth = 0): TocEntry[] {
  return items.flatMap((item) => [
    { href: item.href as string, label: (item.label as string)?.trim() || (item.href as string), depth },
    ...(item.subitems?.length ? flattenToc(item.subitems, depth + 1) : []),
  ]);
}

export default function EpubReader({ book, initialLocation, fullscreen }: Props) {
  const viewerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const renditionRef = useRef<any>(null);
  // Wraps rendition.next()/prev() with stuck-detection: some sections (an
  // image-only page with nothing else on it, e.g. a sub-book's title page)
  // trip up epub.js's internal scroll-width math and it silently no-ops —
  // no error, no relocated event, the page just never turns. If nothing
  // relocates shortly after asking, force a direct jump to the adjacent
  // spine section instead of leaving the reader stuck.
  const navRef = useRef<{ next: () => void; prev: () => void }>({ next: () => {}, prev: () => {} });
  const fullscreenRef = useRef(fullscreen);
  fullscreenRef.current = fullscreen;
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ percent: number; page?: number; total?: number } | null>(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);
  const [toc, setToc] = useState<TocEntry[]>([]);
  const [lastHref, setLastHref] = useState<string | undefined>();

  useEffect(() => {
    if (!viewerRef.current) return;
    setError(null);
    setProgress(null);
    setToc([]);
    setLastHref(undefined);

    // Our file URL has no ".epub" extension (it's /api/books/:id/file), and
    // epub.js infers the input type from the URL's extension — without this
    // hint it treats an extensionless URL as an unpacked directory and 404s
    // trying to fetch container.xml as a sub-path instead of the zip itself.
    const epub = ePub(api.fileUrl(book.id), { openAs: "epub" });
    epub.on("openFailed", (err: unknown) => {
      console.error("Failed to open EPUB:", err);
      setError("Failed to open this EPUB file — it may be missing or corrupted.");
    });

    const rendition = epub.renderTo(viewerRef.current, {
      width: "100%",
      height: "100%",
      spread: "auto",
    });
    renditionRef.current = rendition;

    rendition.on("renderError", (err: unknown) => {
      console.error("Failed to render EPUB:", err);
      setError("Failed to render this EPUB file.");
    });

    rendition.display(initialLocation ?? undefined).catch((err: unknown) => {
      console.error("Failed to display EPUB:", err);
      setError("Failed to display this EPUB file.");
    });

    // epub.js's locations table (needed for whole-book percentage and a real
    // page count) is built asynchronously and, for a large illustrated book,
    // can take a long time — `locations.length()` grows the whole while it
    // runs, so checking "> 0" treats "just started" as "done" and produces
    // numbers that visibly change or reset (e.g. a resumed book briefly
    // showing "Page 1 of 1"). Track real completion with a ref instead, and
    // use it (not React state) inside the relocate handler below so the
    // closure always sees the current value.
    const locationsReady = { current: false };
    let cancelled = false;
    epub.ready
      .then(() => {
        if (cancelled) return;
        setToc(flattenToc(epub.navigation?.toc ?? []));
        setLastHref(epub.spine?.last()?.href);
        return epub.locations.generate(1600);
      })
      .then(() => {
        if (cancelled) return;
        locationsReady.current = true;
        const current = rendition.currentLocation();
        if (current?.start?.cfi) {
          const percent = Math.round(epub.locations.percentageFromCfi(current.start.cfi) * 100);
          const page = epub.locations.locationFromCfi(current.start.cfi) + 1;
          const total = epub.locations.length();
          setProgress({ percent, page, total });
        }
      })
      .catch(() => {
        // Locations are a progressive enhancement for the percentage and
        // whole-book page count; navigation still works fine without them.
      });

    let currentIndex: number | undefined;
    let currentCfi: string | undefined;

    let saveTimer: ReturnType<typeof setTimeout> | undefined;
    rendition.on("relocated", (location: EpubLocation) => {
      currentIndex = location.start.index;
      currentCfi = location.start.cfi;
      // Unrounded: this is what gets saved to the server, and "continue
      // reading" only lists books with percent > 0. A large book can have
      // hundreds of locations/spine sections, so a rounded integer percent
      // is genuinely 0 for the first several pages (e.g. page 2 of 600 is
      // 0.33%, which rounds to 0) — that would make a book the user is
      // actively partway into silently vanish from (or never appear in) the
      // continue-reading deck. Round only for on-screen display, below.
      let rawPercent: number;
      let page: number | undefined;
      let total: number | undefined;
      if (locationsReady.current) {
        rawPercent = epub.locations.percentageFromCfi(location.start.cfi) * 100;
        page = epub.locations.locationFromCfi(location.start.cfi) + 1;
        total = epub.locations.length();
      } else {
        // Chapter-granularity estimate, available instantly (no async wait)
        // — rough, but never wrong in a way that looks like a bug the way a
        // stale/partial locations count does.
        const spineTotal = epub.spine?.length || 1;
        rawPercent = ((location.start.index ?? 0) / spineTotal) * 100;
      }
      setProgress({ percent: Math.round(rawPercent), page, total });
      // epub.js only ever sets atStart/atEnd to `true` (never explicitly
      // `false`), and only from the spine position + in-chapter pagination —
      // never from the locations table — so this is reliable even before
      // locations finish generating, unlike gating on `percent`.
      setAtStart(location.atStart ?? false);
      setAtEnd(location.atEnd ?? false);

      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        api.saveProgress(book.id, { location: location.start.cfi, percent: rawPercent }).catch(() => {});
      }, 800);
    });

    const STUCK_TIMEOUT = 500;
    const MAX_CORRECTION_ATTEMPTS = 3;
    // Defensive: collapse any burst of nav calls fired within this window
    // into just the first one, in case something ever delivers one tap as
    // more than one navigation request.
    const NAV_DEBOUNCE = 400;
    let lastNavAt = 0;

    // epub.js can re-fire `relocated` with the *same* cfi instead of staying
    // silent (a "stuck" no-op), or — seen on narrow/mobile viewports — fire
    // it with a spine index on the *wrong side* of where we started, i.e.
    // next()/prev() computes the wrong direction entirely. Either way the
    // result isn't what was asked for, so force a direct jump to the
    // section exactly one away from where we started — and since that jump
    // can occasionally land wrong too (same underlying epub.js flakiness),
    // keep re-checking and retrying, capped so a run of bad luck can't loop
    // forever.
    function correctIfWrong(direction: 1 | -1, beforeIndex: number | undefined, beforeCfi: string | undefined, attempt: number) {
      const stuck = currentCfi === beforeCfi;
      const wrongDirection =
        beforeIndex != null && currentIndex != null && (direction > 0 ? currentIndex < beforeIndex : currentIndex > beforeIndex);
      if (!stuck && !wrongDirection) return; // it worked
      if (attempt >= MAX_CORRECTION_ATTEMPTS || beforeIndex == null) return;
      const targetIndex = beforeIndex + direction;
      const targetSection = targetIndex >= 0 ? epub.spine?.get(targetIndex) : undefined;
      if (!targetSection?.href) return;
      const cfiBeforeRetry = currentCfi;
      rendition.display(targetSection.href);
      setTimeout(() => correctIfWrong(direction, beforeIndex, cfiBeforeRetry, attempt + 1), STUCK_TIMEOUT);
    }

    function safeNext() {
      const now = Date.now();
      if (now - lastNavAt < NAV_DEBOUNCE) return;
      lastNavAt = now;
      const beforeCfi = currentCfi;
      const beforeIndex = currentIndex;
      rendition.next();
      setTimeout(() => correctIfWrong(1, beforeIndex, beforeCfi, 0), STUCK_TIMEOUT);
    }

    function safePrev() {
      const now = Date.now();
      if (now - lastNavAt < NAV_DEBOUNCE) return;
      lastNavAt = now;
      const beforeCfi = currentCfi;
      const beforeIndex = currentIndex;
      rendition.prev();
      setTimeout(() => correctIfWrong(-1, beforeIndex, beforeCfi, 0), STUCK_TIMEOUT);
    }

    navRef.current = { next: safeNext, prev: safePrev };

    function onKeyUp(e: KeyboardEvent) {
      if (e.key === "ArrowLeft") safePrev();
      if (e.key === "ArrowRight") safeNext();
    }
    document.addEventListener("keyup", onKeyUp);

    // Tap-to-turn, fullscreen only: epub.js re-emits DOM events from inside
    // its (same-origin) content iframe on the rendition itself, native event
    // object included, so this works the same as a normal click handler
    // would. Its own link handling (via `<a>.onclick = ...; return false`)
    // only prevents the default navigation, not bubbling, so link clicks
    // still reach us here — skip them explicitly rather than fighting over
    // the tap. Any other tap just advances — trying to split the screen
    // into left/right zones turned out to be unreliable (it depends on
    // epub.js's self-reported content width, which isn't trustworthy — see
    // git history), and a single "tap anywhere to go forward" turns out to
    // be a perfectly good reading gesture on its own.
    rendition.on("click", (event: MouseEvent) => {
      if (!fullscreenRef.current) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest?.("a")) return;
      safeNext();
    });

    return () => {
      cancelled = true;
      clearTimeout(saveTimer);
      document.removeEventListener("keyup", onKeyUp);
      renditionRef.current = null;
      epub.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book.id]);

  return (
    <div className="epub-reader">
      {error && <p className="error">{error}</p>}
      <div ref={viewerRef} className="epub-viewer" />
      {progress && (
        <div className="epub-controls">
          <GoToMenu>
            {(close) => (
              <>
                <button
                  onClick={() => {
                    renditionRef.current?.display();
                    close();
                  }}
                >
                  First page
                </button>
                <button
                  onClick={() => {
                    if (lastHref) renditionRef.current?.display(lastHref);
                    close();
                  }}
                  disabled={!lastHref}
                >
                  Last page
                </button>
                {toc.length > 0 && (
                  <>
                    <div className="goto-divider" />
                    {toc.map((entry) => (
                      <button
                        key={entry.href}
                        style={{ paddingLeft: `${0.6 + entry.depth * 0.9}rem` }}
                        onClick={() => {
                          renditionRef.current?.display(entry.href);
                          close();
                        }}
                      >
                        {entry.label}
                      </button>
                    ))}
                  </>
                )}
              </>
            )}
          </GoToMenu>
          <div className="controls-scroll">
            <button onClick={() => navRef.current.prev()} disabled={atStart}>
              ← Prev
            </button>
            <span>{progress.page ? `Page ${progress.page} of ${progress.total} · ` : ""}{progress.percent}%</span>
            <button onClick={() => navRef.current.next()} disabled={atEnd}>
              Next →
            </button>
          </div>
        </div>
      )}
      {atEnd && book.seriesId && <NextInSeriesCard book={book} />}
    </div>
  );
}
