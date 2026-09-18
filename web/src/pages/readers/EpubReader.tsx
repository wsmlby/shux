import { useEffect, useRef } from "react";
import ePub from "epubjs";
import { api, type Book } from "../../api/client.js";

interface Props {
  book: Book;
  initialLocation: string | null;
}

export default function EpubReader({ book, initialLocation }: Props) {
  const viewerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!viewerRef.current) return;

    const epub = ePub(api.fileUrl(book.id));
    const rendition = epub.renderTo(viewerRef.current, {
      width: "100%",
      height: "100%",
      spread: "auto",
    });

    rendition.display(initialLocation ?? undefined);

    let saveTimer: ReturnType<typeof setTimeout> | undefined;
    rendition.on("relocated", (location: { start: { cfi: string; percentage: number } }) => {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        api
          .saveProgress(book.id, {
            location: location.start.cfi,
            percent: Math.round(location.start.percentage * 100),
          })
          .catch(() => {});
      }, 800);
    });

    function onKeyUp(e: KeyboardEvent) {
      if (e.key === "ArrowLeft") rendition.prev();
      if (e.key === "ArrowRight") rendition.next();
    }
    document.addEventListener("keyup", onKeyUp);

    return () => {
      clearTimeout(saveTimer);
      document.removeEventListener("keyup", onKeyUp);
      epub.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book.id]);

  return (
    <div className="epub-reader">
      <div ref={viewerRef} className="epub-viewer" />
    </div>
  );
}
