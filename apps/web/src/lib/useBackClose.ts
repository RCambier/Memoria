import { useEffect, useRef } from "react";

/**
 * Makes the Back button (browser chrome, Android back, iOS edge-swipe) close
 * an open overlay — task detail, settings panel, mobile composer — instead of
 * leaving the app. While `open`, one history entry is pushed; Back pops it
 * and `close()` runs. Closing from the UI consumes that entry silently, so
 * history never accumulates ghost states.
 */
export function useBackClose(open: boolean, close: () => void): void {
  const closeRef = useRef(close);
  closeRef.current = close;

  useEffect(() => {
    if (!open) return;
    let poppedByBack = false;
    history.pushState({ ...(history.state as object), memoriaOverlay: true }, "");
    const onPop = (): void => {
      poppedByBack = true;
      closeRef.current();
    };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      const state = history.state as { memoriaOverlay?: boolean } | null;
      if (!poppedByBack && state?.memoriaOverlay) history.back();
    };
  }, [open]);
}
