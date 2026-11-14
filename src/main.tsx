import { render } from 'preact';
import './styles.css';
import { App } from './ui/App';

render(<App />, document.getElementById('app')!);

if ('storage' in navigator && navigator.storage.persist) void navigator.storage.persist();

const inAndroidApp = 'Capacitor' in window;
if ('serviceWorker' in navigator && location.protocol !== 'file:' && import.meta.env.PROD && !inAndroidApp) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => undefined);
  });
}
