import { useEffect, useRef, useState } from "react";

interface Props {
  children: (close: () => void) => React.ReactNode;
}

export default function GoToMenu({ children }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  return (
    <div className="goto-menu" ref={rootRef}>
      <button className="secondary" onClick={() => setOpen((o) => !o)}>
        Go to ▾
      </button>
      {open && <div className="goto-panel">{children(() => setOpen(false))}</div>}
    </div>
  );
}
