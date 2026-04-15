"use client";

import { useState, useRef, useCallback } from "react";
import { createPortal } from "react-dom";

export function InfoTip({ text }: { text: string }) {
  const [visible, setVisible] = useState(false);
  const [style, setStyle] = useState<React.CSSProperties>({});
  const ref = useRef<HTMLSpanElement>(null);

  const show = useCallback(() => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const vw = window.innerWidth;

    // Estimate tooltip width (~7px per char + padding)
    const tipWidth = Math.min(text.length * 6.5 + 20, 400);
    const centerX = rect.left + rect.width / 2;

    // If tooltip would overflow right, anchor to right edge
    // If overflow left, anchor to left edge
    // Otherwise center
    let left: number;
    let transform: string;

    if (centerX + tipWidth / 2 > vw - 10) {
      // Too far right — align right edge to viewport
      left = vw - 10;
      transform = "translateX(-100%) translateY(-100%)";
    } else if (centerX - tipWidth / 2 < 10) {
      // Too far left
      left = 10;
      transform = "translateY(-100%)";
    } else {
      // Center
      left = centerX;
      transform = "translateX(-50%) translateY(-100%)";
    }

    setStyle({
      position: "fixed",
      top: rect.top - 4,
      left,
      transform,
      zIndex: 9999,
    });
    setVisible(true);
  }, [text]);

  return (
    <>
      <span
        ref={ref}
        className="ml-1 inline-flex cursor-help"
        onMouseEnter={show}
        onMouseLeave={() => setVisible(false)}
        onClick={(e) => e.stopPropagation()}
      >
        <span className={`inline-flex h-3.5 w-3.5 items-center justify-center border font-data text-[8px] ${visible ? "border-cobalto text-cobalto" : "border-border text-muted"}`}>
          i
        </span>
      </span>
      {visible &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="pointer-events-none border border-gray-700 bg-gray-900 px-2 py-1 text-[10px] text-white max-w-sm"
            style={style}
          >
            {text}
          </div>,
          document.body
        )}
    </>
  );
}
