import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export interface MenuItem {
  label: string;
  onSelect: () => void;
}

/** A right-click menu for whatever it wraps (the wrapper adds no box). */
export function WithContextMenu({
  items,
  children,
}: {
  items: MenuItem[];
  children: ReactNode;
}) {
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!at) return;
    const close = () => setAt(null);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("mousedown", close);
    window.addEventListener("blur", close);
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("blur", close);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", close, true);
    };
  }, [at]);

  return (
    <div
      className="contents"
      onContextMenu={(e) => {
        e.preventDefault();
        setAt({ x: e.clientX, y: e.clientY });
      }}
    >
      {children}
      {at &&
        createPortal(
          <ul
            role="menu"
            // A press inside must not reach the window's "close" listener
            // before the item has been picked.
            onMouseDown={(e) => e.stopPropagation()}
            className="pop-in bg-popover text-popover-foreground border-border fixed z-50 min-w-40 rounded-lg border p-1 font-sans text-[0.8125rem] shadow-[var(--shadow-float)]"
            style={{ left: at.x, top: at.y }}
          >
            {items.map((item) => (
              <li key={item.label} role="none">
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setAt(null);
                    item.onSelect();
                  }}
                  className="hover:bg-accent focus-visible:bg-accent flex h-8 w-full items-center rounded-md px-2.5 text-left outline-none"
                >
                  {item.label}
                </button>
              </li>
            ))}
          </ul>,
          document.body,
        )}
    </div>
  );
}
