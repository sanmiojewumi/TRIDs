"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { AddressField } from "@/components/AddressField";
import type { MapPin } from "@/components/MapPane";
import { ApiError, api, nowSec } from "@/lib/client";
import {
  defaultUnit,
  formatClock,
  formatDistance,
  formatDuration,
  formatWhen,
  SATNAVS,
  satnavUrl,
  routeTitle,
  telHref,
  todayISO,
  type DistanceUnit,
  type Satnav,
} from "@/lib/format";
import { parseClock } from "@/lib/optimize";
import { parseStopLines } from "@/lib/parseStops";
import { blankStop, freshCopy, reschedulePlan } from "@/lib/plan";
import { samplePlan } from "@/lib/sample";
import { InstallCard } from "@/components/InstallCard";
import type { Place, RouteBreak, RoutePlan, RouteResult, Stop, StopStatus } from "@/lib/types";
import { validatePlan } from "@/lib/validate";

const MapPane = dynamic(() => import("@/components/MapPane"), {
  ssr: false,
  loading: () => <div className="map-fallback" />,
});

const STORAGE = "trids.routes.v1";
const UNIT_KEY = "trids.unit";

function emptyPlan(): RoutePlan {
  const date = todayISO();
  return {
    id: crypto.randomUUID(),
    name: routeTitle(date),
    date,
    startAddress: "",
    startLat: null,
    startLng: null,
    startTime: "08:00",
    roundTrip: true,
    endAddress: "",
    endLat: null,
    endLng: null,
    endTime: "",
  defaultServiceMin: 5,
  status: "open",
  completedAt: null,
  stops: [],
    breaks: [],
    sequence: [],
    result: null,
  };
}

function mergeSequence(plan: RoutePlan, optimized: string[]): string[] {
  const status = (id: string) => plan.stops.find((stop) => stop.id === id)?.status;
  const done = plan.sequence.filter((id) => status(id) === "done");
  const skipped = plan.sequence.filter((id) => status(id) === "skipped");
  const leftover = plan.sequence.filter((id) => status(id) === "pending" && !optimized.includes(id));
  return [...new Set([...done, ...optimized, ...leftover, ...skipped])];
}

function reorderPending(plan: RoutePlan, fromId: string, toIndex: number): RoutePlan {
  const pending = plan.sequence.filter((id) => plan.stops.find((stop) => stop.id === id)?.status === "pending");
  const index = pending.indexOf(fromId);
  if (index < 0 || toIndex < 0 || toIndex >= pending.length || index === toIndex) return plan;
  const next = pending.slice();
  const [item] = next.splice(index, 1);
  next.splice(toIndex, 0, item);
  const done = plan.sequence.filter((id) => plan.stops.find((stop) => stop.id === id)?.status === "done");
  const skipped = plan.sequence.filter((id) => plan.stops.find((stop) => stop.id === id)?.status === "skipped");
  return { ...plan, sequence: [...done, ...next, ...skipped] };
}

function windowLabel(stop: Stop): string {
  const clock = (value: string) => {
    const minutes = parseClock(value);
    return minutes == null ? value : formatClock(minutes * 60);
  };
  if (stop.arrivalMode === "before" && stop.arriveBefore) return `Before ${clock(stop.arriveBefore)}`;
  if (stop.arrivalMode === "after" && stop.arriveAfter) return `After ${clock(stop.arriveAfter)}`;
  if (stop.arrivalMode === "between" && stop.arriveAfter && stop.arriveBefore) {
    return `${clock(stop.arriveAfter)}–${clock(stop.arriveBefore)}`;
  }
  return "Anytime";
}

function savingsCopy(result: RouteResult): string | null {
  if (result.enteredDriveSec == null || result.enteredLateSec == null || result.locked) return null;
  const savedDrive = result.enteredDriveSec - result.driveSec;
  const savedLate = result.enteredLateSec - result.lateSec;
  if (savedLate > 60 && savedDrive >= -60) return "Fits arrival windows the entered order missed.";
  if (savedDrive >= 60 && result.lateSec <= result.enteredLateSec) {
    return `Saves ${formatDuration(savedDrive)} of driving versus the order you entered.`;
  }
  return null;
}

