import { useEffect, useState } from 'preact/hooks';
import { chooseSaveFolder, listPhoneFolders, type PhoneFolderList } from './util';

export function FolderPick(props: { onClose: () => void; onChosen: (label: string) => void }) {
  const [list, setList] = useState<PhoneFolderList | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const open = (path = '') => {
    setBusy(true);
    setError('');
    void listPhoneFolders(path)
      .then((next) => {
        setList(next);
        if (next.needsAccess) setError('Turn on Allow access to manage all files, then open this list again.');
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Could not open the folders.'))
      .finally(() => setBusy(false));
  };

  useEffect(() => {
    open();
  }, []);

  return (
    <div class="overlay" role="dialog" aria-modal="true" aria-label="Choose folder">
      <header class="overlay-bar">
        <button class="btn ghost" type="button" onClick={props.onClose}>Close</button>
        <div class="overlay-title"><strong>Choose folder</strong></div>
      </header>
      <div class="overlay-body page-wrap">
        <p class="hint">{list?.label || 'Internal storage'}</p>
        {error && <div class="error">{error}</div>}
        {list?.needsAccess && (
          <button class="btn primary" type="button" onClick={() => window.location.assign('trids://allow-files')}>Allow file access</button>
        )}
        {list?.parent && (
          <button class="btn" type="button" disabled={busy} onClick={() => open(list.parent)}>Up one folder</button>
        )}
        <ul class="list">
          {(list?.folders ?? []).map((folder) => (
            <li key={folder.path}>
              <button class="list-item" type="button" disabled={busy} onClick={() => open(folder.path)}>
                <strong>{folder.name}</strong>
                <span class="chev">Open</span>
              </button>
            </li>
          ))}
        </ul>
        {list && !list.folders.length && !list.needsAccess && <p class="empty">No folders inside this one.</p>}
        {list && !list.needsAccess && (
          <button
            class="btn primary"
            type="button"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void chooseSaveFolder(list.path)
                .then((name) => props.onChosen(name))
                .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Could not use that folder.'))
                .finally(() => setBusy(false));
            }}
          >
            Use this folder
          </button>
        )}
      </div>
    </div>
  );
}
