import type { ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { uiText, useUiLanguage } from '@/i18n';
import './catalog-chrome.css';

export function CatalogToolbar({ search, add, filters, count, source, actions, loading = false }: {
  search: ReactNode; add?: ReactNode; filters: ReactNode; count: number | null; source: ReactNode; actions?: ReactNode; loading?: boolean;
}) {
  useUiLanguage();
  return <header className="catalog-toolbar">
    <div className="catalog-search-row">{search}{add}</div>
    <div className="catalog-filter-row">{filters}</div>
    <div className="catalog-summary type-caption">
      <span aria-live="polite">{count == null ? uiText(loading ? "正在加载…" : "结果暂不可用") : uiText("共 {0} 项", [count.toLocaleString()])}</span>
      <div className="catalog-source">{source}{actions}</div>
    </div>
  </header>;
}

export function CatalogPagination({ page, pages, pageSize, previousDisabled, nextDisabled, onPrevious, onNext, previousLabel, nextLabel, note, className = '' }: {
  page: number; pages?: number; pageSize?: number; previousDisabled: boolean; nextDisabled: boolean; onPrevious: () => void; onNext: () => void;
  previousLabel: string; nextLabel: string; note?: ReactNode; className?: string;
}) {
  useUiLanguage();
  return <footer className={`catalog-pagination ${className}`}>
    {note && <p className="catalog-page-note type-caption">{note}</p>}
    <span className="type-caption">{pageSize ? uiText("每页 {0} 项", [pageSize]) : uiText("第 {0} 页", [page])}</span>
    <div className="catalog-page-actions type-caption">
      <button type="button" aria-label={uiText(previousLabel)} disabled={previousDisabled} onClick={onPrevious}><ChevronLeft size={16}/><span className="sr-only">{uiText("上一页")}</span></button>
      <span>{pages == null ? page : `${page} / ${pages}`}</span>
      <button type="button" aria-label={uiText(nextLabel)} disabled={nextDisabled} onClick={onNext}><ChevronRight size={16}/><span className="sr-only">{uiText("下一页")}</span></button>
    </div>
  </footer>;
}
