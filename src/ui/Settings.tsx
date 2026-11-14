import { useEffect, useRef, useState } from 'preact/hooks';
import { formatRef, REF_FORMATS } from '../refs';
import { actions, getSaveError, useStore } from '../store';
import type { Business } from '../types';
import { backupFileName, connectFolder, connectedFolder, downloadBlob, isNativeApp, readText, shrinkImage, val } from './util';

export function Settings() {
  const state = useStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState('');
  const [folder, setFolder] = useState<string | null>(null);
  useEffect(() => {
    if (!isNativeApp()) return;
    void connectedFolder().then(setFolder);
  }, []);
  const b = state.business;
  const bank = state.bank;
  const setB = (patch: Partial<Business>) => actions.setBusiness({ ...b, ...patch });
  const saveError = getSaveError();

  return (
    <section class="page-wrap">
      <h1>Settings</h1>
      {saveError && <div class="error">{saveError}</div>}

      <div class="card">
        <h2>Your business</h2>
        <label class="field">
          <span>Business / trading name</span>
          <input value={b.name} onInput={(e) => setB({ name: val(e) })} />
        </label>
        <label class="field">
          <span>Address</span>
          <textarea rows={3} value={b.address} onInput={(e) => setB({ address: val(e) })} />
        </label>
        <div class="grid2">
          <label class="field">
            <span>Postcode</span>
            <input value={b.postcode} autocapitalize="characters" onInput={(e) => setB({ postcode: val(e).toUpperCase() })} />
          </label>
          <label class="field">
            <span>Phone</span>
            <input type="tel" value={b.phone} onInput={(e) => setB({ phone: val(e) })} />
          </label>
          <label class="field">
            <span>Email</span>
            <input type="email" value={b.email} onInput={(e) => setB({ email: val(e) })} />
          </label>
          <label class="field">
            <span>Website</span>
            <input value={b.website} onInput={(e) => setB({ website: val(e) })} />
          </label>
          <label class="field">
            <span>Company number</span>
            <input value={b.companyNumber} onInput={(e) => setB({ companyNumber: val(e) })} />
          </label>
          <label class="field">
            <span>VAT number</span>
            <input value={b.vatNumber} onInput={(e) => setB({ vatNumber: val(e) })} />
          </label>
          <label class="field">
            <span>UTR (CIS)</span>
            <input value={b.utr} onInput={(e) => setB({ utr: val(e) })} />
          </label>
        </div>
        <label class="check">
          <input type="checkbox" checked={b.vatRegistered} onChange={(e) => setB({ vatRegistered: (e.target as HTMLInputElement).checked })} />
          VAT registered (leave off if you are not: VAT is then hidden everywhere)
        </label>
        <div class="field">
          <span>Logo</span>
          <div class="row">
            {b.logo && <img class="logo-thumb" src={b.logo} alt="Your logo" />}
            <label class="btn small">
              {b.logo ? 'Replace' : 'Upload logo'}
              <input
                type="file"
                accept="image/*"
                hidden
                onChange={async (e) => {
                  const f = (e.target as HTMLInputElement).files?.[0];
                  if (!f) return;
                  try {
                    const { dataUrl, ratio } = await shrinkImage(f);
                    setB({ logo: dataUrl, logoRatio: ratio });
                  } catch (err) {
                    setMsg(err instanceof Error ? err.message : 'Could not use that image.');
                  }
                }}
              />
            </label>
            {b.logo && (
              <button class="btn small ghost" onClick={() => setB({ logo: '' })}>
                Remove
              </button>
            )}
          </div>
        </div>
      </div>

      <div class="card">
        <h2>Invoice numbering</h2>
        <p class="hint">One running sequence across all clients. The next invoice you save gets the number below, then it counts up by one and never repeats.</p>
        <fieldset class="field radios">
          <legend>Reference format</legend>
          {REF_FORMATS.map((f) => (
            <label class="check" key={f.id}>
              <input
                type="radio"
                name="ref-format"
                checked={state.numbering.pattern === f.pattern}
                onChange={() => actions.setNumbering({ ...state.numbering, pattern: f.pattern })}
              />
              <span>
                {f.label}
                <small class="muted"> e.g. {formatRef(f.pattern, state.numbering.next, 'NE31 2EX', state.numbering.padding)}</small>
              </span>
            </label>
          ))}
        </fieldset>
        <div class="grid2">
          <label class="field">
            <span>Next invoice number</span>
            <input
              inputMode="numeric"
              value={String(state.numbering.next)}
              onInput={(e) => actions.setNumbering({ ...state.numbering, next: Number(val(e).replace(/\D/g, '')) || 1 })}
            />
          </label>
          <label class="field">
            <span>Digits (zero padded)</span>
            <select value={String(state.numbering.padding)} onChange={(e) => actions.setNumbering({ ...state.numbering, padding: Number(val(e)) })}>
              {[0, 3, 4, 5, 6].map((n) => (
                <option key={n} value={n}>
                  {n === 0 ? 'No padding' : `${n} digits`}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p class="hint">
          Next reference: <b>{formatRef(state.numbering.pattern, state.numbering.next, 'NE31 2EX', state.numbering.padding)}</b> (shown with an example postcode)
        </p>
      </div>

      <div class="card">
        <h2>Bank details</h2>
        <label class="field">
          <span>Account name</span>
          <input value={bank.accountName} onInput={(e) => actions.setBank({ ...bank, accountName: val(e) })} />
        </label>
        <div class="grid2">
          <label class="field">
            <span>Sort code</span>
            <input inputMode="numeric" placeholder="00-00-00" value={bank.sortCode} onInput={(e) => actions.setBank({ ...bank, sortCode: val(e) })} />
          </label>
          <label class="field">
            <span>Account number</span>
            <input inputMode="numeric" value={bank.accountNumber} onInput={(e) => actions.setBank({ ...bank, accountNumber: val(e) })} />
          </label>
        </div>
      </div>

      {isNativeApp() && (
        <div class="card">
          <h2>Trids apps folder</h2>
          <p class="hint">
            {folder
              ? `Finished invoices are saved in ${folder}.`
              : 'Choose the Trids apps folder in Internal storage. Every finished invoice is saved there from then on.'}
          </p>
          <button
            class="btn"
            onClick={() => {
              void connectFolder()
                .then((name) => {
                  if (!name) return;
                  setFolder(name);
                  setMsg(`Connected to ${name}.`);
                })
                .catch((err: unknown) => setMsg(err instanceof Error ? err.message : 'Could not open the folder picker.'));
            }}
          >
            {folder ? 'Change folder' : 'Choose Trids apps folder'}
          </button>
        </div>
      )}

      <div class="card">
        <h2>Your data</h2>
        <p class="hint">
          Everything is stored on this device only. To use the app on a second device (or protect against a lost phone), export a backup and import it there.
        </p>
        <div class="row wrap">
          <button
            class="btn"
            onClick={() => {
              void downloadBlob(new Blob([actions.exportJSON()], { type: 'application/json' }), backupFileName())
                .then((saved) => {
                  if (saved) setMsg('Backup downloaded.');
                })
                .catch((err: unknown) => setMsg(err instanceof Error ? err.message : 'Could not save the backup.'));
            }}
          >
            Export backup
          </button>
          <button class="btn" onClick={() => fileRef.current?.click()}>
            Import backup
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={async (e) => {
              const f = (e.target as HTMLInputElement).files?.[0];
              (e.target as HTMLInputElement).value = '';
              if (!f) return;
              if (!confirm('Importing replaces everything on this device with the backup. Continue?')) return;
              try {
                actions.importJSON(await readText(f));
                setMsg('Backup imported.');
              } catch (err) {
                setMsg(err instanceof Error ? err.message : 'Import failed.');
              }
            }}
          />
        </div>
        <div class="row wrap">
          <button class="btn ghost" onClick={() => (actions.loadSampleClients(), setMsg('Sample clients added.'))}>
            Add sample clients
          </button>
          <button
            class="btn danger"
            onClick={() => {
              if (confirm('Erase ALL data on this device (clients, invoices, settings)? Export a backup first.')) {
                actions.resetAll();
                setMsg('Everything erased.');
              }
            }}
          >
            Erase everything
          </button>
        </div>
        {msg && <p class="hint" role="status">{msg}</p>}
      </div>
    </section>
  );
}
