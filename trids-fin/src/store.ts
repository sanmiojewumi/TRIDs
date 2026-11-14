import { useEffect, useState } from 'preact/hooks';
import type { Books, Entry, MoneyAccount, Section, SectionKind } from './types';

const KEY = 'trids-fin.v1';

export function defaultSections(): Section[] {
  return [
    { id: 'home', name: 'Home', kind: 'home' },
    { id: 'business', name: 'Trids Gas and Plumbing', kind: 'business' },
  ];
}

function starterAccount(profile: Section): MoneyAccount {
  return {
    id: `${profile.id}-account`,
    profileId: profile.id,
    name: profile.kind === 'home' ? 'Cash' : 'Bank',
    kind: profile.kind === 'home' ? 'cash' : 'bank',
    opening: 0,
  };
}

function fresh(): Books {
  const profiles = defaultSections();
  return { version: 1, profiles, accounts: profiles.map(starterAccount), entries: [] };
}

function load(): Books {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) || '') as Partial<Books>;
    const profiles = parsed.profiles?.length ? parsed.profiles : defaultSections();
    const accounts = [...(parsed.accounts ?? [])];
    for (const profile of profiles) {
      if (!accounts.some((account) => account.profileId === profile.id)) accounts.push(starterAccount(profile));
    }
    const fallback = profiles.find((profile) => profile.kind === 'business')?.id ?? profiles[0].id;
    const entries = (parsed.entries ?? []).map((entry) => {
      const profileId = entry.profileId || fallback;
      const accountId = entry.accountId || accounts.find((account) => account.profileId === profileId)?.id || accounts[0].id;
      return { ...entry, profileId, accountId };
    });
    return { version: 1, profiles, accounts, entries };
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
    commit({ ...state, profiles: [...state.profiles, section], accounts: [...state.accounts, starterAccount(section)] });
    return section;
  },
  saveAccount(account: MoneyAccount) {
    const accounts = state.accounts.some((item) => item.id === account.id)
      ? state.accounts.map((item) => (item.id === account.id ? { ...account, name: account.name.trim() } : item))
      : [...state.accounts, { ...account, name: account.name.trim() }];
    commit({ ...state, accounts });
  },
  removeAccount(id: string) {
    const account = state.accounts.find((item) => item.id === id);
    if (!account) return;
    const others = state.accounts.filter((item) => item.profileId === account.profileId && item.id !== id);
    if (!others.length) return;
    commit({
      ...state,
      accounts: state.accounts.filter((item) => item.id !== id),
      entries: state.entries.map((entry) => (entry.accountId === id ? { ...entry, accountId: others[0].id } : entry)),
    });
  },
  renameSection(id: string, name: string) {
    commit({ ...state, profiles: state.profiles.map((profile) => (profile.id === id ? { ...profile, name: name.trim() } : profile)) });
  },
  removeSection(id: string) {
    if (state.profiles.length < 2) return;
    commit({
      ...state,
      profiles: state.profiles.filter((profile) => profile.id !== id),
      accounts: state.accounts.filter((account) => account.profileId !== id),
      entries: state.entries.filter((entry) => entry.profileId !== id),
    });
  },
};
