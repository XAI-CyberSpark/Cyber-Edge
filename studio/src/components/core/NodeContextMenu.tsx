import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Trash2, Undo2 } from 'lucide-react';
import { uiText, useUiLanguage } from '@/i18n';

export interface NodeMenuPosition { x: number; y: number; nodeId?: string }

export function NodeContextMenu({ position, grouped, disabled, canUndo, onDelete, onUndo, onClose }: {
  position: NodeMenuPosition;
  grouped: boolean;
  disabled: boolean;
  canUndo: boolean;
  onDelete: () => void;
  onUndo: () => void;
  onClose: () => void;
}) {
  useUiLanguage();
  const menu = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  const [point, setPoint] = useState({ x: position.x, y: position.y });
  useLayoutEffect(() => {
    const rect = menu.current!.getBoundingClientRect();
    setPoint({ x: Math.max(8, Math.min(position.x, window.innerWidth - rect.width - 8)), y: Math.max(8, Math.min(position.y, window.innerHeight - rect.height - 8)) });
    (menu.current!.querySelector<HTMLElement>('[role="menuitem"]:not(:disabled)') || menu.current)?.focus();
  }, [position]);
  useEffect(() => {
    const outside = (event: PointerEvent) => { if (!menu.current?.contains(event.target as Node)) close.current(); };
    const dismiss = () => close.current();
    document.addEventListener('pointerdown', outside, true);
    window.addEventListener('resize', dismiss);
    window.addEventListener('blur', dismiss);
    document.addEventListener('scroll', dismiss, true);
    return () => {
      document.removeEventListener('pointerdown', outside, true);
      window.removeEventListener('resize', dismiss);
      window.removeEventListener('blur', dismiss);
      document.removeEventListener('scroll', dismiss, true);
    };
  }, []);
  const itemClass = 'flex w-full items-center gap-2 rounded-md px-3 py-2 type-label text-left hover:bg-accent focus-visible:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 disabled:pointer-events-none';
  return createPortal(<div ref={menu} role="menu" aria-label={uiText('节点操作')} tabIndex={-1}
    className="fixed z-50 min-w-44 max-w-[calc(100vw-16px)] rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-md outline-none"
    style={{ left: point.x, top: point.y }} onContextMenu={event => event.preventDefault()}
    onKeyDown={event => {
      if (event.key === 'Escape' || event.key === 'Tab') { event.preventDefault(); event.stopPropagation(); onClose(); return; }
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const items = Array.from(menu.current!.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)'));
      const current = items.indexOf(document.activeElement as HTMLButtonElement);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (current + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      items[next]?.focus();
    }}>
    {position.nodeId && <button type="button" role="menuitem" disabled={disabled} className={`${itemClass} text-destructive`} onClick={onDelete}>
      <Trash2 className="h-4 w-4 shrink-0" aria-hidden="true" />{uiText(grouped ? '删除分组及组内节点' : '删除节点')}
    </button>}
    {canUndo && <button type="button" role="menuitem" disabled={disabled} className={itemClass} onClick={onUndo}>
      <Undo2 className="h-4 w-4 shrink-0" aria-hidden="true" />{uiText('撤销删除')}
    </button>}
    {disabled && <p className="px-3 py-2 type-caption text-muted-foreground">{uiText('当前不可删除')}</p>}
  </div>, document.body);
}
