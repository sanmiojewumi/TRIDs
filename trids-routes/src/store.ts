import { useEffect, useState } from 'preact/hooks';
import type { AppState, DayPlan, RouteSettings, Stop, StopStatus } from './types';

const KEY = 'trids-routes.v1';

const defaultSettings = (): RouteSettings => ({
  startAddress: 'Crewe, CW1',
  startMode: 'address',
  departAt: '08:00',
  serviceMinutes: 10,
  navApp: 'google',
  vehicle: 'car',
  avoidTolls: false,
});

function fresh(): AppState {
  return { version: 1, settings: defaultSettings(), days: [] };
}

function load(): AppState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fresh();
    const parsed = JSON.parse(raw) as AppState;
    const days = (parsed.days ?? []).map((day, index) => ({
      ...emptyDay(day.date || todayISO(), { ...defaultSettings(), ...parsed.settings }, day.name || ''),
      ...day,
      id: day.id || `${day.date || 'route'}-${index}`,
      name: day.name || '',
    }));
    return { ...fresh(), ...parsed, settings: { ...defaultSettings(), ...parsed.settings }, days };
  } catch {
    return fresh();
  }
}

let state = load();
const listeners = new Set<() => void>();

function commit(next: AppState) {
  state = next;
  localStorage.setItem(KEY, JSON.stringify(next));
  listeners.forEach((listener) => listener());
}

export function useStore(): AppState {
  const [, setTick] = useState(0);
  useEffect(() => {
    const listener = () => setTick((value) => value + 1);
    listeners.add(listener);
    return () => listeners.delete(listener);
  }, []);
  return state;
}

export function todayISO(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export function blankStop(serviceMinutes: number): Stop {
  return {
    id: crypto.randomUUID(),
    name: '',
    phone: '',
    address: '',
    windowStart: '',
    windowEnd: '',
    notes: '',
    serviceMinutes,
    status: 'pending',
  };
}

function emptyDay(date: string, settings: RouteSettings, name = ''): DayPlan {
  return {
    id: crypto.randomUUID(),
    name,
    date,
    startAddress: settings.startAddress,
    startMode: settings.startMode,
    departAt: settings.departAt,
    stops: [],
    travel: [],
    eta: [],
    late: [],
    optimized: false,
    finished: false,
  };
}

export const actions = {
  route(id: string): DayPlan | null {
    return state.days.find((day) => day.id === id) ?? null;
  },
  saveRoute(day: DayPlan) {
    const days = state.days.filter((item) => item.id !== day.id);
    commit({ ...state, days: [...days, day].sort((a, b) => b.date.localeCompare(a.date) || a.name.localeCompare(b.name)) });
  },
  createRoute(date: string, name: string): DayPlan {
    const day = emptyDay(date, state.settings, name.trim());
    actions.saveRoute(day);
    return day;
  },
  removeRoute(id: string) {
    commit({ ...state, days: state.days.filter((day) => day.id !== id) });
  },
  setSettings(settings: RouteSettings) {
    commit({ ...state, settings });
  },
  setStopStatus(routeId: string, id: string, status: StopStatus) {
    const day = actions.route(routeId);
    if (!day) return;
    actions.saveRoute({
      ...day,
      stops: day.stops.map((stop) => (stop.id === id ? { ...stop, status, doneAt: status === 'done' ? new Date().toISOString() : undefined } : stop)),
    });
  },
};
