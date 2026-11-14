import type { DayPlan } from './types';

export interface RouteGroup {
  title: string;
  routes: DayPlan[];
}

function parse(iso: string): Date {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
}

function startOfWeek(date: Date): Date {
  const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const mondayOffset = (copy.getDay() + 6) % 7;
  copy.setDate(copy.getDate() - mondayOffset);
  return copy;
}

function bucket(date: string, today: string): string {
  if (date === today) return 'Today';
  if (date > today) return 'Upcoming';
  const current = parse(today);
  const when = parse(date);
  const week = startOfWeek(current);
  if (when >= week) return 'Earlier this week';
  if (when.getFullYear() === current.getFullYear() && when.getMonth() === current.getMonth()) return 'Earlier this month';
  return when.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
}

/** Groups saved routes the way the day list is read: today, this week, then older months. */
export function groupRoutes(routes: DayPlan[], today: string): RouteGroup[] {
  const order = ['Upcoming', 'Today', 'Earlier this week', 'Earlier this month'];
  const buckets = new Map<string, DayPlan[]>();
  const sorted = [...routes].sort((a, b) => b.date.localeCompare(a.date) || a.name.localeCompare(b.name));
  for (const route of sorted) {
    const title = bucket(route.date, today);
    const list = buckets.get(title) ?? [];
    list.push(route);
    buckets.set(title, list);
  }
  const titles = [...buckets.keys()].sort((a, b) => {
    const ai = order.indexOf(a);
    const bi = order.indexOf(b);
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    return 0;
  });
  return titles.map((title) => ({ title, routes: buckets.get(title) ?? [] }));
}

export function routeWhen(route: DayPlan): { day: string; label: string } {
  const date = parse(route.date);
  return {
    day: date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
    label: route.name.trim() || date.toLocaleDateString('en-GB', { weekday: 'long' }),
  };
}

export function suggestRouteName(date: string, existing: DayPlan[]): string {
  const weekday = parse(date).toLocaleDateString('en-GB', { weekday: 'long' });
  const base = `${weekday} Route`;
  const taken = new Set(existing.filter((route) => route.date === date).map((route) => route.name));
  if (!taken.has(base)) return base;
  let count = 2;
  while (taken.has(`${base} ${count}`)) count += 1;
  return `${base} ${count}`;
}
