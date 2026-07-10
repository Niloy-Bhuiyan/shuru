"use client";

/**
 * Typewriter — reveals text one character at a time (inherently stepped), for
 * the abstention terminal's signature "SIGNAL: INSUFFICIENT" moment. A JS
 * reveal (not CSS width tricks) so it works for Bangla and English alike.
 * Honors prefers-reduced-motion: shows the full text instantly, no cursor.
 */

import { useEffect, useState } from "react";

export function Typewriter({
  text,
  speed = 55,
  className,
}: {
  text: string;
  /** ms per character */
  speed?: number;
  className?: string;
}) {
  const [shown, setShown] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setShown(text);
      setDone(true);
      return;
    }
    setShown("");
    setDone(false);
    const chars = Array.from(text); // safe for multi-byte glyphs
    let i = 0;
    const id = setInterval(() => {
      i += 1;
      setShown(chars.slice(0, i).join(""));
      if (i >= chars.length) {
        clearInterval(id);
        setDone(true);
      }
    }, speed);
    return () => clearInterval(id);
  }, [text, speed]);

  return (
    <span className={className}>
      {shown}
      {/* cursor blinks only while typing; the terminal body carries the
          persistent cursor once the signal has fully revealed */}
      {!done && <span className="pixel-blink text-amber">▮</span>}
    </span>
  );
}

export default Typewriter;
