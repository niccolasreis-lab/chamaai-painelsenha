import { useLayoutEffect, useRef, useState } from 'react';

export function useElementHeight(fallback = 720) {
  const ref = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(fallback);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;

    const update = () => {
      const next = Math.round(element.getBoundingClientRect().height);
      if (next > 0) setHeight(current => current === next ? current : next);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return { ref, height };
}
