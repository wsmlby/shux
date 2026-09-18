import { useEffect, useRef, useState } from "react";
import { api, type Book } from "../../api/client.js";

interface Props {
  book: Book;
  initialLocation: string | null;
}

export default function TxtReader({ book, initialLocation }: Props) {
  const [text, setText] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const restoredRef = useRef(false);

  useEffect(() => {
    fetch(api.fileUrl(book.id), { credentials: "include" })
      .then((res) => res.text())
      .then(setText);
  }, [book.id]);

  useEffect(() => {
    if (!text || restoredRef.current || !containerRef.current) return;
    restoredRef.current = true;
    const percent = initialLocation ? parseFloat(initialLocation) : 0;
    const el = containerRef.current;
    if (percent > 0) {
      el.scrollTop = (percent / 100) * (el.scrollHeight - el.clientHeight);
    }
  }, [text, initialLocation]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let saveTimer: ReturnType<typeof setTimeout> | undefined;
    function onScroll() {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        const scrollable = el!.scrollHeight - el!.clientHeight;
        const percent = scrollable > 0 ? (el!.scrollTop / scrollable) * 100 : 0;
        api.saveProgress(book.id, { location: percent.toFixed(2), percent: Math.round(percent) }).catch(() => {});
      }, 600);
    }
    el.addEventListener("scroll", onScroll);
    return () => {
      clearTimeout(saveTimer);
      el.removeEventListener("scroll", onScroll);
    };
  }, [book.id]);

  return (
    <div ref={containerRef} className="txt-reader">
      {text === null ? <p>Loading…</p> : <pre className="txt-content">{text}</pre>}
    </div>
  );
}
