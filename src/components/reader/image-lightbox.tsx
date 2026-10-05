import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const DURATION = 380;
const EASE = "cubic-bezier(0.32, 0.72, 0, 1)";

/** Where the picture ends up: centred, as large as fits (and never more than
 * twice its real size, which would only blur it). */
function fit(natural: { w: number; h: number }) {
  const scale = Math.min(
    (window.innerWidth * 0.9) / natural.w,
    (window.innerHeight * 0.84) / natural.h,
    2,
  );
  const width = natural.w * scale;
  const height = natural.h * scale;
  return {
    left: (window.innerWidth - width) / 2,
    top: (window.innerHeight - height) / 2 - 12,
    width,
    height,
  };
}

/** A picture that lifts out of the page and glides to the middle of the
 * screen over a dimmed backdrop; closing sends it back where it came from.
 * The picture is placed at its final spot and a transform makes it look like
 * it is still at the original spot, then the transform is released, so the
 * browser animates it on the GPU. */
export function ImageLightbox({
  src,
  alt,
  natural,
  getOrigin,
  onClosed,
}: {
  src: string;
  alt: string | null;
  natural: { w: number; h: number };
  /** The picture's current box in the page, read when opening and closing. */
  getOrigin: () => DOMRect;
  onClosed: () => void;
}) {
  const [target] = useState(() => fit(natural));
  const [origin, setOrigin] = useState(() => getOrigin());
  const [open, setOpen] = useState(false);
  const closing = useRef(false);

  // One frame at the start position, then release the transform.
  useLayoutEffect(() => {
    const id = requestAnimationFrame(() =>
      requestAnimationFrame(() => setOpen(true)),
    );
    return () => cancelAnimationFrame(id);
  }, []);

  function close() {
    if (closing.current) return;
    closing.current = true;
    setOrigin(getOrigin());
    setOpen(false);
    setTimeout(onClosed, DURATION);
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // close only touches refs and stable props.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fromOrigin = `translate(${origin.left - target.left}px, ${
    origin.top - target.top
  }px) scale(${origin.width / target.width}, ${origin.height / target.height})`;

  return createPortal(
    <div
      className="fixed inset-0 z-[60] cursor-zoom-out"
      onClick={close}
      role="dialog"
      aria-modal="true"
      aria-label={alt ?? "Image"}
    >
      <div
        className="absolute inset-0 bg-black/75 backdrop-blur-sm"
        style={{
          opacity: open ? 1 : 0,
          transition: `opacity ${DURATION}ms ease`,
        }}
      />
      <img
        src={src}
        alt={alt ?? ""}
        referrerPolicy="no-referrer"
        draggable={false}
        className="absolute rounded-lg shadow-2xl"
        style={{
          left: target.left,
          top: target.top,
          width: target.width,
          height: target.height,
          transformOrigin: "0 0",
          transform: open ? "none" : fromOrigin,
          transition: `transform ${DURATION}ms ${EASE}`,
          willChange: "transform",
        }}
      />
      {alt && (
        <p
          className="absolute inset-x-0 mx-auto max-w-[80ch] px-6 text-center text-[0.875rem] text-white/80"
          style={{
            top: target.top + target.height + 14,
            opacity: open ? 1 : 0,
            transition: `opacity ${DURATION}ms ease`,
          }}
        >
          {alt}
        </p>
      )}
    </div>,
    document.body,
  );
}
