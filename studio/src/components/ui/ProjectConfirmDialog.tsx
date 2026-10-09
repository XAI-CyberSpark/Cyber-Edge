import { uiText, useUiLanguage  } from '@/i18n';
import { useRef } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { LoaderCircle, X } from 'lucide-react';

interface Props {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  confirmVariant?: 'primary' | 'destructive';
  cancelLabel?: string;
  busy?: boolean;
  error?: string;
  onCancel: () => void;
  onConfirm: () => void;
}

export function ProjectConfirmDialog({ open, title, description, confirmLabel, confirmVariant = 'destructive', cancelLabel = '取消', busy = false, error, onCancel, onConfirm }: Props) {
  useUiLanguage();
  const cancel = useRef<HTMLButtonElement>(null);
  const trigger = useRef<HTMLElement | null>(null);
  return <Dialog.Root open={open} onOpenChange={value => { if (!value && !busy) onCancel(); }}>
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm" />
      <Dialog.Content
        data-project-dialog
        className="fixed left-1/2 top-1/2 z-[61] w-[calc(100%_-_2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-card p-6 text-foreground shadow-2xl focus:outline-none"
        onOpenAutoFocus={event => { event.preventDefault(); trigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; cancel.current?.focus(); }}
        onCloseAutoFocus={event => { event.preventDefault(); if (trigger.current?.isConnected) trigger.current.focus(); }}
        onEscapeKeyDown={event => { if (busy) event.preventDefault(); }}
        onPointerDownOutside={event => event.preventDefault()}
      >
        <Dialog.Title className="pr-8 type-panel   break-words">{uiText(title)}</Dialog.Title>
        <Dialog.Description className="mt-3 type-body  text-muted-foreground break-words">{uiText(description)}</Dialog.Description>
        <button aria-label={uiText("关闭对话框")} disabled={busy} onClick={onCancel} className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><X size={16} /></button>
        {error && <p role="alert" className="mt-3 type-body text-red-500">{uiText(error)}</p>}
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button ref={cancel} disabled={busy} onClick={onCancel} className="rounded-lg border border-border px-4 py-2 type-label hover:bg-accent disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{uiText(cancelLabel)}</button>
          <button disabled={busy} onClick={onConfirm} className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 type-label disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${confirmVariant === 'primary' ? 'bg-primary text-primary-foreground hover:bg-primary/90' : 'bg-red-600 text-white hover:bg-red-500'}`}>{busy && <LoaderCircle size={15} className="animate-spin" />}{uiText(busy ? uiText("正在删除…") : confirmLabel)}</button>
        </div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
