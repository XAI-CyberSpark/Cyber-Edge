import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { act, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AppIcon, type AppIconName } from '../src/components/ui/AppIcon';

const dom = new JSDOM('<div id="root"></div>');
Object.assign(globalThis, { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true });
let reduced = false, hidden = false, now = 0, id = 0;
const listeners = new Set<() => void>();
Object.defineProperty(document, 'hidden', { get: () => hidden });
const matchMedia = () => ({ get matches() { return reduced; }, addEventListener: (_: string, fn: () => void) => listeners.add(fn), removeEventListener: (_: string, fn: () => void) => listeners.delete(fn) });
window.matchMedia = matchMedia as unknown as typeof window.matchMedia;
const frames = new Map<number, FrameRequestCallback>();
Object.assign(globalThis, {
  matchMedia,
  requestAnimationFrame: (callback: FrameRequestCallback) => { frames.set(++id, callback); return id; },
  cancelAnimationFrame: (key: number) => frames.delete(key),
});
function advance(count = 1) {
  for (let i = 0; i < count; i++) {
    now += 1000 / 60;
    const pending = [...frames.values()]; frames.clear();
    pending.forEach(callback => callback(now));
  }
}
const root = createRoot(document.getElementById('root')!);
const render = async (name: AppIconName, spinning = false, label?: string) => {
  await act(async () => root.render(<StrictMode><button aria-label="操作"><AppIcon name={name} size={18} spinning={spinning} label={label} /></button></StrictMode>));
};
const geometry = () => document.querySelector('path')!.getAttribute('d');
await render('play');
const svg = document.querySelector('svg');
const start = geometry();
assert.equal(frames.size, 0, 'Static mount must not run an animation loop');
assert.equal(svg!.getAttribute('aria-hidden'), 'true');
assert.equal(svg!.getAttribute('width'), '18');
await render('pause');
assert.equal(document.querySelector('svg'), svg, 'Keep the same SVG across state changes');
advance(6);
const halfway = geometry();
assert.notEqual(halfway, start, 'The path must morph, not just swap its label');
await render('play');
assert.equal(geometry(), halfway, 'Interrupting must start at the current geometry');
advance(180);
assert.equal(geometry(), start);
assert.equal(frames.size, 0, 'The scheduler must stop after settling');
console.log('PASS: real SVG morph, interruption, stable dimensions and idle scheduler.');

reduced = true;
await render('pause');
assert.notEqual(geometry(), start);
assert.equal(frames.size, 0, 'Reduced motion must change state without a morph loop');
console.log('PASS: system reduced-motion preference is honored.');

await render('loader-circle', true, '正在加载');
assert.ok(svg!.classList.contains('app-icon--spinning'));
assert.equal(svg!.getAttribute('role'), 'img');
assert.equal(svg!.querySelector('title')!.textContent, '正在加载');
await render('check');
assert.ok(!svg!.classList.contains('app-icon--spinning'));
assert.equal(svg!.getAttribute('aria-hidden'), 'true');
console.log('PASS: busy styling and accessible labels follow state.');

reduced = false;
await render('sun'); advance(2);
hidden = true;
await act(async () => document.dispatchEvent(new dom.window.Event('visibilitychange')));
assert.equal(frames.size, 0, 'Hiding a tab settles an in-flight morph');
hidden = false;
await render('moon'); advance(2);
reduced = true;
await act(async () => listeners.forEach(fn => fn()));
assert.equal(frames.size, 0, 'Changing the preference settles an in-flight morph');
reduced = false;
await render('sun'); advance(2);
await act(async () => root.unmount());
assert.equal(frames.size, 0, 'Unmount must cancel scheduled work');
assert.equal(listeners.size, 0);
console.log('PASS: hidden tabs, live preferences, StrictMode and unmount clean up the animation driver.');
