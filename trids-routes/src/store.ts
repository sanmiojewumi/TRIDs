import { useEffect, useState } from 'preact/hooks';
import type { AppState, DayPlan, RouteSettings, Stop, StopStatus } from './types';

const KEY = 'trids-routes.v1';

const defaultSettings = (): RouteSettings => ({
  startAddress: 'Crewe, CW1',
  startMode: 'address',
  departAt: '08:00',
  serviceMinutes: 20,
  navApp: 'google',
});

function fresh(): AppState {
  return { version: 1, settings: defaultSettings(), days: [] };
}

function load(): AppState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fresh();
    const parsed = JSON.parse(raw) as AppState;
    return { ...fresh(), ...parsed, settings: { ...defaultSettings(), ...parsed.settings }, days: parsed.days ?? [] };
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

function emptyDay(date: string, settings: RouteSettings): DayPlan {
  return {
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
  day(date: string): DayPlan {
    return state.days.find((day) => day.date === date) ?? emptyDay(date, state.settings);
  },
  saveDay(day: DayPlan) {
    const days = state.days.filter((item) => item.date !== day.date);
    commit({ ...state, days: [...days, day].sort((a, b) => b.date.localeCompare(a.date)) });
  },
  setSettings(settings: RouteSettings) {
    commit({ ...state, settings });
  },
  setStopStatus(date: string, id: string, status: StopStatus) {
    const day = actions.day(date);
    actions.saveDay({
      ...day,
      stops: day.stops.map((stop) => (stop.id === id ? { ...stop, status, doneAt: status === 'done' ? new Date().toISOString() : undefined } : stop)),
    });
  },
};
