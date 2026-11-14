import { useEffect, useState } from 'preact/hooks';
import { History } from './History';
import { Settings } from './Settings';
import { Today } from './Today';

const ROUTES = [
  { path: '/today', label: 'Today' },
  { path: '/history', label: 'History' },
  { path: '/settings', label: 'Settings' },
] as const;

function currentPath(): string {
  const path = location.hash.replace(/^#/, '') || '/today';
  return ROUTES.some((route) => route.path === path) ? path : '/today';
}

export function App() {
  const [path, setPath] = useState(currentPath);
  useEffect(() => {
    const onHash = () => setPath(currentPath());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  return (
    <div class="shell">
      <main>
        {path === '/today' && <Today />}
        {path === '/history' && <History />}
        {path === '/settings' && <Settings />}
      </main>
      <nav class="nav" aria-label="Main">
        <div class="brand">Trids Routes</div>
        {ROUTES.map((route) => (
          <a key={route.path} href={`#${route.path}`} class={route.path === path ? 'active' : ''} aria-current={route.path === path ? 'page' : undefined}>
            {route.label}
          </a>
        ))}
      </nav>
    </div>
  );
}
