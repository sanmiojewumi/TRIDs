import { useEffect, useState } from 'preact/hooks';
import type { Books, Entry, Section, SectionKind } from './types';

const KEY = 'trids-fin.v1';

export function defaultSections(): Section[] {
  return [
    { id: 'home', name: 'Home', kind: 'home' },
    { id: 'business', name: 'Trids Gas and Plumbing', kind: 'business' },
  ];
}

function fresh(): Books {
  return { version: 1, profiles: defaultSections(), entries: [] };
}

function load(): Books {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) || '') as Partial<Books>;
    const profiles = parsed.profiles?.length ? parsed.profiles : defaultSections();
    const fallback = profiles.find((profile) => profile.kind === 'business')?.id ?? profiles[0].id;
    const entries = (parsed.entries ?? []).map((entry) => ({ ...entry, profileId: entry.profileId || fallback }));
    return { version: 1, profiles, entries };
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
    commit({ ...state, entries });
  },
  remove(id: string) {
    commit({ ...state, entries: state.entries.filter((entry) => entry.id !== id) });
  },
  addSection(name: string, kind: SectionKind): Section {
    const section = { id: crypto.randomUUID(), name: name.trim(), kind };
    commit({ ...state, profiles: [...state.profiles, section] });
    return section;
  },
  renameSection(id: string, name: string) {
    commit({ ...state, profiles: state.profiles.map((profile) => (profile.id === id ? { ...profile, name: name.trim() } : profile)) });
  },
  removeSection(id: string) {
    if (state.profiles.length < 2) return;
    commit({
      ...state,
      profiles: state.profiles.filter((profile) => profile.id !== id),
      entries: state.entries.filter((entry) => entry.profileId !== id),
    });
  },
};
