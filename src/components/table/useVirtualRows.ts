import { useState, useCallback, useMemo, useRef } from 'react';

interface VirtualRowsConfig {
  totalRows: number;
  rowHeight: number;
  containerHeight: number;
  overscan?: number;
}

interface VirtualRowsResult {
  visibleRange: { start: number; end: number };
  totalHeight: number;
  offsetTop: number;
  offsetBottom: number;
  onScroll: (scrollTop: number) => void;
  scrollTop: number;
}

export function useVirtualRows({
  totalRows,
  rowHeight,
  containerHeight,
  overscan = 10,
}: VirtualRowsConfig): VirtualRowsResult {
  const [scrollTop, setScrollTop] = useState(0);
  const lastScrollTop = useRef(0);

  const onScroll = useCallback((newScrollTop: number) => {
    lastScrollTop.current = newScrollTop;
    setScrollTop(newScrollTop);
  }, []);

  const result = useMemo(() => {
    const totalHeight = totalRows * rowHeight;
    const visibleCount = Math.ceil(containerHeight / rowHeight);
    const firstVisible = Math.floor(scrollTop / rowHeight);

    const start = Math.max(0, firstVisible - overscan);
    const end = Math.min(totalRows, firstVisible + visibleCount + overscan);

    const offsetTop = start * rowHeight;
    const offsetBottom = Math.max(0, totalHeight - end * rowHeight);

    return {
      visibleRange: { start, end },
      totalHeight,
      offsetTop,
      offsetBottom,
      scrollTop,
    };
  }, [totalRows, rowHeight, containerHeight, overscan, scrollTop]);

  return { ...result, onScroll };
}
