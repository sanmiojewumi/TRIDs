const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function toISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function fromISO(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function todayISO(): string {
  return toISO(new Date());
}

export function addDays(iso: string, days: number): string {
  const d = fromISO(iso);
  d.setDate(d.getDate() + days);
  return toISO(d);
}

export function formatDate(iso: string): string {
  if (!iso) return '';
  const d = fromISO(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** "18 Oct 2026", "18 and 19 Oct 2026", "18, 19 and 22 Oct 2026". */
export function formatWorkDates(dates: string[]): string {
  const sorted = [...new Set(dates)].sort();
  if (sorted.length === 0) return '';
  if (sorted.length === 1) return formatDate(sorted[0]);
  const parsed = sorted.map(fromISO);
  const sameMonth = parsed.every(
    (d) => d.getMonth() === parsed[0].getMonth() && d.getFullYear() === parsed[0].getFullYear(),
  );
  if (!sameMonth) {
    const all = sorted.map(formatDate);
    return `${all.slice(0, -1).join(', ')} and ${all[all.length - 1]}`;
  }
  const days = parsed.map((d) => String(d.getDate()));
  const tail = `${MONTHS[parsed[0].getMonth()]} ${parsed[0].getFullYear()}`;
  return `${days.slice(0, -1).join(', ')} and ${days[days.length - 1]} ${tail}`;
}
