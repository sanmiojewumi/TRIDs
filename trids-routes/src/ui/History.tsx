import { useState } from 'preact/hooks';
import { useStore } from '../store';
import type { DayPlan } from '../types';
import { RouteMap } from './RouteMap';

export function History() {
  const state = useStore();
  const [open, setOpen] = useState<DayPlan | null>(null);
  const days = state.days.filter((day) => day.stops.length > 0);
  return (
    <section class="page-wrap">
      <h1>Past routes</h1>
      {days.length === 0 && <p class="hint">Finished days are kept on this phone. Plan a route and tap Finish day.</p>}
      {days.map((day) => {
        const done = day.stops.filter((stop) => stop.status === 'done').length;
        return (
          <button class="card history" key={day.date} onClick={() => setOpen(day)}>
            <strong>{formatDate(day.date)}</strong>
            <span class="muted">
              {day.stops.length} stops · {done} done{day.finished ? ' · finished' : ''}
            </span>
          </button>
        );
      })}
      {open && (
        <div class="card">
          <h2>{formatDate(open.date)}</h2>
          <p class="hint">
            Set off {open.departAt} from {open.startAddress}
          </p>
          {open.routeLine && open.routeLine.length > 1 && (
            <RouteMap
              start={open.routeLine[0]}
              line={open.routeLine}
              stops={open.stops.flatMap((stop, index) => (stop.lat == null || stop.lon == null ? [] : [{ lat: stop.lat, lon: stop.lon, label: String(index + 1) }]))}
            />
          )}
          <ol class="history-list">
            {open.stops.map((stop) => (
              <li key={stop.id}>
                <strong>{stop.name || stop.address}</strong>
                <div class="muted">
                  {stop.address}
                  {stop.status === 'done' ? ' · done' : stop.status === 'skipped' ? ' · skipped' : ''}
                  {open.eta[open.stops.indexOf(stop)] ? ` · ${open.eta[open.stops.indexOf(stop)]}` : ''}
                </div>
              </li>
            ))}
          </ol>
          <button class="btn" onClick={() => setOpen(null)}>
            Close
          </button>
        </div>
      )}
    </section>
  );
}

function formatDate(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}
