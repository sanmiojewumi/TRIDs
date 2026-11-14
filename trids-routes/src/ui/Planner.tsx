import { useEffect, useState } from 'preact/hooks';
import logo from '../assets/trids-logo.png';
import { driveMinutes, drivePath, lookupAddress, remember, reverseGeocode } from '../geo';
import type { Place } from '../geo';
import { groupRoutes, routeWhen, suggestRouteName } from '../groups';
import { readGps } from '../location';
import { googleRouteUrl, stopNavUrl } from '../nav';
import { optimiseRoute, windowFrom } from '../optimize';
import { actions, blankStop, todayISO, useStore } from '../store';
import { formatTime, parseTime } from '../time';
import type { DayPlan, NavApp, Stop } from '../types';
import { RouteMap } from './RouteMap';
import { Settings } from './Settings';
import { StopForm } from './StopForm';

type Ask = { target: 'start' | string; query: string; message: string; suggestions: Place[] };

export function Planner() {
  const state = useStore();
  const [routeId, setRouteId] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [copying, setCopying] = useState(false);
  const [setup, setSetup] = useState(false);
  const [form, setForm] = useState(false);
  const [editing, setEditing] = useState<Stop | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [notes, setNotes] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [ask, setAsk] = useState<Ask | null>(null);
  const [focus, setFocus] = useState<{ lat: number; lon: number; token: number } | null>(null);

  const route = routeId ? actions.route(routeId) : null;
  const selectedStop = route?.stops.find((stop) => stop.id === selected) ?? null;

  useEffect(() => {
    if (routeId && !actions.route(routeId)) setRouteId(null);
  }, [routeId, state.days]);

  const openRoute = (id: string) => {
    setRouteId(id);
    setSelected(null);
    setMenu(false);
    setError('');
    setAsk(null);
  };

  const ensureRoute = (): DayPlan => {
    const current = routeId ? actions.route(routeId) : null;
    if (current) return current;
    const created = actions.createRoute(todayISO(), suggestRouteName(todayISO(), state.days));
    setRouteId(created.id);
    return created;
  };

  const patch = (next: DayPlan, clearPlan = true) => {
    actions.saveRoute(clearPlan ? { ...next, optimized: false, routeLine: undefined, returnMinutes: undefined, eta: [], late: [], travel: [] } : next);
  };

  const addStop = (stop: Stop) => {
    const current = ensureRoute();
    const stops = current.stops.some((item) => item.id === stop.id) ? current.stops.map((item) => (item.id === stop.id ? stop : item)) : [...current.stops, stop];
    patch({ ...current, stops });
    setEditing(null);
    setForm(false);
    setQuery('');
  };

  const quickAdd = () => {
    const address = query.trim();
    if (!address) {
      setEditing(null);
      setForm(true);
      return;
    }
    const stop = blankStop(state.settings.serviceMinutes);
    addStop({ ...stop, address });
  };

  const duplicate = (stop: Stop) => {
    if (!route) return;
    const copy = { ...stop, id: crypto.randomUUID(), status: 'pending' as const, doneAt: undefined };
    const index = route.stops.findIndex((item) => item.id === stop.id);
    const stops = [...route.stops];
    stops.splice(index + 1, 0, copy);
    patch({ ...route, stops });
    setSelected(copy.id);
  };

  const useMyLocation = async (recenterOnly: boolean) => {
    setError('');
    setBusy(true);
    try {
      const position = await readGps();
      setFocus({ lat: position.lat, lon: position.lon, token: Date.now() });
      if (recenterOnly && route?.stops.length) return;
      const place = await reverseGeocode(position.lat, position.lon);
      const current = ensureRoute();
      patch({ ...current, startMode: 'gps', startAddress: place.label, startLat: place.lat, startLon: place.lon });
      actions.setSettings({ ...state.settings, startMode: 'gps' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read your location.');
    } finally {
      setBusy(false);
    }
  };

  const acceptPlace = (place: Place) => {
    if (!ask || !route) return;
    remember(ask.query, place);
    if (ask.target === 'start') patch({ ...route, startMode: 'address', startAddress: place.label, startLat: place.lat, startLon: place.lon });
    else patch({ ...route, stops: route.stops.map((stop) => (stop.id === ask.target ? { ...stop, lat: place.lat, lon: place.lon, placeLabel: place.label } : stop)) });
    setAsk(null);
    void plan();
  };

  const plan = async () => {
    const current = routeId ? actions.route(routeId) : null;
    setError('');
    if (!current) {
      setError('Add a stop first.');
      return;
    }
    if (current.startMode !== 'gps' && !current.startAddress.trim()) {
      setError('Set a start address, or use your location.');
      setSetup(true);
      return;
    }
    const pending = current.stops.filter((stop) => stop.status === 'pending');
    if (!pending.length) {
      setError('Add a stop first.');
      return;
    }
    if (pending.some((stop) => !stop.address.trim())) {
      setError('Every stop needs an address.');
      return;
    }
    const depart = parseTime(current.departAt);
    if (depart == null) {
      setError('Enter the time you want to set off, like 08:00.');
      setSetup(true);
      return;
    }
    setBusy(true);
    try {
      const done = current.stops.filter((stop) => stop.status !== 'pending');
      const originStop = [...done].reverse().find((stop) => stop.lat != null && stop.lon != null);
      let origin = originStop ? { lat: originStop.lat!, lon: originStop.lon!, label: current.startAddress } : null;
      if (!origin) {
        if (current.startMode === 'gps' && current.startLat == null) {
          setError('Tap the location button so the route can start from where you are.');
          return;
        }
        if (current.startLat != null && current.startLon != null) origin = { lat: current.startLat, lon: current.startLon, label: current.startAddress };
        else {
          const found = await lookupAddress(current.startAddress);
          if (!found.ok) {
            setAsk({ target: 'start', query: current.startAddress, message: found.message, suggestions: found.suggestions });
            return;
          }
          origin = found.place;
        }
      }
      const located: Stop[] = [];
      for (const stop of pending) {
        if (stop.lat != null && stop.lon != null) {
          located.push(stop);
          continue;
        }
        const found = await lookupAddress(stop.address);
        if (!found.ok) {
          actions.saveRoute({ ...current, optimized: false, routeLine: undefined, stops: current.stops.map((item) => located.find((ready) => ready.id === item.id) ?? item) });
          setAsk({ target: stop.id, query: stop.address, message: found.message, suggestions: found.suggestions });
          return;
        }
        located.push({ ...stop, lat: found.place.lat, lon: found.place.lon, placeLabel: found.place.label });
      }
      const leaveAt = originStop ? minutesNow() : depart;
      const points = [{ lat: origin.lat, lon: origin.lon }, ...located.map((stop) => ({ lat: stop.lat!, lon: stop.lon! }))];
      const matrix = await driveMinutes(points, state.settings.avoidTolls);
      const result = optimiseRoute(
        matrix,
        located.map((stop) => windowFrom(stop.windowStart, stop.windowEnd)),
        leaveAt,
        located.map((stop) => stop.serviceMinutes || state.settings.serviceMinutes),
      );
      const ordered = result.order.map((index) => located[index]);
      const last = result.order[result.order.length - 1];
      const routeLine = await drivePath(pointsForLine(origin, ordered), state.settings.avoidTolls);
      actions.saveRoute({
        ...current,
        startAddress: current.startMode === 'gps' ? current.startAddress : origin.label || current.startAddress.trim(),
        startLat: originStop ? current.startLat : origin.lat,
        startLon: originStop ? current.startLon : origin.lon,
        stops: [...done, ...ordered],
        travel: [...done.map(() => 0), ...result.travel],
        eta: [...done.map((_, index) => current.eta[index] ?? ''), ...result.arrival.map((minute) => formatTime(minute))],
        late: [...done.map(() => 0), ...result.late],
        routeLine,
        returnMinutes: last == null ? undefined : matrix[last + 1][0],
        optimized: true,
      });
      setAsk(null);
      setSelected(ordered[0]?.id ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not plan the route.');
    } finally {
      setBusy(false);
    }
  };

  const copyFrom = (sourceId: string) => {
    const source = actions.route(sourceId);
    if (!source) return;
    const current = ensureRoute();
    const copies = source.stops.map((stop) => ({ ...stop, id: crypto.randomUUID(), status: 'pending' as const, doneAt: undefined }));
    patch({ ...current, stops: [...current.stops, ...copies] });
    setCopying(false);
  };

  const pins = (route?.stops ?? []).flatMap((stop, index) => (stop.lat == null || stop.lon == null ? [] : [{ id: stop.id, lat: stop.lat, lon: stop.lon, label: String(index + 1) }]));
  const launch = route ? routeLaunch(route, state.settings.navApp) : null;

  return (
    <div class="map-app">
      <RouteMap
        start={route?.startLat != null && route.startLon != null ? { lat: route.startLat, lon: route.startLon, label: shortPlace(route.startAddress) } : route?.routeLine?.[0]}
        stops={pins}
        line={route?.routeLine ?? []}
        selected={selected ?? undefined}
        focus={focus}
        onSelect={(id) => {
          setSelected(id);
          setNotes(false);
        }}
      />
      <button class="float menu-btn" type="button" aria-label="Routes" onClick={() => setMenu(true)}>
        <span />
        <span />
        <span />
      </button>
      <div class="float-col">
        <button class="float" type="button" aria-label="Optimise route" disabled={busy} onClick={() => void plan()}>
          {busy ? '…' : '↻'}
        </button>
        <button class="float" type="button" aria-label="My location" disabled={busy} onClick={() => void useMyLocation(true)}>
          ⌖
        </button>
      </div>
      {route?.departAt && <div class="depart-chip">{route.departAt}</div>}

      <section class="sheet" aria-label="Stops">
        <div class="grab" />
        {error && <p class="error">{error}</p>}
        {ask && (
          <div class="ask-block">
            <h2>Choose the right place</h2>
            <p class="hint">{ask.message}</p>
            {ask.suggestions.map((place) => (
              <button key={place.label} type="button" class="btn place" onClick={() => acceptPlace(place)}>
                {place.label}
              </button>
            ))}
            <button
              type="button"
              class="btn"
              onClick={() => {
                const target = ask.target;
                setAsk(null);
                if (target !== 'start' && route) {
                  const stop = route.stops.find((item) => item.id === target);
                  if (stop) {
                    setEditing(stop);
                    setForm(true);
                  }
                } else setSetup(true);
              }}
            >
              {ask.suggestions.length ? 'None of these — edit the address' : 'Edit the address'}
            </button>
          </div>
        )}
        {!ask && selectedStop && route && (
          <StopSheet
            route={route}
            stop={selectedStop}
            navApp={state.settings.navApp}
            notesOpen={notes}
            onNotes={() => setNotes((open) => !open)}
            onClose={() => setSelected(null)}
            onEdit={() => {
              setEditing(selectedStop);
              setForm(true);
            }}
            onDuplicate={() => duplicate(selectedStop)}
            onRemove={() => {
              patch({ ...route, stops: route.stops.filter((item) => item.id !== selectedStop.id) });
              setSelected(null);
            }}
          />
        )}
        {!ask && !selectedStop && (
          <>
            <form
              class="search"
              onSubmit={(event) => {
                event.preventDefault();
                quickAdd();
              }}
            >
              <span aria-hidden="true">⌕</span>
              <input value={query} placeholder="Tap to add stops" aria-label="Add a stop" onInput={(event) => setQuery((event.target as HTMLInputElement).value)} />
              <button type="button" class="icon-btn" aria-label="Route setup" onClick={() => setSetup(true)}>
                ⋮
              </button>
            </form>
            {route && route.stops.length > 0 ? (
              <ul class="stop-list">
                {route.stops.map((stop, index) => (
                  <li key={stop.id}>
                    <button type="button" class={`stop-row ${stop.status}`} onClick={() => setSelected(stop.id)}>
                      <span class="seq">{index + 1}</span>
                      <span>
                        <strong>{stopTitle(stop)}</strong>
                        <small>{stop.name && stop.name !== stopTitle(stop) ? `${stop.name} · ` : ''}{route.eta[index] || 'Not planned yet'}</small>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <div class="empty">
                <div class="empty-mark" aria-hidden="true">+</div>
                <p>Add your first stops to start creating your route</p>
              </div>
            )}
            <button class="btn primary" type="button" onClick={() => { setEditing(null); setForm(true); }}>
              + Add stops
            </button>
            {!route?.optimized && (
              <button class="btn" type="button" disabled={busy} onClick={() => void plan()}>
                {busy ? 'Planning…' : 'Optimise route'}
              </button>
            )}
            {route?.optimized && launch?.href && (
              <a class="btn primary" href={launch.href} target="_blank" rel="noreferrer">
                {launch.label}
              </a>
            )}
            <button class="btn ghost" type="button" onClick={() => setCopying(true)}>
              Copy stops from a past route
            </button>
          </>
        )}
      </section>

      {menu && (
        <>
          <button class="scrim" type="button" aria-label="Close menu" onClick={() => setMenu(false)} />
          <aside class="drawer">
            <div class="who">
              <img src={logo} alt="" />
              <div>
                <strong>Trids Routes</strong>
                <span>Gas and Plumbing</span>
              </div>
              <button class="icon-btn" type="button" aria-label="Settings" onClick={() => { setMenu(false); setSettingsOpen(true); }}>
                ⚙
              </button>
            </div>
            <div class="drawer-list">
              {state.days.length === 0 && <p class="hint">No routes yet. Create one for today or another day.</p>}
              {groupRoutes(state.days, todayISO()).map((group) => (
                <section key={group.title}>
                  <h2>{group.title}</h2>
                  {group.routes.map((item) => {
                    const when = routeWhen(item);
                    return (
                      <button key={item.id} type="button" class={item.id === routeId ? 'day-row on' : 'day-row'} onClick={() => openRoute(item.id)}>
                        <span>{when.day}</span>
                        <strong>{when.label}</strong>
                      </button>
                    );
                  })}
                </section>
              ))}
            </div>
            <button
              class="btn primary create"
              type="button"
              onClick={() => {
                setMenu(false);
                setCreating(true);
              }}
            >
              + Create route
            </button>
          </aside>
        </>
      )}

      {creating && (
        <CreateRoute
          existing={state.days}
          onClose={() => setCreating(false)}
          onConfirm={(date, name) => {
            const created = actions.createRoute(date, name);
            openRoute(created.id);
            setCreating(false);
          }}
        />
      )}
      {settingsOpen && <Settings onBack={() => setSettingsOpen(false)} />}
      {form && (
        <div class="screen">
          <StopForm
            initial={editing}
            serviceMinutes={state.settings.serviceMinutes}
            onSave={addStop}
            onClose={() => {
              setForm(false);
              setEditing(null);
            }}
          />
        </div>
      )}
      {setup && route && (
        <Setup
          route={route}
          busy={busy}
          onClose={() => setSetup(false)}
          onChange={(next) => patch(next)}
          onGps={() => void useMyLocation(false)}
        />
      )}
      {setup && !route && (
        <Setup
          route={null}
          busy={busy}
          onClose={() => setSetup(false)}
          onChange={() => undefined}
          onGps={() => void useMyLocation(false)}
        />
      )}
      {copying && (
        <div class="screen">
          <header class="screen-bar">
            <button type="button" class="icon-btn" aria-label="Close" onClick={() => setCopying(false)}>×</button>
            <h1>Copy stops</h1>
          </header>
          <div class="screen-body">
            {state.days.filter((item) => item.stops.length && item.id !== routeId).length === 0 && <p class="hint">Past routes with stops will show up here.</p>}
            {state.days
              .filter((item) => item.stops.length && item.id !== routeId)
              .map((item) => (
                <button key={item.id} type="button" class="btn place" onClick={() => copyFrom(item.id)}>
                  {routeWhen(item).day} · {routeWhen(item).label} · {item.stops.length} stops
                </button>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StopSheet(props: {
  route: DayPlan;
  stop: Stop;
  navApp: NavApp;
  notesOpen: boolean;
  onNotes: () => void;
  onClose: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onRemove: () => void;
}) {
  const index = props.route.stops.findIndex((item) => item.id === props.stop.id);
  const eta = props.route.eta[index];
  return (
    <div class="stop-sheet">
      <div class="sheet-title">
        <h2>{stopTitle(props.stop)}</h2>
        <button type="button" class="icon-btn" aria-label="Close stop" onClick={props.onClose}>×</button>
      </div>
      <p class="meta">
        <i />
        {index + 1}/{props.route.stops.length}
        {eta ? `, ${eta}` : ''}
        {props.route.late[index] ? ' · late' : ''}
      </p>
      <div class="action-row">
        <a class="act go" href={stopNavUrl(props.navApp, props.stop)} target="_blank" rel="noreferrer">Navigate</a>
        <button type="button" class={props.stop.status === 'skipped' ? 'act on' : 'act'} onClick={() => actions.setStopStatus(props.route.id, props.stop.id, props.stop.status === 'skipped' ? 'pending' : 'skipped')}>
          Failed
        </button>
        <button type="button" class={props.stop.status === 'done' ? 'act on' : 'act'} onClick={() => actions.setStopStatus(props.route.id, props.stop.id, props.stop.status === 'done' ? 'pending' : 'done')}>
          Delivered
        </button>
      </div>
      {props.stop.phone && (
        <a class="link-row" href={`tel:${props.stop.phone.replace(/\s/g, '')}`}>
          Call {props.stop.phone}
        </a>
      )}
      <button type="button" class="link-row" onClick={props.onNotes}>Add notes</button>
      {props.notesOpen && (
        <textarea
          rows={3}
          value={props.stop.notes}
          aria-label="Notes"
          onInput={(event) => {
            const notes = (event.target as HTMLTextAreaElement).value;
            actions.saveRoute({ ...props.route, stops: props.route.stops.map((item) => (item.id === props.stop.id ? { ...item, notes } : item)) });
          }}
        />
      )}
      {!props.notesOpen && props.stop.notes && <p class="hint">{props.stop.notes}</p>}
      <p class="link-row quiet">{townOf(props.stop.address)}</p>
      <p class="link-row quiet">ID {index + 1}</p>
      <button type="button" class="link-row" onClick={props.onEdit}>Edit stop</button>
      <button type="button" class="link-row" onClick={props.onDuplicate}>Duplicate stop</button>
      <button type="button" class="link-row danger" onClick={props.onRemove}>Remove stop</button>
    </div>
  );
}

function CreateRoute(props: { existing: DayPlan[]; onConfirm: (date: string, name: string) => void; onClose: () => void }) {
  const today = todayISO();
  const tomorrow = shiftDate(today, 1);
  const [date, setDate] = useState(today);
  const [custom, setCustom] = useState(false);
  const [name, setName] = useState(suggestRouteName(today, props.existing));

  const choose = (next: string) => {
    setDate(next);
    setName(suggestRouteName(next, props.existing));
    setCustom(false);
  };

  return (
    <div class="screen">
      <header class="screen-bar">
        <button type="button" class="icon-btn" aria-label="Close" onClick={props.onClose}>×</button>
      </header>
      <div class="screen-body">
        <h1>Create route</h1>
        <label class="field">
          <span>Route name (optional)</span>
          <input value={name} onInput={(event) => setName((event.target as HTMLInputElement).value)} />
        </label>
        <span class="field"><span>Select date</span></span>
        <button type="button" class={date === today && !custom ? 'date-row on' : 'date-row'} onClick={() => choose(today)}>
          <span>Today</span>
          <strong>{labelDate(today)}</strong>
        </button>
        <button type="button" class={date === tomorrow && !custom ? 'date-row on' : 'date-row'} onClick={() => choose(tomorrow)}>
          <span>Tomorrow</span>
          <strong>{labelDate(tomorrow)}</strong>
        </button>
        <label class={custom ? 'date-row on' : 'date-row'}>
          <span>Pick a date</span>
          <input
            type="date"
            value={custom ? date : ''}
            onInput={(event) => {
              const next = (event.target as HTMLInputElement).value;
              if (!next) return;
              setCustom(true);
              setDate(next);
              setName(suggestRouteName(next, props.existing));
            }}
          />
        </label>
      </div>
      <button class="btn primary dock" type="button" onClick={() => props.onConfirm(date, name)}>
        Confirm
      </button>
    </div>
  );
}

function Setup(props: { route: DayPlan | null; busy: boolean; onClose: () => void; onChange: (route: DayPlan) => void; onGps: () => void }) {
  const route = props.route;
  return (
    <div class="screen">
      <header class="screen-bar">
        <button type="button" class="icon-btn" aria-label="Close" onClick={props.onClose}>×</button>
        <h1>Route setup</h1>
      </header>
      <div class="screen-body">
        {route ? (
          <>
            <label class="field">
              <span>Set off at</span>
              <input type="time" value={route.departAt} onInput={(event) => props.onChange({ ...route, departAt: (event.target as HTMLInputElement).value })} />
            </label>
            <span class="field"><span>Start from</span></span>
            <div class="choice">
              <button type="button" class={route.startMode === 'gps' ? 'btn' : 'btn primary'} onClick={() => props.onChange({ ...route, startMode: 'address', startLat: undefined, startLon: undefined })}>
                Preferred address
              </button>
              <button type="button" class={route.startMode === 'gps' ? 'btn primary' : 'btn'} disabled={props.busy} onClick={props.onGps}>
                My location
              </button>
            </div>
            {route.startMode === 'gps' ? (
              <p class="hint">{route.startLat != null ? route.startAddress : 'Allow location when the phone asks.'}</p>
            ) : (
              <input aria-label="Preferred address" value={route.startAddress} onInput={(event) => props.onChange({ ...route, startMode: 'address', startAddress: (event.target as HTMLInputElement).value, startLat: undefined, startLon: undefined })} />
            )}
          </>
        ) : (
          <button class="btn primary" type="button" disabled={props.busy} onClick={props.onGps}>
            Start from my location
          </button>
        )}
      </div>
    </div>
  );
}

function routeLaunch(day: DayPlan, navApp: NavApp): { href?: string; label: string } {
  const pending = day.stops.filter((stop) => stop.status === 'pending');
  const depart = day.routeLine?.[0];
  const origin = { lat: depart?.lat ?? day.startLat, lon: depart?.lon ?? day.startLon, address: day.startAddress };
  if (navApp === 'waze') {
    const next = pending[0];
    return { href: next ? stopNavUrl('waze', next) : undefined, label: 'Open next stop in Waze' };
  }
  const whole = googleRouteUrl(origin, pending);
  return { href: whole?.url, label: 'Open all stops in Google Maps' };
}

function pointsForLine(origin: { lat: number; lon: number }, ordered: Stop[]) {
  return [{ lat: origin.lat, lon: origin.lon }, ...ordered.map((stop) => ({ lat: stop.lat!, lon: stop.lon! }))];
}

function minutesNow(): number {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

function shortPlace(address: string): string {
  const part = address.split(',')[0]?.trim();
  return part && part.length < 42 ? part : 'Start';
}

const POSTCODE = /\b([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})\b/i;

function stopTitle(stop: Stop): string {
  const match = stop.address.match(POSTCODE);
  const street = stop.address.split(',')[0]?.trim() || stop.address;
  if (!match) return stop.name || street || 'Stop';
  const code = `${match[1]} ${match[2]}`.toUpperCase();
  const road = street.replace(match[0], '').replace(/,\s*$/, '').trim();
  return road ? `${code}, ${road}` : code;
}

function townOf(address: string): string {
  const parts = address.split(',').map((part) => part.trim()).filter(Boolean);
  return parts[1] || parts[0] || address;
}

function shiftDate(iso: string, days: number): string {
  const [year, month, day] = iso.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function labelDate(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}
