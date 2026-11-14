/** Minutes from midnight, or null when the field is blank. */
export function parseTime(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

export function formatTime(minutes: number): string {
  const day = 24 * 60;
  const wrapped = ((Math.round(minutes) % day) + day) % day;
  return `${String(Math.floor(wrapped / 60)).padStart(2, '0')}:${String(wrapped % 60).padStart(2, '0')}`;
}
