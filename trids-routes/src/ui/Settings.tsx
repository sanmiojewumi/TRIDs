import { actions, useStore } from '../store';
import { NavChoice } from './NavChoice';

export function Settings() {
  const state = useStore();
  const settings = state.settings;
  const set = (patch: Partial<typeof settings>) => actions.setSettings({ ...settings, ...patch });
  return (
    <section class="page-wrap">
      <h1>Settings</h1>
      <div class="card">
        <h2>Usual start</h2>
        <label class="field">
          <span>Start address</span>
          <input value={settings.startAddress} onInput={(event) => set({ startAddress: (event.target as HTMLInputElement).value })} />
        </label>
        <div class="grid2">
          <label class="field">
            <span>Usual set-off time</span>
            <input type="time" value={settings.departAt} onInput={(event) => set({ departAt: (event.target as HTMLInputElement).value })} />
          </label>
          <label class="field">
            <span>Usual time on site (minutes)</span>
            <input
              inputMode="numeric"
              value={String(settings.serviceMinutes)}
              onInput={(event) => set({ serviceMinutes: Math.max(0, Number((event.target as HTMLInputElement).value) || 0) })}
            />
          </label>
        </div>
        <p class="hint">New days start with these. On the day itself you can switch to your GPS location.</p>
      </div>
      <div class="card">
        <h2>Satnav</h2>
        <p class="hint">One choice for the whole route. It is used for every stop, and for the button that opens the arranged route.</p>
        <NavChoice value={settings.navApp} onChange={(navApp) => set({ navApp })} />
      </div>
      <div class="card">
        <h2>Install</h2>
        <p class="hint">On Android, install Trids Routes from the APK file. It is a normal app and does not need a browser.</p>
        <p class="hint">On iPhone, open this app in Safari, tap Share, then Add to Home Screen. Apple does not allow an install file without an Apple developer account and a Mac, so that home-screen app is the iPhone version.</p>
      </div>
    </section>
  );
}
