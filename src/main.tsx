import { render } from 'preact';
import './styles.css';
import { App } from './ui/App';

render(<App />, document.getElementById('app')!);

document.addEventListener('focusin', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement) || !target.matches('input, textarea, select')) return;
  window.setTimeout(() => target.scrollIntoView({ block: 'center', inline: 'nearest' }), 250);
});

if ('storage' in navigator && navigator.storage.persist) void navigator.storage.persist();

const inAndroidApp = 'Capacitor' in window;
if ('serviceWorker' in navigator && location.protocol !== 'file:' && import.meta.env.PROD && !inAndroidApp) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => undefined);
  });
}
