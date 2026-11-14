import { useEffect, useRef, useState } from 'preact/hooks';
import { driveMinutes, drivePath, geocode } from '../geo';
import { googleRouteUrl, stopNavUrl } from '../nav';
import { optimiseRoute, windowFrom } from '../optimize';
import { actions, todayISO, useStore } from '../store';
import { formatTime, parseTime } from '../time';
import type { DayPlan, NavApp, Stop } from '../types';
import { NavChoice } from './NavChoice';
import { RouteMap } from './RouteMap';
import { StopForm } from './StopForm';

export function Today() {
  const state = useStore();
  const [date, setDate] = useState(todayISO);
  const day = actions.day(date);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<Stop | null>(null);
  const [open, setOpen] = useState(false);
  const [arranged, setArranged] = useState(0);
  const preview = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (arranged) preview.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [arranged]);

  const save = (next: DayPlan) => actions.saveDay({ ...next, optimized: false, routeLine: undefined });

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
      const routeLine = await drivePath([{ lat: origin.lat, lon: origin.lon }, ...ordered.map((stop) => ({ lat: stop.lat!, lon: stop.lon! }))]);
      actions.saveDay({
        ...day,
        startAddress: day.startAddress.trim(),
        startLat: originStop ? day.startLat : origin.lat,
        startLon: originStop ? day.startLon : origin.lon,
        stops: [...done, ...ordered],
        travel: [...done.map(() => 0), ...result.travel],
        eta: [...done.map((_, index) => day.eta[index] ?? ''), ...eta],
        late: [...done.map(() => 0), ...result.late],
        routeLine,
        optimized: true,
      });
      setArranged((value) => value + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not plan the route.');
    } finally {
      setBusy(false);
    }
  };

  const doneCount = day.stops.filter((stop) => stop.status === 'done').length;
  const launch = routeLaunch(day, state.settings.navApp);

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
        <p class="hint">Optimise first. The map shows the order before any satnav opens.</p>
      </div>

      {day.optimized && <RoutePreview day={day} preview={preview} navApp={state.settings.navApp} onNavApp={(navApp) => actions.setSettings({ ...state.settings, navApp })} />}

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
            <a class="btn small" href={stopNavUrl(state.settings.navApp, stop)} target="_blank" rel="noreferrer">
              Navigate
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
        {day.optimized && launch.href ? (
          <a class="btn primary grow" href={launch.href} target="_blank" rel="noreferrer">
            {launch.short}
          </a>
        ) : (
          <button class="btn primary grow" disabled={busy} onClick={plan}>
            {busy ? 'Planning…' : 'Optimise route'}
          </button>
        )}
      </div>
      {day.optimized && (
        <button class="btn" disabled={busy} onClick={plan}>
          {busy ? 'Planning…' : 'Optimise again'}
        </button>
      )}
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

function routeLaunch(day: DayPlan, navApp: NavApp): { href?: string; label: string; short: string; note?: string } {
  const pending = day.stops.filter((stop) => stop.status === 'pending');
  const depart = day.routeLine?.[0];
  const origin = { lat: depart?.lat ?? day.startLat, lon: depart?.lon ?? day.startLon, address: day.startAddress };
  if (navApp === 'waze') {
    const next = pending[0];
    return {
      href: next ? stopNavUrl('waze', next) : undefined,
      label: 'Open next stop in Waze',
      short: 'Open in Waze',
      note: 'Waze takes one stop at a time, using this order. Google Maps can open every stop in one go.',
    };
  }
  const whole = googleRouteUrl(origin, pending);
  return {
    href: whole?.url,
    label: 'Open all stops in Google Maps',
    short: 'Open in Google Maps',
    note: whole && whole.sent < whole.total ? `Google Maps opens the first ${whole.sent} stops. The rest stay in this list.` : undefined,
  };
}

function RoutePreview(props: { day: DayPlan; preview: preact.RefObject<HTMLDivElement | null>; navApp: NavApp; onNavApp: (app: NavApp) => void }) {
  const launch = routeLaunch(props.day, props.navApp);
  const depart = props.day.routeLine?.[0];
  const drive = props.day.travel.reduce((sum, minutes) => sum + (minutes || 0), 0);
  const last = [...props.day.eta].reverse().find((time) => time);
  const late = props.day.late.filter((minutes) => minutes > 0).length;
  const pins = props.day.stops.flatMap((stop, index) => (stop.lat == null || stop.lon == null ? [] : [{ lat: stop.lat, lon: stop.lon, label: String(index + 1) }]));

  return (
    <div class="card" ref={props.preview}>
      <h2>Arranged route</h2>
      <p class="hint">
        {props.day.stops.length} stops · {drive} min driving{last ? ` · last arrival ${last}` : ''}
        {late ? ` · ${late} late` : ''}. This is the order before a satnav opens.
      </p>
      {props.day.routeLine && props.day.routeLine.length > 1 && <RouteMap start={depart} stops={pins} line={props.day.routeLine} />}
      <NavChoice value={props.navApp} onChange={props.onNavApp} />
      {launch.href && (
        <a class="btn primary" href={launch.href} target="_blank" rel="noreferrer">
          {launch.label}
        </a>
      )}
      {launch.note && <p class="hint">{launch.note}</p>}
    </div>
  );
}

function minutesNow(): number {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}
