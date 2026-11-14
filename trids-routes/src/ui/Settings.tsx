import { actions, useStore } from '../store';
import type { NavApp } from '../types';

export function Settings(props: { onBack: () => void }) {
  const state = useStore();
  const settings = state.settings;
  const set = (patch: Partial<typeof settings>) => actions.setSettings({ ...settings, ...patch });
  const nav: NavApp = settings.navApp === 'waze' ? 'google' : 'waze';
  return (
    <div class="screen">
      <header class="screen-bar">
        <button type="button" class="icon-btn" aria-label="Back" onClick={props.onBack}>←</button>
        <h1>Settings</h1>
      </header>
      <div class="screen-body prefs">
        <h2>Route preferences</h2>
        <button type="button" class="pref" onClick={() => set({ navApp: nav })}>
          <span>Navigation app</span>
          <strong>{settings.navApp === 'waze' ? 'Waze' : 'Google Maps'}</strong>
        </button>
        <label class="pref">
          <span>Average time at stop</span>
          <input
            inputMode="numeric"
            aria-label="Average time at stop in minutes"
            value={String(settings.serviceMinutes)}
            onInput={(event) => set({ serviceMinutes: Math.max(0, Number((event.target as HTMLInputElement).value) || 0) })}
          />
          <em>min</em>
        </label>
        <button type="button" class="pref" onClick={() => set({ vehicle: settings.vehicle === 'car' ? 'van' : 'car' })}>
          <span>Vehicle type</span>
          <strong>{settings.vehicle === 'van' ? 'Van' : 'Car'}</strong>
        </button>
        <label class="pref toggle">
          <span>
            Avoid tolls
            <small>Save costs by avoiding toll roads</small>
          </span>
          <input type="checkbox" checked={settings.avoidTolls} onChange={(event) => set({ avoidTolls: (event.target as HTMLInputElement).checked })} />
        </label>
        <h2>Usual start</h2>
        <label class="pref">
          <span>Start address</span>
          <input value={settings.startAddress} onInput={(event) => set({ startAddress: (event.target as HTMLInputElement).value })} />
        </label>
        <label class="pref">
          <span>Set-off time</span>
          <input type="time" value={settings.departAt} onInput={(event) => set({ departAt: (event.target as HTMLInputElement).value })} />
        </label>
        <p class="hint">New routes start with these. On the map, the ⋮ menu can switch a route to your GPS location. Avoid tolls is sent to the road router when it accepts that option.</p>
      </div>
    </div>
  );
}