import { useEffect, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client.js";
import EpubReader from "./readers/EpubReader.js";
import PdfReader from "./readers/PdfReader.js";
import TxtReader from "./readers/TxtReader.js";

export default function Reader() {
  const { id } = useParams<{ id: string }>();
  const shellRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fullscreenSupported] = useState(
    () => typeof document !== "undefined" && !!document.documentElement.requestFullscreen
  );

  const { data: book, isLoading } = useQuery({
    queryKey: ["book", id],
    queryFn: () => api.book(id!),
    enabled: !!id,
  });

  const { data: progress } = useQuery({
    queryKey: ["progress", id],
    queryFn: () => api.progress(id!),
    enabled: !!id,
  });

  // Reading is the one view where pinch-zoom and double-tap-zoom do more
  // harm than good (they fight with page-turn taps/swipes), so disable them
  // just here rather than app-wide — restored the moment you leave.
  useEffect(() => {
    const meta = document.querySelector('meta[name="viewport"]');
    const original = meta?.getAttribute("content") ?? null;
    meta?.setAttribute(
      "content",
      "width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover"
    );
    return () => {
      if (original !== null) meta?.setAttribute("content", original);
    };
  }, []);

  useEffect(() => {
    function onFullscreenChange() {
      setIsFullscreen(document.fullscreenElement === shellRef.current);
    }
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await shellRef.current?.requestFullscreen();
      }
    } catch (err) {
      console.error("Fullscreen request failed:", err);
    }
  }

  if (isLoading || !book) return <div className="page-loading">Loading…</div>;

  return (
    <div className="reader-shell" ref={shellRef}>
      <div className="reader-topbar">
        <Link to={`/books/${book.id}`} className="link-button">
          ← {book.title}
        </Link>
        {fullscreenSupported && (
          <button className="link-button" onClick={toggleFullscreen}>
            {isFullscreen ? "Exit fullscreen" : "Fullscreen"}
          </button>
        )}
      </div>
      <div className="reader-body">
        {book.format === "EPUB" && (
          <EpubReader book={book} initialLocation={progress?.location ?? null} fullscreen={isFullscreen} />
        )}
        {book.format === "PDF" && (
          <PdfReader book={book} initialLocation={progress?.location ?? null} fullscreen={isFullscreen} />
        )}
        {book.format === "TXT" && (
          <TxtReader book={book} initialLocation={progress?.location ?? null} fullscreen={isFullscreen} />
        )}
      </div>
    </div>
  );
}
