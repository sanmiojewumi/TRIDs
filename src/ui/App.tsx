import { useEffect, useState } from 'preact/hooks';
import { Clients } from './Clients';
import { Invoices } from './Invoices';
import { NewInvoice } from './NewInvoice';
import { Settings } from './Settings';
import { Templates } from './Templates';

const ROUTES = [
  { path: '/new', label: 'New', comp: NewInvoice },
  { path: '/invoices', label: 'Invoices', comp: Invoices },
  { path: '/clients', label: 'Clients', comp: Clients },
  { path: '/templates', label: 'Templates', comp: Templates },
  { path: '/settings', label: 'Settings', comp: Settings },
] as const;

function currentPath(): string {
  const p = location.hash.replace(/^#/, '') || '/new';
  return ROUTES.some((r) => r.path === p) ? p : '/new';
}

export function App() {
  const [path, setPath] = useState(currentPath);
  useEffect(() => {
    const on = () => {
      setPath(currentPath());
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  const Page = ROUTES.find((r) => r.path === path)!.comp;
  return (
    <div class="shell">
      <nav class="nav" aria-label="Main">
        <div class="brand">Invoice Desk</div>
        {ROUTES.map((r) => (
          <a key={r.path} href={`#${r.path}`} class={r.path === path ? 'active' : ''} aria-current={r.path === path ? 'page' : undefined}>
            {r.label}
          </a>
        ))}
      </nav>
      <main>
        <Page />
      </main>
    </div>
  );
}
