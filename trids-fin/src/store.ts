import { useEffect, useState } from 'preact/hooks';
import type { Books, Entry } from './types';

const KEY = 'trids-fin.v1';

function fresh(): Books {
  return { version: 1, entries: [] };
}

function load(): Books {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) || '') as Books;
    return { version: 1, entries: Array.isArray(parsed.entries) ? parsed.entries : [] };
  } catch {
    return fresh();
  }
}

let state = load();
const listeners = new Set<() => void>();

function commit(next: Books) {
  state = next;
  localStorage.setItem(KEY, JSON.stringify(next));
  listeners.forEach((listener) => listener());
}

export function useBooks(): Books {
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

export const actions = {
  save(entry: Entry) {
    const entries = state.entries.some((item) => item.id === entry.id)
      ? state.entries.map((item) => (item.id === entry.id ? entry : item))
      : [entry, ...state.entries];
    commit({ version: 1, entries });
  },
  remove(id: string) {
    commit({ version: 1, entries: state.entries.filter((entry) => entry.id !== id) });
  },
};
