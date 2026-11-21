import { useState } from 'preact/hooks';
import { certFileName, renderCertPdf } from '../cert-layout';
import { certTitle, emptyAppliance, emptyCert, emptyFga, type CertDraft } from '../certs';
import { actions, useStore } from '../store';
import type { CertAppliance, CertKind, CertificateRecord, CheckResult, FgaReading } from '../types';
import { downloadToDevice, isNativeApp, val } from './util';

const KINDS: CertKind[] = ['landlord', 'service', 'repair'];

function todayISO(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function FgaBlock(props: { title: string; value: FgaReading | undefined; onChange: (value: FgaReading) => void }) {
  const reading = props.value ?? emptyFga();
  const set = (key: keyof FgaReading, raw: string) => props.onChange({ ...reading, [key]: raw });
  return (
    <div>
      <h2>{props.title}</h2>
      <label class="field">
        <span>CO (ppm)</span>
        <input inputMode="decimal" value={reading.co} onInput={(event) => set('co', val(event))} />
      </label>
      <label class="field">
        <span>CO2 (%)</span>
        <input inputMode="decimal" value={reading.co2} onInput={(event) => set('co2', val(event))} />
      </label>
      <label class="field">
        <span>Ratio</span>
        <input inputMode="decimal" value={reading.ratio} onInput={(event) => set('ratio', val(event))} />
      </label>
    </div>
  );
}

function CheckField(props: { label: string; value: CheckResult; onChange: (value: CheckResult) => void }) {
  return (
    <label class="field">
      <span>{props.label}</span>
      <select value={props.value} onChange={(event) => props.onChange(val(event) as CheckResult)}>
        <option value="pass">Satisfactory</option>
        <option value="fail">Not satisfactory</option>
        <option value="na">N/A</option>
      </select>
    </label>
  );
}

export function NewCertificate() {
  return <Certificates />;
}

export function SavedCertificates() {
  return <Certificates saved />;
}

function Certificates(props: { saved?: boolean }) {
  const state = useStore();
  const [kind, setKind] = useState<CertKind>('landlord');
  const [draft, setDraft] = useState<CertDraft>(() => emptyCert('landlord', todayISO()));
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<CertificateRecord | null>(null);

  const set = (patch: Partial<CertDraft>) => setDraft((current) => ({ ...current, ...patch }));
  const chooseKind = (next: CertKind) => {
    setKind(next);
    setDraft(emptyCert(next, draft.date || todayISO()));
    setNotice('');
    setError('');
  };

  const saveAndDownload = async () => {
    if (!draft.customerName.trim() || !draft.customerAddress.trim()) {
      setError('Enter the customer name and address.');
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const record = actions.saveCertificate(draft);
      const blob = renderCertPdf(record.data);
      const stored = await downloadToDevice(blob, certFileName(record.data));
      setNotice(stored.where ? `Saved in the app and on the phone: ${stored.where}.` : 'Saved in the app.');
      setDraft(emptyCert(kind, todayISO()));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the certificate.');
    } finally {
      setBusy(false);
    }
  };

  const saveExisting = async (record: CertificateRecord) => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const stored = await downloadToDevice(renderCertPdf(record.data), certFileName(record.data));
      setNotice(stored.where ? `PDF saved to ${stored.where}.` : 'PDF saved.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the PDF.');
    } finally {
      setBusy(false);
    }
  };

  if (props.saved) {
    return (
      <section class="page-wrap">
        <h1>Certificates</h1>
        {error && <div class="error">{error}</div>}
        {notice && <p class="notice">{notice}</p>}
        {state.certificates.length === 0 && <p class="empty">No certificates yet. Make one from Certificate, then New.</p>}
        <ul class="list">
          {state.certificates.map((record) => (
            <li key={record.id}>
              <div class="list-item static">
                <button class="open-row" type="button" onClick={() => setOpen(record)}>
                  <strong>{record.data.ref}</strong>
                  <div class="muted">{certTitle(record.data.kind)}</div>
                  <div class="muted small">{record.data.customerName} · {record.data.date}</div>
                </button>
                <button class="btn small" type="button" disabled={busy} onClick={() => void saveExisting(record)}>Save to phone</button>
              </div>
            </li>
          ))}
        </ul>
        {open && (
          <div class="overlay" role="dialog" aria-modal="true" aria-label="Certificate">
            <header class="overlay-bar">
              <button class="btn ghost" type="button" onClick={() => setOpen(null)}>Close</button>
              <div class="overlay-title"><strong>{open.data.ref}</strong></div>
            </header>
            <div class="overlay-body page-wrap">
              <p>{certTitle(open.data.kind)}</p>
              <p class="hint">{open.data.customerName}<br />{open.data.customerAddress}<br />{open.data.postcode}</p>
              <button class="btn primary" type="button" disabled={busy} onClick={() => void saveExisting(open)}>Save PDF to phone</button>
              <button class="btn danger" type="button" onClick={() => { actions.deleteCertificate(open.id); setOpen(null); }}>Delete</button>
            </div>
          </div>
        )}
      </section>
    );
  }

  const updateAppliance = (index: number, patch: Partial<CertAppliance>) => {
    set({ appliances: draft.appliances.map((item, i) => (i === index ? { ...item, ...patch } : item)) });
  };

  return (
    <section class="page-wrap">
      <h1>New certificate</h1>
      <div class="choice-row">
        {KINDS.map((item) => (
          <button key={item} type="button" class={kind === item ? 'btn primary' : 'btn'} onClick={() => chooseKind(item)}>
            {item === 'landlord' ? 'Gas safety' : item === 'service' ? 'Service' : 'Repair'}
          </button>
        ))}
      </div>
      <p class="hint">{certTitle(kind)}. The PDF uses your blue theme, logo, and Gas Safe ID from Settings.</p>
      {error && <div class="error">{error}</div>}
      {notice && <p class="notice">{notice}</p>}
      <div class="card">
        <h2>{kind === 'landlord' ? 'Landlord and property' : 'Customer'}</h2>
        <label class="field"><span>Name</span><input value={draft.customerName} onInput={(event) => set({ customerName: val(event) })} /></label>
        <label class="field"><span>Address</span><textarea rows={3} value={draft.customerAddress} onInput={(event) => set({ customerAddress: val(event) })} /></label>
        <div class="grid2">
          <label class="field"><span>Postcode</span><input value={draft.postcode} autocapitalize="characters" onInput={(event) => set({ postcode: val(event).toUpperCase() })} /></label>
          <label class="field"><span>Date</span><input type="date" value={draft.date} onInput={(event) => set({ date: val(event) })} /></label>
          {kind === 'landlord' && (
            <label class="field"><span>Tenant</span><input value={draft.tenantName} onInput={(event) => set({ tenantName: val(event) })} /></label>
          )}
          {kind !== 'repair' && (
            <label class="field"><span>Next due</span><input type="date" value={draft.nextDue} onInput={(event) => set({ nextDue: val(event) })} /></label>
          )}
        </div>
      </div>
      {kind !== 'repair' && draft.appliances.map((appliance, index) => (
        <div class="card" key={index}>
          <h2>Appliance {index + 1}</h2>
          <div class="grid2">
            <label class="field"><span>Type</span><input value={appliance.applianceType} onInput={(event) => updateAppliance(index, { applianceType: val(event) })} /></label>
            <label class="field"><span>Location</span><input value={appliance.location} onInput={(event) => updateAppliance(index, { location: val(event) })} /></label>
            <label class="field"><span>Make</span><input value={appliance.make} onInput={(event) => updateAppliance(index, { make: val(event) })} /></label>
            <label class="field"><span>Model</span><input value={appliance.model} onInput={(event) => updateAppliance(index, { model: val(event) })} /></label>
            <label class="field"><span>Serial</span><input value={appliance.serial} onInput={(event) => updateAppliance(index, { serial: val(event) })} /></label>
            <label class="field">
              <span>Flue</span>
              <select value={appliance.flue} onChange={(event) => updateAppliance(index, { flue: val(event) })}>
                {['RS', 'OF', 'FL', 'BF', 'CF', 'NA'].map((flue) => <option key={flue} value={flue}>{flue}</option>)}
              </select>
            </label>
          </div>
          <CheckField label="Operating" value={appliance.operating} onChange={(operating) => updateAppliance(index, { operating })} />
          <CheckField label="Safety device" value={appliance.safetyDevice} onChange={(safetyDevice) => updateAppliance(index, { safetyDevice })} />
          <CheckField label="Ventilation" value={appliance.ventilation} onChange={(ventilation) => updateAppliance(index, { ventilation })} />
          <CheckField label="Flue condition" value={appliance.flueCondition} onChange={(flueCondition) => updateAppliance(index, { flueCondition })} />
          <label class="field"><span>Combustion reading</span><input value={appliance.combustion} placeholder="CO, CO2, ratio" onInput={(event) => updateAppliance(index, { combustion: val(event) })} /></label>
          <label class="field">
            <span>Safe to use</span>
            <select value={appliance.safe} onChange={(event) => updateAppliance(index, { safe: val(event) as 'yes' | 'no' })}>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </label>
          <label class="field"><span>Defects and remedial action</span><textarea rows={2} value={appliance.defects} onInput={(event) => updateAppliance(index, { defects: val(event) })} /></label>
          {draft.appliances.length > 1 && (
            <button class="btn danger" type="button" onClick={() => set({ appliances: draft.appliances.filter((_, i) => i !== index) })}>Remove appliance</button>
          )}
        </div>
      ))}
      {kind !== 'repair' && (
        <button class="btn" type="button" onClick={() => set({ appliances: [...draft.appliances, emptyAppliance()] })}>Add appliance</button>
      )}
      {kind !== 'repair' && (
        <div class="card">
          <h2>Installation checks</h2>
          <CheckField label="Tightness test" value={draft.tightness} onChange={(tightness) => set({ tightness })} />
          <CheckField label="Pipework" value={draft.pipework} onChange={(pipework) => set({ pipework })} />
          <CheckField label="Emergency control" value={draft.emergencyControl} onChange={(emergencyControl) => set({ emergencyControl })} />
          <label class="field">
            <span>CO alarm</span>
            <select value={draft.coAlarm} onChange={(event) => set({ coAlarm: val(event) as CertDraft['coAlarm'] })}>
              <option value="yes">Fitted and working</option>
              <option value="no">Not satisfactory</option>
              <option value="na">N/A</option>
            </select>
          </label>
          {kind === 'service' && (
            <>
              <label class="field"><span>Gas rate</span><input value={draft.gasRate} onInput={(event) => set({ gasRate: val(event) })} /></label>
              <label class="field"><span>Burner pressure</span><input value={draft.burnerPressure} onInput={(event) => set({ burnerPressure: val(event) })} /></label>
            </>
          )}
        </div>
      )}
      {kind !== 'landlord' && (
        <div class="card">
          <h2>{kind === 'repair' ? 'Repair' : 'Service notes'}</h2>
          <label class="field"><span>Fault reported</span><textarea rows={2} value={draft.faultReported} onInput={(event) => set({ faultReported: val(event) })} /></label>
          <label class="field"><span>Work carried out</span><textarea rows={3} value={draft.workDone} onInput={(event) => set({ workDone: val(event) })} /></label>
          <label class="field"><span>Parts fitted</span><textarea rows={2} value={draft.partsFitted} onInput={(event) => set({ partsFitted: val(event) })} /></label>
        </div>
      )}
      <div class="card">
        <h2>FGA readings</h2>
        <FgaBlock title="Low" value={draft.fgaLow} onChange={(fgaLow) => set({ fgaLow })} />
        <FgaBlock title="High" value={draft.fgaHigh} onChange={(fgaHigh) => set({ fgaHigh })} />
      </div>
      <div class="card">
        <label class="check">
          <input type="checkbox" checked={draft.warningNotice} onChange={(event) => set({ warningNotice: (event.target as HTMLInputElement).checked })} />
          Warning notice attached
        </label>
        <label class="field"><span>Notes</span><textarea rows={2} value={draft.notes} onInput={(event) => set({ notes: val(event) })} /></label>
        <label class="field"><span>Engineer name</span><input value={draft.engineerName} placeholder={state.business.name} onInput={(event) => set({ engineerName: val(event) })} /></label>
      </div>
      <button class="btn primary" type="button" disabled={busy} onClick={() => void saveAndDownload()}>
        {isNativeApp() ? 'Save certificate and PDF' : 'Save certificate'}
      </button>
    </section>
  );
}
