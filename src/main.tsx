import { render } from 'preact';
import './styles.css';
import { App } from './ui/App';

render(<App />, document.getElementById('app')!);

/** Keeps the page the full size between the status bar and the system buttons. */
function lockFrame() {
  const app = document.getElementById('app');
  if (!app || app.dataset.locked === '1') return;
  app.style.width = `${window.innerWidth}px`;
  app.style.height = `${window.innerHeight}px`;
  app.dataset.locked = '1';
}

function keepFieldVisible() {
  const viewport = window.visualViewport;
  const app = document.getElementById('app');
  if (!viewport || !app) return;
  const rect = app.getBoundingClientRect();
  const visibleBottom = viewport.offsetTop + viewport.height;
  const cover = Math.max(0, rect.bottom - visibleBottom);
  document.documentElement.style.setProperty('--keyboard-cover', `${cover}px`);
  document.documentElement.classList.toggle('keyboard', cover > 40);
  const active = document.activeElement;
  if (cover <= 40 || !(active instanceof HTMLElement) || !active.matches('input, textarea, select')) return;
  const shell = active.closest('.shell');
  if (!(shell instanceof HTMLElement)) return;
  const field = active.getBoundingClientRect();
  const limit = visibleBottom - 12;
  if (field.bottom > limit) shell.scrollTop += field.bottom - limit + 16;
}

lockFrame();
window.visualViewport?.addEventListener('resize', keepFieldVisible);
window.visualViewport?.addEventListener('scroll', keepFieldVisible);
document.addEventListener('focusin', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement) || !target.matches('input, textarea, select')) return;
  window.setTimeout(keepFieldVisible, 50);
});

if ('storage' in navigator && navigator.storage.persist) void navigator.storage.persist();

const inAndroidApp = 'Capacitor' in window;
if ('serviceWorker' in navigator && location.protocol !== 'file:' && import.meta.env.PROD && !inAndroidApp) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => undefined);
  });
}
