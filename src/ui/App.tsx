import { useEffect, useState } from 'preact/hooks';
import { currentSaveFolder, isNativeApp } from './util';
import { Clients } from './Clients';
import { Invoices } from './Invoices';
import { NewCertificate, SavedCertificates } from './Certificates';
import { NewInvoice } from './NewInvoice';
import { Settings } from './Settings';
import { Templates } from './Templates';

const INVOICE = [
  { path: '/new', label: 'New', comp: NewInvoice },
  { path: '/invoices', label: 'Invoices', comp: Invoices },
  { path: '/clients', label: 'Clients', comp: Clients },
  { path: '/templates', label: 'Templates', comp: Templates },
  { path: '/settings', label: 'Settings', comp: Settings },
] as const;

const CERT = [
  { path: '/certs', label: 'New', comp: NewCertificate },
  { path: '/certs-saved', label: 'Saved', comp: SavedCertificates },
  { path: '/settings', label: 'Settings', comp: Settings },
] as const;

const PATHS = new Set<string>([...INVOICE.map((route) => route.path), ...CERT.map((route) => route.path)]);

function currentPath(): string {
  const path = location.hash.replace(/^#/, '') || '/new';
  return PATHS.has(path) ? path : '/new';
}

function certMode(path: string): boolean {
  if (path.startsWith('/cert')) return true;
  return path === '/settings' && sessionStorage.getItem('desk-mode') === 'cert';
}

export function App() {
  const [path, setPath] = useState(currentPath);
  const [folder, setFolder] = useState('');
  useEffect(() => {
    if (!isNativeApp() && !(window as Window & { TridsPhone?: unknown }).TridsPhone) return;
    const refresh = () => {
      void currentSaveFolder().then(setFolder).catch(() => setFolder(''));
    };
    refresh();
    window.addEventListener('trids-resume', refresh);
    return () => window.removeEventListener('trids-resume', refresh);
  }, []);
  useEffect(() => {
    const on = () => {
      setPath(currentPath());
      document.querySelector('.shell')?.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  const certs = certMode(path);
  const routes = certs ? CERT : INVOICE;
  const Page = routes.find((route) => route.path === path)?.comp ?? (certs ? NewCertificate : NewInvoice);
  return (
    <div class="shell">
      <div class="modebar">
        <a href="#/new" class={certs ? '' : 'on'} onClick={() => sessionStorage.setItem('desk-mode', 'invoice')}>Invoice</a>
        <a href="#/certs" class={certs ? 'on' : ''} onClick={() => sessionStorage.setItem('desk-mode', 'cert')}>Certificate</a>
      </div>
      {folder && <p class="save-path">PDFs save to {folder}</p>}
      <nav class="nav" aria-label="Main">
        <div class="brand">{certs ? 'Certificates' : 'Invoice Desk'}</div>
        {routes.map((route) => (
          <a key={route.path} href={`#${route.path}`} class={route.path === path ? 'active' : ''} aria-current={route.path === path ? 'page' : undefined}>
            {route.label}
          </a>
        ))}
      </nav>
      <main>
        <Page />
      </main>
    </div>
  );
}
