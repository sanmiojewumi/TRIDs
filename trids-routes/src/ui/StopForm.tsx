import { useState } from 'preact/hooks';
import { blankStop } from '../store';
import type { Stop } from '../types';

export function StopForm(props: { initial: Stop | null; serviceMinutes: number; onSave: (stop: Stop) => void; onClose: () => void }) {
  const [stop, setStop] = useState<Stop>(props.initial ?? blankStop(props.serviceMinutes));
  const [error, setError] = useState('');
  const set = (patch: Partial<Stop>) => setStop((current) => ({ ...current, ...patch, lat: undefined, lon: undefined }));

  const save = () => {
    if (!stop.address.trim()) {
      setError('Enter the address.');
      return;
    }
    props.onSave({ ...stop, name: stop.name.trim(), phone: stop.phone.trim(), address: stop.address.trim(), notes: stop.notes.trim() });
  };

  return (
    <div class="card">
      <h2>{props.initial ? 'Edit stop' : 'New stop'}</h2>
      <label class="field">
        <span>Client name</span>
        <input value={stop.name} onInput={(event) => set({ name: (event.target as HTMLInputElement).value })} />
      </label>
      <label class="field">
        <span>Phone</span>
        <input type="tel" inputMode="tel" value={stop.phone} onInput={(event) => set({ phone: (event.target as HTMLInputElement).value })} />
      </label>
      <label class="field">
        <span>Address</span>
        <textarea rows={2} value={stop.address} placeholder="Street, town, postcode" onInput={(event) => set({ address: (event.target as HTMLTextAreaElement).value })} />
      </label>
      <div class="grid2">
        <label class="field">
          <span>Arrive after</span>
          <input type="time" value={stop.windowStart} onInput={(event) => set({ windowStart: (event.target as HTMLInputElement).value })} />
        </label>
        <label class="field">
          <span>Arrive before</span>
          <input type="time" value={stop.windowEnd} onInput={(event) => set({ windowEnd: (event.target as HTMLInputElement).value })} />
        </label>
      </div>
      <label class="field">
        <span>Time on site (minutes)</span>
        <input
          inputMode="numeric"
          value={String(stop.serviceMinutes)}
          onInput={(event) => set({ serviceMinutes: Math.max(0, Number((event.target as HTMLInputElement).value) || 0) })}
        />
      </label>
      <label class="field">
        <span>Notes</span>
        <input value={stop.notes} onInput={(event) => set({ notes: (event.target as HTMLInputElement).value })} />
      </label>
      {error && <div class="error">{error}</div>}
      <div class="row">
        <button class="btn" onClick={props.onClose}>
          Cancel
        </button>
        <button class="btn primary grow" onClick={save}>
          Save stop
        </button>
      </div>
    </div>
  );
}
