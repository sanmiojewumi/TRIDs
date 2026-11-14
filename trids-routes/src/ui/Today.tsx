import { useState } from 'preact/hooks';
import { driveMinutes, geocode } from '../geo';
import { appleMapsUrl, googleMapsUrl, wazeUrl } from '../nav';
import { optimiseRoute, windowFrom } from '../optimize';
import { actions, todayISO, useStore } from '../store';
import { formatTime, parseTime } from '../time';
import type { DayPlan, Stop } from '../types';
import { StopForm } from './StopForm';

export function Today() {
  const state = useStore();
  const [date, setDate] = useState(todayISO);
  const day = actions.day(date);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<Stop | null>(null);
  const [open, setOpen] = useState(false);

  const save = (next: DayPlan) => actions.saveDay({ ...next, optimized: false });

  const addStop = (stop: Stop) => {
    const stops = day.stops.some((item) => item.id === stop.id) ? day.stops.map((item) => (item.id === stop.id ? stop : item)) : [...day.stops, stop];
    save({ ...day, stops, eta: [], late: [], travel: [] });
    setEditing(null);
    setOpen(false);
  };

  const remove = (id: string) => save({ ...day, stops: day.stops.filter((stop) => stop.id !== id), eta: [], late: [], travel: [] });

  const plan = async () => {
    setError('');
    if (!day.startAddress.trim()) {
      setError('Enter the address you are starting from.');
      return;
    }
    const pending = day.stops.filter((stop) => stop.status === 'pending');
    if (!pending.length) {
      setError('Add a stop first.');
      return;
    }
    if (pending.some((stop) => !stop.address.trim())) {
      setError('Every stop needs an address.');
      return;
    }
    const depart = parseTime(day.departAt);
    if (depart == null) {
      setError('Enter the time you want to set off, like 08:00.');
      return;
    }
    setBusy(true);
    try {
      const done = day.stops.filter((stop) => stop.status !== 'pending');
      const originStop = [...done].reverse().find((stop) => stop.lat != null && stop.lon != null);
      const origin = originStop ? { lat: originStop.lat!, lon: originStop.lon! } : await geocode(day.startAddress);
      const leaveAt = originStop ? minutesNow() : depart;
      const located: Stop[] = [];
      for (const stop of pending) {
        const place = await geocode(stop.address);
        located.push({ ...stop, lat: place.lat, lon: place.lon });
      }
      const matrix = await driveMinutes([{ lat: origin.lat, lon: origin.lon }, ...located.map((stop) => ({ lat: stop.lat!, lon: stop.lon! }))]);
      const result = optimiseRoute(
        matrix,
        located.map((stop) => windowFrom(stop.windowStart, stop.windowEnd)),
        leaveAt,
        located.map((stop) => stop.serviceMinutes || state.settings.serviceMinutes),
      );
      const ordered = result.order.map((index) => located[index]);
      const eta = result.arrival.map((minute) => formatTime(minute));
      actions.saveDay({
        ...day,
        startAddress: day.startAddress.trim(),
        startLat: originStop ? day.startLat : origin.lat,
        startLon: originStop ? day.startLon : origin.lon,
        stops: [...done, ...ordered],
        travel: [...done.map(() => 0), ...result.travel],
        eta: [...done.map((_, index) => day.eta[index] ?? ''), ...eta],
        late: [...done.map(() => 0), ...result.late],
        optimized: true,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not plan the route.');
    } finally {
      setBusy(false);
    }
  };

  const doneCount = day.stops.filter((stop) => stop.status === 'done').length;

  return (
    <section class="page-wrap">
      <h1>Today’s route</h1>
      <div class="card">
        <label class="field">
          <span>Date</span>
          <input type="date" value={date} onInput={(event) => setDate((event.target as HTMLInputElement).value)} />
        </label>
        <div class="grid2">
          <label class="field">
            <span>Set off at</span>
            <input type="time" value={day.departAt} onInput={(event) => save({ ...day, departAt: (event.target as HTMLInputElement).value })} />
          </label>
          <label class="field">
            <span>Start from</span>
            <input value={day.startAddress} onInput={(event) => save({ ...day, startAddress: (event.target as HTMLInputElement).value, startLat: undefined, startLon: undefined })} />
          </label>
        </div>
        <p class="hint">Planning sends the addresses to OpenStreetMap to work out the shortest sensible order. Driving then opens Waze, Google Maps or Apple Maps.</p>
      </div>

      {day.stops.map((stop, index) => (
        <article class={`card stop ${stop.status}`} key={stop.id}>
          <div class="stop-head">
            <span class="seq">{index + 1}</span>
            <div>
              <strong>{stop.name || 'Client'}</strong>
              <div class="muted">{stop.address}</div>
            </div>
            {day.eta[index] && <b class={day.late[index] ? 'late' : 'ontime'}>{day.late[index] ? `${day.eta[index]} late` : day.eta[index]}</b>}
          </div>
          <div class="muted">
            {stop.windowStart || stop.windowEnd ? `Window ${stop.windowStart || 'any'}–${stop.windowEnd || 'any'}` : 'No time window'}
            {stop.phone ? ` · ${stop.phone}` : ''}
            {day.travel[index] ? ` · ${day.travel[index]} min drive` : ''}
          </div>
          {stop.notes && <p class="hint">{stop.notes}</p>}
          <div class="row wrap">
            {stop.phone && (
              <a class="btn small" href={`tel:${stop.phone.replace(/\s/g, '')}`}>
                Call
              </a>
            )}
            <a class="btn small" href={wazeUrl(stop)} target="_blank" rel="noreferrer">
              Waze
            </a>
            <a class="btn small" href={googleMapsUrl(stop)} target="_blank" rel="noreferrer">
              Google Maps
            </a>
            <a class="btn small" href={appleMapsUrl(stop)} target="_blank" rel="noreferrer">
              Apple Maps
            </a>
          </div>
          <div class="row wrap">
            <button class="btn small" onClick={() => actions.setStopStatus(date, stop.id, stop.status === 'done' ? 'pending' : 'done')}>
              {stop.status === 'done' ? 'Undo done' : 'Done'}
            </button>
            <button class="btn small" onClick={() => actions.setStopStatus(date, stop.id, stop.status === 'skipped' ? 'pending' : 'skipped')}>
              {stop.status === 'skipped' ? 'Undo skip' : 'Skip'}
            </button>
            <button
              class="btn small"
              onClick={() => {
                setEditing(stop);
                setOpen(true);
              }}
            >
              Edit
            </button>
            <button class="btn small danger" onClick={() => remove(stop.id)}>
              Remove
            </button>
          </div>
        </article>
      ))}

      {open && (
        <StopForm
          initial={editing}
          serviceMinutes={state.settings.serviceMinutes}
          onSave={addStop}
          onClose={() => {
            setOpen(false);
            setEditing(null);
          }}
        />
      )}

      {error && <div class="error">{error}</div>}
      <div class="sticky-actions">
        <button class="btn" onClick={() => { setEditing(null); setOpen(true); }}>
          Add stop
        </button>
        <button class="btn primary grow" disabled={busy} onClick={plan}>
          {busy ? 'Planning…' : 'Optimise route'}
        </button>
      </div>
      {day.stops.length > 0 && (
        <button
          class="btn"
          onClick={() => actions.saveDay({ ...day, finished: !day.finished })}
        >
          {day.finished ? 'Reopen this day' : `Finish day (${doneCount}/${day.stops.length} done)`}
        </button>
      )}
    </section>
  );
}

function minutesNow(): number {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}