export default function Planner() {
  const [plans, setPlans] = useState<RoutePlan[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [mode, setMode] = useState<"loading" | "account" | "browser">("loading");
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved");
  const [banner, setBanner] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [unit, setUnit] = useState<DistanceUnit>("km");
  const [satnav, setSatnav] = useState<Satnav>("google");
  const [draft, setDraft] = useState<Stop | null>(null);
  const [draftIsNew, setDraftIsNew] = useState(false);
  const [paste, setPaste] = useState("");
  const [showPaste, setShowPaste] = useState(false);
  const [showBreak, setShowBreak] = useState(false);
  const [pinDrop, setPinDrop] = useState(false);
  const [stale, setStale] = useState<Record<string, boolean>>({});
  const menuRef = useRef<HTMLDetailsElement>(null);
  const saved = useRef<Record<string, string>>({});
  const serverIds = useRef(new Set<string>());
  const plansRef = useRef(plans);
  plansRef.current = plans;
  const active = plans.find((plan) => plan.id === activeId) ?? null;

  useEffect(() => {
    const storedUnit = localStorage.getItem(UNIT_KEY);
    setUnit(storedUnit === "mi" || storedUnit === "km" ? storedUnit : defaultUnit());
    const storedNav = localStorage.getItem("trids.satnav");
    if (storedNav === "google" || storedNav === "waze" || storedNav === "apple") setSatnav(storedNav);
    void (async () => {
      try {
        await api("/api/me");
        const body = await api<{ routes: RoutePlan[] }>("/api/routes");
        const routes = body.routes.map((route) => validatePlan(route)).filter((route): route is RoutePlan => route != null);
        for (const route of routes) {
          saved.current[route.id] = JSON.stringify(route);
          serverIds.current.add(route.id);
        }
        setPlans(routes);
        setActiveId(routes[0]?.id ?? null);
        setMode("account");
      } catch {
        const stored = localStorage.getItem(STORAGE);
        const parsed = stored ? (JSON.parse(stored) as unknown) : [];
        const routes = Array.isArray(parsed)
          ? parsed.map((route) => validatePlan(route)).filter((route): route is RoutePlan => route != null)
          : [];
        for (const route of routes) saved.current[route.id] = JSON.stringify(route);
        setPlans(routes);
        setActiveId(routes[0]?.id ?? null);
        setMode("browser");
      }
    })();
  }, []);

  useEffect(() => {
    if (mode === "loading" || !active) return;
    const json = JSON.stringify(active);
    if (saved.current[active.id] === json) return;
    const planId = active.id;
    const handle = setTimeout(() => {
      void (async () => {
        setSaveState("saving");
        try {
          if (mode === "browser") {
            localStorage.setItem(STORAGE, JSON.stringify(plansRef.current));
          } else if (serverIds.current.has(planId)) {
            await api(`/api/routes/${planId}`, { method: "PUT", body: json });
          } else {
            await api("/api/routes", { method: "POST", body: json });
            serverIds.current.add(planId);
          }
          saved.current[planId] = json;
          setSaveState("saved");
        } catch (error) {
          if (error instanceof ApiError && error.status === 401) {
            setMode("browser");
            localStorage.setItem(STORAGE, JSON.stringify(plansRef.current));
            saved.current[planId] = json;
            setSaveState("saved");
            return;
          }
          setSaveState("error");
        }
      })();
    }, 700);
    return () => clearTimeout(handle);
  }, [active, mode]);

  function closeMenu() {
    if (menuRef.current) menuRef.current.open = false;
  }

  function commit(id: string, recipe: (plan: RoutePlan) => RoutePlan) {
    setPlans((current) => current.map((plan) => (plan.id === id ? recipe(plan) : plan)));
  }

  function openPlan(plan: RoutePlan) {
    setPlans((current) => [plan, ...current.filter((item) => item.id !== plan.id)]);
    setActiveId(plan.id);
    setDraft(null);
    closeMenu();
  }

  async function runOptimize(plan: RoutePlan, lockOrder: boolean) {
    setBusy(true);
    setBanner(null);
    try {
      const body = await api<{
        resolved: {
          start: { lat: number; lng: number };
          end: { lat: number; lng: number } | null;
          stops: Record<string, { lat: number; lng: number }>;
        };
        result: RouteResult;
        warnings: string[];
      }>("/api/optimize", {
        method: "POST",
        body: JSON.stringify({ plan, lockOrder, nowSec: nowSec() }),
      });
      commit(plan.id, (current) => ({
        ...current,
        startLat: body.resolved.start.lat,
        startLng: body.resolved.start.lng,
        endLat: body.resolved.end?.lat ?? (current.roundTrip ? body.resolved.start.lat : current.endLat),
        endLng: body.resolved.end?.lng ?? (current.roundTrip ? body.resolved.start.lng : current.endLng),
        stops: current.stops.map((stop) => {
          const point = body.resolved.stops[stop.id];
          return point ? { ...stop, lat: point.lat, lng: point.lng } : stop;
        }),
        sequence: mergeSequence(current, body.result.stopOrder),
        result: body.result,
      }));
      setStale((current) => ({ ...current, [plan.id]: false }));
      if (body.warnings.length > 0) setBanner(body.warnings.join(" "));
    } catch (error) {
      setBanner(error instanceof Error ? error.message : "Could not optimize that route.");
    } finally {
      setBusy(false);
    }
  }

  async function useMyLocation() {
    if (!active || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(async (position) => {
      try {
        const body = await api<{ places: Place[] }>(
          `/api/geocode?lat=${position.coords.latitude}&lng=${position.coords.longitude}`,
        );
        const place = body.places[0];
        commit(active.id, (plan) => ({
          ...plan,
          startLat: position.coords.latitude,
          startLng: position.coords.longitude,
          startAddress: place?.label || plan.startAddress || "Current location",
        }));
        setStale((current) => ({ ...current, [active.id]: true }));
      } catch (error) {
        setBanner(error instanceof Error ? error.message : "Couldn't read that location.");
      }
    }, () => setBanner("Location permission was denied."));
  }

  function saveDraft(stop: Stop) {
    if (!active) return;
    commit(active.id, (plan) => {
      const exists = plan.stops.some((item) => item.id === stop.id);
      const stops = exists ? plan.stops.map((item) => (item.id === stop.id ? stop : item)) : [...plan.stops, stop];
      const sequence = plan.sequence.includes(stop.id) ? plan.sequence : [...plan.sequence, stop.id];
      return { ...plan, stops, sequence };
    });
    setStale((current) => ({ ...current, [active.id]: true }));
    setDraft(null);
    if (stop.address.trim()) {
      void api("/api/memory", { method: "PUT", body: JSON.stringify(stop) }).catch(() => undefined);
    }
  }

  const pins = useMemo<MapPin[]>(() => {
    if (!active) return [];
    const items: MapPin[] = [];
    if (active.startLat != null && active.startLng != null) {
      items.push({ id: "start", lat: active.startLat, lng: active.startLng, label: "S", tone: "start" });
    }
    let number = 0;
    for (const id of active.sequence) {
      const stop = active.stops.find((item) => item.id === id);
      if (!stop || stop.lat == null || stop.lng == null || stop.status === "skipped") continue;
      number += 1;
      const event = active.result?.events.find((item) => item.id === stop.id);
      const tone = stop.status === "done" ? "done" : event && event.lateSec > 30 ? "late" : "stop";
      items.push({ id: stop.id, lat: stop.lat, lng: stop.lng, label: String(number), tone });
    }
    if (!active.roundTrip && active.endLat != null && active.endLng != null) {
      items.push({ id: "end", lat: active.endLat, lng: active.endLng, label: "E", tone: "end" });
    }
    return items;
  }, [active]);

  const line = active?.result?.geometry ?? [];
  const orderedStops = active ? active.sequence.map((id) => active.stops.find((stop) => stop.id === id)).filter((stop): stop is Stop => stop != null) : [];
  const pendingStops = orderedStops.filter((stop) => stop.status === "pending");
  const nextStop = pendingStops.find((stop) => stop.lat != null && stop.lng != null);
  const navLabel = SATNAVS.find((item) => item.id === satnav)?.label ?? "Google Maps";
  const openPlans = plans.filter((plan) => plan.status !== "completed").sort((a, b) => b.date.localeCompare(a.date));
  const savedPlans = plans.filter((plan) => plan.status === "completed").sort((a, b) => b.date.localeCompare(a.date));
  const locked = active?.status === "completed";

  return (
    <div className="app">
      <section className="workspace">
        <header className="topbar">
          <h1 className="brand">
            TRIDs<span>Route planner</span>
          </h1>
          <details className="menu" ref={menuRef}>
            <summary>Routes</summary>
            <div className="menu-panel">
              <button
                type="button"
                onClick={() => {
                  openPlan(emptyPlan());
                }}
              >
                New route
              </button>
              <button
                type="button"
                onClick={() => {
                  const plan = samplePlan();
                  openPlan(plan);
                  void runOptimize(plan, false);
                }}
              >
                Try a sample day
              </button>
              <p className="menu-label">Open days</p>
              {openPlans.length === 0 ? <p className="quiet">No open day yet.</p> : null}
              {openPlans.map((plan) => (
                <RouteRow
                  key={plan.id}
                  plan={plan}
                  active={plan.id === activeId}
                  onOpen={() => {
                    setActiveId(plan.id);
                    setDraft(null);
                    closeMenu();
                  }}
                />
              ))}
              <p className="menu-label">Saved days</p>
              {savedPlans.length === 0 ? <p className="quiet">Finished days stay here after you save them.</p> : null}
              {savedPlans.map((plan) => (
                <RouteRow
                  key={plan.id}
                  plan={plan}
                  active={plan.id === activeId}
                  onOpen={() => {
                    setActiveId(plan.id);
                    setDraft(null);
                    closeMenu();
                  }}
                />
              ))}
              <InstallCard />
              {active ? (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      closeMenu();
                      void (async () => {
                        if (!active) return;
                        if (mode === "account" && serverIds.current.has(active.id)) {
                          const body = await api<{ route: RoutePlan }>(`/api/routes/${active.id}/duplicate`, {
                            method: "POST",
                          });
                          const route = validatePlan(body.route);
                          if (!route) return;
                          serverIds.current.add(route.id);
                          saved.current[route.id] = JSON.stringify(route);
                          openPlan(route);
                          return;
                        }
                        openPlan(freshCopy(active));
                      })();
                    }}
                  >
                    {active.status === "completed" ? "Run this day again" : "Duplicate this route"}
                  </button>
                  <button
                    type="button"
                    className="danger"
                    onClick={() => {
                      if (!active || !window.confirm(`Delete ${active.name}? This removes the saved day.`)) return;
                      const id = active.id;
                      setPlans((current) => current.filter((plan) => plan.id !== id));
                      setActiveId((current) => (current === id ? null : current));
                      closeMenu();
                      if (mode === "account" && serverIds.current.has(id)) {
                        serverIds.current.delete(id);
                        void api(`/api/routes/${id}`, { method: "DELETE" }).catch(() => undefined);
                      }
                    }}
                  >
                    Delete this route
                  </button>
                </>
              ) : null}
            </div>
          </details>
        </header>
        <div className="workspace-scroll">
          {mode === "loading" ? <p className="quiet">Loading your routes…</p> : null}
          {mode !== "loading" && !active ? (
            <div className="card">
              <h2>Plan the day, then let the drive decide the order.</h2>
              <p>Add each client’s address, phone, and arrival window. Optimize rearranges the stops for the shortest road route that still makes those windows.</p>
              <div className="row-actions">
                <button type="button" className="primary" onClick={() => openPlan(emptyPlan())}>
                  New route
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const plan = samplePlan();
                    openPlan(plan);
                    void runOptimize(plan, false);
                  }}
                >
                  Try a sample day
                </button>
              </div>
            </div>
          ) : null}
          {active ? (
            <>
              {locked ? (
                <p className="record">
                  Saved day
                  {active.completedAt
                    ? ` · ${new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(active.completedAt))}`
                    : ""}
                  . {active.stops.filter((stop) => stop.status === "done").length} of {active.stops.length} stops done.
                </p>
              ) : null}
              <input
                className="route-name"
                aria-label="Route name"
                value={active.name}
                onChange={(event) => commit(active.id, (plan) => ({ ...plan, name: event.target.value.slice(0, 80) }))}
              />
              <div className="date-row">
                <input
                  type="date"
                  aria-label="Route date"
                  value={active.date}
                  onChange={(event) => commit(active.id, (plan) => ({ ...plan, date: event.target.value }))}
                />
                <span className="save-state">
                  {saveState === "saving" ? "Saving…" : saveState === "error" ? "Not saved" : mode === "account" ? "Saved to your account" : "Saved in this browser"}
                </span>
              </div>
              {banner ? <p className="warning">{banner}</p> : null}
              <div className="card">
                <AddressField
                  label="Start"
                  value={active.startAddress}
                  placeholder="Depot, home, or first parking spot"
                  onText={(value) => {
                    commit(active.id, (plan) => ({ ...plan, startAddress: value, startLat: null, startLng: null }));
                    setStale((current) => ({ ...current, [active.id]: true }));
                  }}
                  onPick={(place) => {
                    commit(active.id, (plan) => ({
                      ...plan,
                      startAddress: place.label,
                      startLat: place.lat,
                      startLng: place.lng,
                    }));
                    setStale((current) => ({ ...current, [active.id]: true }));
                  }}
                />
                <div className="split">
                  <label className="field">
                    <span>Leave at</span>
                    <input
                      type="time"
                      value={active.startTime}
                      onChange={(event) => {
                        commit(active.id, (plan) => ({ ...plan, startTime: event.target.value }));
                        setStale((current) => ({ ...current, [active.id]: true }));
                      }}
                    />
                  </label>
                  <label className="field">
                    <span>Minutes at a new stop</span>
                    <input
                      type="number"
                      min={0}
                      max={240}
                      value={active.defaultServiceMin}
                      onChange={(event) =>
                        commit(active.id, (plan) => ({
                          ...plan,
                          defaultServiceMin: Math.min(240, Math.max(0, Number(event.target.value) || 0)),
                        }))
                      }
                    />
                  </label>
                </div>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={active.roundTrip}
                    onChange={(event) => {
                      commit(active.id, (plan) => ({ ...plan, roundTrip: event.target.checked }));
                      setStale((current) => ({ ...current, [active.id]: true }));
                    }}
                  />
                  Return to the start
                </label>
                {active.roundTrip ? null : (
                  <AddressField
                    label="Finish at"
                    value={active.endAddress}
                    placeholder="Optional last destination"
                    bias={
                      active.startLat != null && active.startLng != null
                        ? { lat: active.startLat, lng: active.startLng }
                        : undefined
                    }
                    onText={(value) => commit(active.id, (plan) => ({ ...plan, endAddress: value, endLat: null, endLng: null }))}
                    onPick={(place) =>
                      commit(active.id, (plan) => ({
                        ...plan,
                        endAddress: place.label,
                        endLat: place.lat,
                        endLng: place.lng,
                      }))
                    }
                  />
                )}
                <label className="field">
                  <span>Finish by</span>
                  <input
                    type="time"
                    value={active.endTime}
                    onChange={(event) => commit(active.id, (plan) => ({ ...plan, endTime: event.target.value }))}
                  />
                </label>
                <button type="button" className="text-button" onClick={() => void useMyLocation()}>
                  Use my location as the start
                </button>
              </div>

              <div className="row-actions">
                  <button
                    type="button"
                    disabled={pendingStops.length < 2 || busy}
                    onClick={() => {
                      const reversed = reorderAll(active);
                      commit(active.id, () => reversed);
                      void runOptimize(reversed, true);
                    }}
                  >
                    Reverse
                  </button>
                  <button type="button" onClick={() => setPinDrop((value) => !value)}>
                    {pinDrop ? "Click the map to drop a pin" : "Drop a pin"}
                  </button>
                  <button type="button" onClick={() => window.print()}>
                    Print
                  </button>
                  <button
                    type="button"
                    className="unit"
                    onClick={() => {
                      const next = unit === "km" ? "mi" : "km";
                      setUnit(next);
                      localStorage.setItem(UNIT_KEY, next);
                    }}
                  >
                    {unit === "km" ? "Show miles" : "Show kilometers"}
                  </button>
              </div>

              {active.result ? (
                <>
                  {active.result.lateSec > 30 ? (
                    <p className="late-note">{formatDuration(active.result.lateSec)} outside an arrival window.</p>
                  ) : null}
                  {savingsCopy(active.result) ? <p className="savings">{savingsCopy(active.result)}</p> : null}
                  {stale[active.id] ? <p className="quiet">Stop details changed. Reoptimize to refresh the order.</p> : null}
                  {active.result.routing === "estimated" ? (
                    <p className="quiet">Drive times are estimated. Road routing was unavailable, so this order uses straight-line distance.</p>
                  ) : null}
                </>
              ) : (
                <p className="quiet">Stops can go in any order. Optimize rearranges them around drive time and arrival windows.</p>
              )}

              {draft ? (
                <StopForm
                  stop={draft}
                  isNew={draftIsNew}
                  bias={
                    active.startLat != null && active.startLng != null
                      ? { lat: active.startLat, lng: active.startLng }
                      : undefined
                  }
                  onChange={setDraft}
                  onCancel={() => setDraft(null)}
                  onSave={saveDraft}
                  onDelete={() => {
                    commit(active.id, (plan) => ({
                      ...plan,
                      stops: plan.stops.filter((stop) => stop.id !== draft.id),
                      sequence: plan.sequence.filter((id) => id !== draft.id),
                    }));
                    setDraft(null);
                    setStale((current) => ({ ...current, [active.id]: true }));
                  }}
                />
              ) : locked ? null : (
                <button
                  type="button"
                  className="primary"
                  onClick={() => {
                    setDraft(blankStop(active.defaultServiceMin));
                    setDraftIsNew(true);
                  }}
                >
                  Add a stop
                </button>
              )}

              <h2 className="section-title">Stops</h2>
              {orderedStops.length === 0 ? <p className="quiet">No stops yet.</p> : null}
              {orderedStops.map((stop) => {
                const event = active.result?.events.find((item) => item.id === stop.id);
                const pendingIndex = pendingStops.findIndex((item) => item.id === stop.id);
                const phone = telHref(stop.phone);
                return (
                  <article
                    key={stop.id}
                    className={stop.status === "done" ? "stop done" : event && event.lateSec > 30 ? "stop late" : "stop"}
                  >
                    <div className="stop-index">{stop.status === "skipped" ? "–" : pendingIndex >= 0 ? pendingIndex + 1 : "✓"}</div>
                    <div>
                      <h3>{stop.clientName || stop.address || "Untitled stop"}</h3>
                      {stop.clientName ? <p>{stop.address}</p> : null}
                      <p className="quiet">
                        <span className="badge">{stop.stopType}</span>
                        {stop.order !== "auto" ? <span className="badge">{stop.order}</span> : null}
                        {windowLabel(stop)} · {stop.serviceMin} min on site
                        {stop.phone ? ` · ${stop.phone}` : ""}
                      </p>
                      {event && stop.status === "pending" ? (
                        <p>
                          Arrive {formatClock(event.etaSec)}
                          {event.driveSec > 0 ? ` · ${formatDuration(event.driveSec)} drive` : ""}
                          {event.waitSec > 45 ? ` · ${formatDuration(event.waitSec)} early` : ""}
                          {event.lateSec > 30 ? ` · ${formatDuration(event.lateSec)} late` : ""}
                        </p>
                      ) : null}
                      {stop.notes ? <p className="quiet">{stop.notes}</p> : null}
                      {stop.reference ? <p className="quiet">Ref {stop.reference}</p> : null}
                      <div className="stop-actions">
                        <button
                          type="button"
                          disabled={locked}
                          onClick={() => {
                            setDraft({ ...stop });
                            setDraftIsNew(false);
                          }}
                        >
                          Edit
                        </button>
                        {phone ? <a href={phone}>Call</a> : null}
                        {stop.lat != null && stop.lng != null ? (
                          <a href={satnavUrl(satnav, stop.lat, stop.lng)} target="_blank" rel="noopener noreferrer">
                            {navLabel}
                          </a>
                        ) : null}
                        {stop.status === "pending" ? (
                          <>
                            <button
                              type="button"
                              disabled={locked || pendingIndex <= 0 || busy}
                              onClick={() => {
                                const next = reorderPending(active, stop.id, pendingIndex - 1);
                                commit(active.id, () => next);
                                void runOptimize(next, true);
                              }}
                            >
                              Up
                            </button>
                            <button
                              type="button"
                              disabled={locked || pendingIndex < 0 || pendingIndex >= pendingStops.length - 1 || busy}
                              onClick={() => {
                                const next = reorderPending(active, stop.id, pendingIndex + 1);
                                commit(active.id, () => next);
                                void runOptimize(next, true);
                              }}
                            >
                              Down
                            </button>
                            <button
                              type="button"
                              disabled={locked}
                              onClick={() =>
                                commit(active.id, (plan) =>
                                  reschedulePlan(
                                    {
                                      ...plan,
                                      stops: plan.stops.map((item) =>
                                        item.id === stop.id ? { ...item, status: "done" } : item,
                                      ),
                                    },
                                    nowSec(),
                                  ),
                                )
                              }
                            >
                              Done
                            </button>
                            <button
                              type="button"
                              disabled={locked}
                              onClick={() => {
                                const next: RoutePlan = {
                                  ...active,
                                  stops: active.stops.map((item) =>
                                    item.id === stop.id ? { ...item, status: "skipped" as StopStatus } : item,
                                  ),
                                };
                                commit(active.id, () => next);
                                void runOptimize(next, true);
                              }}
                            >
                              Skip
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            disabled={locked}
                            onClick={() =>
                              commit(active.id, (plan) => ({
                                ...plan,
                                stops: plan.stops.map((item) =>
                                  item.id === stop.id ? { ...item, status: "pending" } : item,
                                ),
                              }))
                            }
                          >
                            Reopen
                          </button>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}

              <h2 className="section-title">Breaks</h2>
              {active.breaks.map((item) => {
                const event = active.result?.events.find((entry) => entry.id === item.id);
                return (
                  <article key={item.id} className="stop">
                    <div className="stop-index">B</div>
                    <div>
                      <h3>{item.label}</h3>
                      <p className="quiet">
                        {item.windowStart}–{item.windowEnd} · {item.durationMin} min
                        {item.status === "skipped" ? " · skipped" : ""}
                      </p>
                      {event && item.status === "pending" ? <p>At {formatClock(event.etaSec)}</p> : null}
                      <div className="stop-actions">
                        {item.status === "pending" ? (
                          <button
                            type="button"
                            disabled={locked}
                            onClick={() =>
                              commit(active.id, (plan) =>
                                reschedulePlan(
                                  {
                                    ...plan,
                                    breaks: plan.breaks.map((entry) =>
                                      entry.id === item.id ? { ...entry, status: "skipped" } : entry,
                                    ),
                                  },
                                  nowSec(),
                                ),
                              )
                            }
                          >
                            Skip break
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={locked}
                            onClick={() =>
                              commit(active.id, (plan) => ({
                                ...plan,
                                breaks: plan.breaks.map((entry) =>
                                  entry.id === item.id ? { ...entry, status: "pending" } : entry,
                                ),
                              }))
                            }
                          >
                            Restore
                          </button>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
              {locked ? null : showBreak ? (
                <BreakForm
                  onCancel={() => setShowBreak(false)}
                  onAdd={(item) => {
                    commit(active.id, (plan) => ({ ...plan, breaks: [...plan.breaks, item].slice(0, 4) }));
                    setShowBreak(false);
                    setStale((current) => ({ ...current, [active.id]: true }));
                  }}
                />
              ) : (
                <button type="button" className="text-button" onClick={() => setShowBreak(true)} disabled={active.breaks.length >= 4}>
                  Add a break
                </button>
              )}

              {locked ? null : <h2 className="section-title">Paste a list</h2>}
              {locked ? null : showPaste ? (
                <div className="card">
                  <p className="quiet">One stop per line: Name, Address, Phone, Notes</p>
                  <textarea className="paste" value={paste} onChange={(event) => setPaste(event.target.value)} />
                  <button
                    type="button"
                    className="primary"
                    onClick={() => {
                      const parsed = parseStopLines(paste);
                      if (parsed.length === 0) {
                        setBanner("No stops found in that list.");
                        return;
                      }
                      const stops = parsed.map((item) => ({
                        ...blankStop(active.defaultServiceMin),
                        clientName: item.clientName,
                        address: item.address,
                        phone: item.phone,
                        notes: item.notes,
                      }));
                      commit(active.id, (plan) => ({
                        ...plan,
                        stops: [...plan.stops, ...stops].slice(0, 30),
                        sequence: [...plan.sequence, ...stops.map((stop) => stop.id)].slice(0, 30),
                      }));
                      setPaste("");
                      setShowPaste(false);
                      setStale((current) => ({ ...current, [active.id]: true }));
                    }}
                  >
                    Add these stops
                  </button>
                </div>
              ) : (
                <button type="button" className="text-button" onClick={() => setShowPaste(true)}>
                  Paste addresses
                </button>
              )}
              <p className="foot">
                Address search uses OpenStreetMap. Drive times follow the road network and do not include live traffic.
                Navigate hands the next stop to {navLabel}. Saved days stay in your schedule history.
                {mode === "browser" ? " This browser is keeping the routes until you are signed in." : " Routes are stored on your account."}
              </p>
            </>
          ) : null}
        </div>
        {active ? (
          <div className="optimize-bar">
            {active.result ? (
              <p className="summary">
                <strong>{formatDuration(active.result.driveSec)}</strong> driving · {formatDistance(active.result.distanceM, unit)} ·{" "}
                {active.roundTrip ? "back" : "finish"} {formatClock(active.result.finishSec)}
                {active.result.lateSec > 30 ? <span className="late-note"> · {formatDuration(active.result.lateSec)} late</span> : null}
              </p>
            ) : (
              <p className="quiet">Add the stops, then optimize.</p>
            )}
            <div className="satnav" role="group" aria-label="Satnav">
              {SATNAVS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={satnav === item.id ? "on" : ""}
                  onClick={() => {
                    setSatnav(item.id);
                    localStorage.setItem("trids.satnav", item.id);
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>
            {locked ? (
              <button
                type="button"
                onClick={() => openPlan(freshCopy(active))}
              >
                Run this day again
              </button>
            ) : (
              <button
                type="button"
                className="primary"
                disabled={busy || active.stops.every((stop) => stop.status !== "pending") || active.startAddress.trim().length < 3}
                onClick={() => void runOptimize(active, false)}
              >
                {busy ? "Optimizing…" : active.result ? "Reoptimize" : "Optimize route"}
              </button>
            )}
            {locked ? null : (
              <button
                type="button"
                disabled={active.stops.length === 0}
                onClick={() =>
                  commit(active.id, (plan) => ({
                    ...plan,
                    status: "completed",
                    completedAt: new Date().toISOString(),
                  }))
                }
              >
                Save this day
              </button>
            )}
            {nextStop ? (
              <a className="ghost" href={satnavUrl(satnav, nextStop.lat as number, nextStop.lng as number)} target="_blank" rel="noopener noreferrer">
                Navigate to {nextStop.clientName || "next stop"} in {navLabel}
              </a>
            ) : null}
          </div>
        ) : null}
      </section>
      <div className={pinDrop ? "map-pane dropping" : "map-pane"}>
        <MapPane
          pins={pins}
          line={line}
          pinDrop={pinDrop}
          onSelect={(id) => {
            const stop = active?.stops.find((item) => item.id === id);
            if (!stop) return;
            setDraft({ ...stop });
            setDraftIsNew(false);
          }}
          onMapClick={(lat, lng) => {
            if (!active) return;
            setPinDrop(false);
            void (async () => {
              let label = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
              try {
                const body = await api<{ places: Place[] }>(`/api/geocode?lat=${lat}&lng=${lng}`);
                if (body.places[0]) label = body.places[0].label;
              } catch {
                /* keep the coordinate label */
              }
              const stop = { ...blankStop(active.defaultServiceMin), address: label, lat, lng };
              setDraft(stop);
              setDraftIsNew(true);
            })();
          }}
        />
        {pins.length === 0 ? <p className="map-note">Stops show up here after you add an address and optimize.</p> : null}
      </div>
    </div>
  );
}

function reorderAll(plan: RoutePlan): RoutePlan {
  const pending = plan.sequence.filter((id) => plan.stops.find((stop) => stop.id === id)?.status === "pending");
  const done = plan.sequence.filter((id) => plan.stops.find((stop) => stop.id === id)?.status === "done");
  const skipped = plan.sequence.filter((id) => plan.stops.find((stop) => stop.id === id)?.status === "skipped");
  return { ...plan, sequence: [...done, ...[...pending].reverse(), ...skipped] };
}

function StopForm({
  stop,
  isNew,
  bias,
  onChange,
  onSave,
  onCancel,
  onDelete,
}: {
  stop: Stop;
  isNew: boolean;
  bias?: { lat: number; lng: number };
  onChange: (stop: Stop) => void;
  onSave: (stop: Stop) => void;
  onCancel: () => void;
  onDelete: () => void;
}) {
  return (
    <form
      className="card"
      onSubmit={(event) => {
        event.preventDefault();
        if (stop.address.trim().length < 3) return;
        onSave(stop);
      }}
    >
      <AddressField
        label="Address"
        value={stop.address}
        placeholder="Street, city"
        bias={bias}
        onText={(value) => onChange({ ...stop, address: value, lat: null, lng: null })}
        onPick={(place) => {
          onChange({ ...stop, address: place.label, lat: place.lat, lng: place.lng });
          void api<{ memory: { clientName: string; phone: string; notes: string } | null }>(
            `/api/memory?address=${encodeURIComponent(place.label)}`,
          )
            .then((body) => {
              if (!body.memory) return;
              onChange({
                ...stop,
                address: place.label,
                lat: place.lat,
                lng: place.lng,
                clientName: stop.clientName || body.memory.clientName,
                phone: stop.phone || body.memory.phone,
                notes: stop.notes || body.memory.notes,
              });
            })
            .catch(() => undefined);
        }}
      />
      <label className="field">
        <span>Client</span>
        <input value={stop.clientName} onChange={(event) => onChange({ ...stop, clientName: event.target.value })} />
      </label>
      <label className="field">
        <span>Phone</span>
        <input value={stop.phone} inputMode="tel" onChange={(event) => onChange({ ...stop, phone: event.target.value })} />
      </label>
      <label className="field">
        <span>Arrival window</span>
        <select
          value={stop.arrivalMode}
          onChange={(event) => onChange({ ...stop, arrivalMode: event.target.value as Stop["arrivalMode"] })}
        >
          <option value="anytime">Anytime</option>
          <option value="before">Before</option>
          <option value="after">After</option>
          <option value="between">Between</option>
        </select>
      </label>
      {stop.arrivalMode === "after" || stop.arrivalMode === "between" ? (
        <label className="field">
          <span>{stop.arrivalMode === "between" ? "From" : "After"}</span>
          <input type="time" value={stop.arriveAfter} onChange={(event) => onChange({ ...stop, arriveAfter: event.target.value })} />
        </label>
      ) : null}
      {stop.arrivalMode === "before" || stop.arrivalMode === "between" ? (
        <label className="field">
          <span>{stop.arrivalMode === "between" ? "Until" : "Before"}</span>
          <input
            type="time"
            value={stop.arriveBefore}
            onChange={(event) => onChange({ ...stop, arriveBefore: event.target.value })}
          />
        </label>
      ) : null}
      <div className="split">
        <label className="field">
          <span>Minutes at stop</span>
          <input
            type="number"
            min={0}
            max={240}
            value={stop.serviceMin}
            onChange={(event) => onChange({ ...stop, serviceMin: Math.min(240, Math.max(0, Number(event.target.value) || 0)) })}
          />
        </label>
        <label className="field">
          <span>Order</span>
          <select value={stop.order} onChange={(event) => onChange({ ...stop, order: event.target.value as Stop["order"] })}>
            <option value="auto">Auto</option>
            <option value="first">First</option>
            <option value="last">Last</option>
          </select>
        </label>
      </div>
      <label className="field">
        <span>Type</span>
        <select
          value={stop.stopType}
          onChange={(event) => onChange({ ...stop, stopType: event.target.value as Stop["stopType"] })}
        >
          <option value="delivery">Delivery</option>
          <option value="pickup">Pickup</option>
          <option value="service">Service</option>
        </select>
      </label>
      <label className="field">
        <span>Notes</span>
        <textarea value={stop.notes} onChange={(event) => onChange({ ...stop, notes: event.target.value })} />
      </label>
      <label className="field">
        <span>Reference</span>
        <input value={stop.reference} onChange={(event) => onChange({ ...stop, reference: event.target.value })} />
      </label>
      <div className="row-actions">
        <button type="submit" className="primary" disabled={stop.address.trim().length < 3}>
          {isNew ? "Add stop" : "Save stop"}
        </button>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
        {isNew ? null : (
          <button type="button" className="danger" onClick={onDelete}>
            Remove
          </button>
        )}
      </div>
    </form>
  );
}

function BreakForm({ onAdd, onCancel }: { onAdd: (item: RouteBreak) => void; onCancel: () => void }) {
  const [label, setLabel] = useState("Lunch");
  const [windowStart, setWindowStart] = useState("12:00");
  const [windowEnd, setWindowEnd] = useState("13:30");
  const [durationMin, setDurationMin] = useState(30);
  return (
    <form
      className="card"
      onSubmit={(event) => {
        event.preventDefault();
        onAdd({
          id: crypto.randomUUID(),
          label: label.trim() || "Break",
          windowStart,
          windowEnd,
          durationMin,
          status: "pending",
        });
      }}
    >
      <label className="field">
        <span>Break</span>
        <input value={label} onChange={(event) => setLabel(event.target.value)} />
      </label>
      <div className="split">
        <label className="field">
          <span>Between</span>
          <input type="time" value={windowStart} onChange={(event) => setWindowStart(event.target.value)} />
        </label>
        <label className="field">
          <span>And</span>
          <input type="time" value={windowEnd} onChange={(event) => setWindowEnd(event.target.value)} />
        </label>
      </div>
      <label className="field">
        <span>Minutes</span>
        <input
          type="number"
          min={1}
          max={180}
          value={durationMin}
          onChange={(event) => setDurationMin(Math.min(180, Math.max(1, Number(event.target.value) || 1)))}
        />
      </label>
      <div className="row-actions">
        <button type="submit" className="primary">
          Add break
        </button>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function RouteRow({ plan, active, onOpen }: { plan: RoutePlan; active: boolean; onOpen: () => void }) {
  const done = plan.stops.filter((stop) => stop.status === "done").length;
  return (
    <button type="button" className={active ? "route-row active" : "route-row"} onClick={onOpen}>
      {plan.name}
      <small>
        {formatWhen(plan.date)} · {done}/{plan.stops.length} done
        {plan.status === "completed" ? " · saved" : ""}
      </small>
    </button>
  );
}
