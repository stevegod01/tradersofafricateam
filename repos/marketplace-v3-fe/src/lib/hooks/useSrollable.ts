import { useCallback, useLayoutEffect, useRef, useState } from "react";

interface ScrollableState {
  showPrev: boolean;
  showNext: boolean;
  offset: number;
}

export const useScrollable = (scrollStep = 240) => {
  const viewportRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  const [state, setState] = useState<ScrollableState>({
    offset: 0,
    showPrev: false,
    showNext: false,
  });

  const maxOffset = useCallback(() => {
    if (!trackRef.current || !viewportRef.current) return 0;
    return Math.max(
      0,
      trackRef.current.scrollWidth - viewportRef.current.clientWidth,
    );
  }, []);

  const update = useCallback(
    (newOffset: number) => {
      const max = maxOffset();
      const clamped = Math.max(0, Math.min(newOffset, max));
      setState({
        offset: clamped,
        showPrev: clamped > 1,
        showNext: clamped < max - 1,
      });
    },
    [maxOffset],
  );

  useLayoutEffect(() => {
    const ro = new ResizeObserver(() => {
      setState((prev) => {
        const max = maxOffset();
        const clamped = Math.max(0, Math.min(prev.offset, max));
        return {
          offset: clamped,
          showPrev: clamped > 1,
          showNext: clamped < max - 1,
        };
      });
    });

    if (viewportRef.current) ro.observe(viewportRef.current);
    return () => ro.disconnect();
  }, [maxOffset]);

  const scrollPrev = useCallback(
    () => update(state.offset - scrollStep),
    [update, state.offset, scrollStep],
  );

  const scrollNext = useCallback(
    () => update(state.offset + scrollStep),
    [update, state.offset, scrollStep],
  );

  return {
    viewportRef,
    trackRef,
    offset: state.offset,
    showPrev: state.showPrev,
    showNext: state.showNext,
    scrollPrev,
    scrollNext,
  };
};
