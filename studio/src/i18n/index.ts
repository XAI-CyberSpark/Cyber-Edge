import { useSyncExternalStore } from 'react';
import english from './en.json';
export type UiLanguage = 'zh' | 'en';
const storageKey = 'cyber-edge-language';
function savedLanguage(): UiLanguage {
  try { return localStorage.getItem(storageKey) === 'en' ? 'en' : 'zh'; } catch { return 'zh'; }
}
let language: UiLanguage = savedLanguage();
const listeners = new Set<() => void>();
export const getUiLanguage = () => language;
export function setUiLanguage(next: UiLanguage) {
  if (next !== 'zh' && next !== 'en') return;
  language = next;
  try { localStorage.setItem(storageKey, next); } catch { /* Session-only in restricted storage. */ }
  if (typeof document !== 'undefined') document.documentElement.lang = next === 'zh' ? 'zh-CN' : 'en';
  listeners.forEach(listener => listener());
}
export function useUiLanguage() {
  return useSyncExternalStore(listener => { listeners.add(listener); return () => listeners.delete(listener); }, getUiLanguage, () => 'zh' as const);
}
const dictionary: Record<string, string> = english;
const patterns = Object.entries(dictionary).filter(([key]) => /\{\d+\}/.test(key) && /[\u3400-\u9fff]/u.test(key)).sort(([a], [b]) => b.replace(/\{\d+\}/g, '').length - a.replace(/\{\d+\}/g, '').length).map(([key, translation]) => {
  const indices: number[] = [];
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const source = escaped.replace(/\\\{(\d+)\\\}/g, (_, index) => { indices.push(Number(index)); return '([\\s\\S]*?)'; });
  return { regex: new RegExp('^' + source + '$'), translation, indices };
});
function translateCopy(key: string): string {
  if (dictionary[key]) return dictionary[key];
  for (const pattern of patterns) {
    const match = pattern.regex.exec(key);
    if (match) return pattern.translation.replace(/\{(\d+)\}/g, (token, i) => {
      const index = pattern.indices.indexOf(Number(i)); return index < 0 ? token : match[index + 1];
    });
  }
  return key;
}
/** Localize explicitly registered interface copy. Unknown and user-authored content stays unchanged. */
export function uiText<T>(value: T, params?: readonly unknown[]): T {
  if (typeof value !== 'string') return value;
  const key = value.trim();
  if (!key) return value;
  const translated = language === 'en' ? translateCopy(key) : key;
  const text = params ? translated.replace(/\{(\d+)\}/g, (match, i) => String(params[Number(i)] ?? match)) : translated;
  const display = value.slice(0, value.length - value.trimStart().length) + text + value.slice(value.trimEnd().length);
  return display as T;
}
export const uiLocale = () => language === 'en' ? 'en-US' : 'zh-CN';

