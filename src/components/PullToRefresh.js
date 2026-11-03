import React, { useEffect, useRef } from "react";
import { haptic } from "utils/haptics";

const THRESHOLD = 64;
const MAX_PULL = 96;

// Pull down at the top of a page to reload it. Drives the indicator through
// CSS custom properties (no re-render per touchmove) and calls onRefresh,
// which remounts the current page so it fetches fresh data.
const PullToRefresh = ({ panelRef, onRefresh }) => {
  const indicatorRef = useRef(null);

  useEffect(() => {
    const panel = panelRef.current;
    const el = indicatorRef.current;
    if (!panel || !el) return undefined;

    let startY = null;
    let pull = 0;
    let armed = false;

    const paint = (p) => {
      el.style.setProperty("--ptr-o", String(Math.min(p / THRESHOLD, 1)));
      el.style.setProperty("--ptr-y", `${p - 24}px`);
      el.style.setProperty("--ptr-r", `${p * 4}deg`);
    };
    const blocked = () =>
      document.documentElement.classList.contains("nav-open") ||
      document.querySelector(".modal.show, .mksv-app-lock");

    const onStart = (e) => {
      startY = panel.scrollTop <= 0 && !blocked() ? e.touches[0].clientY : null;
      pull = 0;
      armed = false;
    };
    const onMove = (e) => {
      if (startY === null) return;
      const dy = e.touches[0].clientY - startY;
      pull = dy > 0 ? Math.min(dy * 0.5, MAX_PULL) : 0;
      if (!armed && pull >= THRESHOLD) {
        armed = true;
        haptic("selection");
      }
      paint(pull);
    };
    const onEnd = () => {
      if (startY === null) return;
      startY = null;
      if (pull >= THRESHOLD) {
        el.classList.add("is-loading");
        paint(THRESHOLD);
        onRefresh();
        setTimeout(() => {
          el.classList.remove("is-loading");
          paint(0);
        }, 700);
      } else {
        paint(0);
      }
    };

    panel.addEventListener("touchstart", onStart, { passive: true });
    panel.addEventListener("touchmove", onMove, { passive: true });
    panel.addEventListener("touchend", onEnd);
    panel.addEventListener("touchcancel", onEnd);
    return () => {
      panel.removeEventListener("touchstart", onStart);
      panel.removeEventListener("touchmove", onMove);
      panel.removeEventListener("touchend", onEnd);
      panel.removeEventListener("touchcancel", onEnd);
    };
  }, [panelRef, onRefresh]);

  return (
    <div ref={indicatorRef} className="mksv-ptr" aria-hidden="true">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 12a9 9 0 1 1-2.64-6.36" />
        <path d="M21 3v6h-6" />
      </svg>
    </div>
  );
};

export default PullToRefresh;
