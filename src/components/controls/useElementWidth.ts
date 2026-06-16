import { useLayoutEffect, useRef, useState } from 'react';

/**
 * Tracks a wrapping element's content width via ResizeObserver so an SVG
 * controller can render at exact pixel width and fit its container instead
 * of a hardcoded default. Measures synchronously before paint (useLayoutEffect)
 * to avoid a first-frame flash at the fallback width.
 */
export function useElementWidth(fallback: number) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(fallback);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const w = Math.floor(el.clientWidth);
      if (w > 0) setWidth(w);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}
