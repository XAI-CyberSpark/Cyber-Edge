import { uiText, useUiLanguage } from '@/i18n';
import { useLayoutEffect, useRef, useState } from 'react';

/** Fade only clipped labels; the complete name remains available to assistive technology. */
export function CategoryLabel({ children }: { children: string }) {
  const language = useUiLanguage();
  const ref = useRef<HTMLSpanElement>(null);
  const [clipped, setClipped] = useState(false);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => setClipped(element.scrollWidth > element.clientWidth + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    let active = true;
    void document.fonts?.ready.then(() => { if (active) measure(); });
    return () => { active = false; observer.disconnect(); };
  }, [children, language]);
  return <span ref={ref} className={`cl-category-label${clipped ? ' is-clipped' : ''}`} title={uiText(children)}>{uiText(children)}</span>;
}
