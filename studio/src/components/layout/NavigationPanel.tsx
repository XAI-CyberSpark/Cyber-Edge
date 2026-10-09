import { uiText, useUiLanguage  } from '@/i18n';
import { createContext, useContext, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X, type LucideIcon } from 'lucide-react';
import './navigation-panel.css';

const PanelHost = createContext<HTMLElement | null | undefined>(undefined);

/** One overlay plane above the workspace header, tabs and editing surfaces. */
export function WorkspacePanelLayer({ children }: { children: ReactNode }) {
  useUiLanguage();
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  return <PanelHost.Provider value={host}>
    <div className="workspace-panel-frame">
      <div className="workspace-panel-underlay" data-workspace-underlay>{children}</div>
      <div ref={setHost} className="workspace-panel-layer" />
    </div>
  </PanelHost.Provider>;
}

type Props = {
  id: string; title: string; description?: string; icon: LucideIcon;
  onClose: () => void; closeLabel?: string; label?: string;
  actions?: ReactNode; children: ReactNode; className?: string;
};

export function NavigationPanel({ id, title, description, icon: Icon, onClose, closeLabel = uiText("关闭{0}", [title]), label = uiText("{0}面板", [title]), actions, children, className = '' }: Props) {
  useUiLanguage();
  const host = useContext(PanelHost);
  const panel = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    if (!panel.current) return;
    const previous = document.activeElement as HTMLElement | null;
    panel.current.focus({ preventScroll: true });
    return () => {
      const nav = document.querySelector<HTMLElement>(`[data-nav-section="${id}"]`);
      (nav || (previous?.isConnected ? previous : null))?.focus({ preventScroll: true });
    };
  }, [host, id]);

  useLayoutEffect(() => {
    const underlay = host?.previousElementSibling;
    if (!underlay || typeof window.matchMedia !== 'function') return;
    const narrow = window.matchMedia('(max-width:815px)');
    const sync = () => underlay.toggleAttribute('inert', narrow.matches && !panel.current?.classList.contains('cl-dragging'));
    sync();
    narrow.addEventListener('change', sync);
    const observer = new MutationObserver(sync);
    if (panel.current) observer.observe(panel.current, { attributes: true, attributeFilter: ['class'] });
    return () => {
      observer.disconnect();
      narrow.removeEventListener('change', sync);
      underlay.removeAttribute('inert');
    };
  }, [host, className]);

  const content = <section ref={panel} tabIndex={-1} role="region" aria-label={uiText(label)}
    className={`navigation-panel left-panel ${className}`} data-navigation-panel={id}
    onKeyDown={event => {
      // Nested import/delete dialogs own their Escape key.
      if (event.key === 'Escape' && !event.defaultPrevented && !(event.target as HTMLElement).closest('[role="dialog"], dialog')) {
        event.preventDefault(); event.stopPropagation(); onClose();
      }
    }}
    >
    <header className="navigation-panel-header left-panel-header">
      <div className="navigation-panel-heading"><Icon size={20} aria-hidden="true" /><div><h2>{uiText(title)}</h2>{description && <p>{uiText(description)}</p>}</div></div>
      <div className="navigation-panel-actions">{actions}<button type="button" aria-label={uiText(closeLabel)} title={uiText("关闭面板 · Esc")} onClick={onClose}><X size={18} /></button></div>
    </header>
    <div className="navigation-panel-content">{children}</div>
  </section>;
  // Standalone component tests/previews can render without a workspace host.
  return host === null ? null : host ? createPortal(content, host) : content;
}
