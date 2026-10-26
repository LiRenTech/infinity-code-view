import { memo, useLayoutEffect, useRef } from 'react';

/** Fit the complete name, including wrapping, using the actual system font metrics. */
export const SummaryTitle = memo(function SummaryTitle({ name, width, height }: { name: string; width: number; height: number }) {
  const box = useRef<HTMLDivElement>(null);
  const label = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    if (!box.current || !label.current) return;
    let low = 0.01;
    let high = Math.max(width, height) * 2;
    for (let i = 0; i < 18; i++) {
      const fontSize = (low + high) / 2;
      label.current.style.fontSize = `${fontSize}px`;
      if (label.current.scrollWidth <= box.current.clientWidth && label.current.scrollHeight <= box.current.clientHeight) low = fontSize;
      else high = fontSize;
    }
    label.current.style.fontSize = `${low}px`;
  }, [name, width, height]);
  return <div className="summary-title" ref={box} style={{ inset: Math.min(width, height) * 0.1 }}>
    <span className="summary-text" ref={label} style={{ whiteSpace: Array.from(name).length <= 24 ? 'pre' : 'pre-wrap' }}>{name}</span>
  </div>;
});
