export type DistanceUnit = "km" | "mi";

export function formatDuration(sec: number): string {
  const minutes = Math.max(0, Math.round(sec / 60));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours <= 0) return `${rest} min`;
  if (rest === 0) return `${hours} h`;
  return `${hours} h ${rest} min`;
}

export function formatClock(sec: number): string {
  const day = Math.floor(sec / 86400);
  const within = ((sec % 86400) + 86400) % 86400;
  const date = new Date(2000, 0, 1, 0, 0, 0, 0);
  date.setSeconds(within);
  const label = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(date);
  return day > 0 ? `${label} +${day}d` : label;
}

export function formatDistance(meters: number, unit: DistanceUnit): string {
  if (unit === "mi") {
    const miles = meters / 1609.344;
    return `${miles < 10 ? miles.toFixed(1) : Math.round(miles)} mi`;
  }
  const km = meters / 1000;
  return `${km < 10 ? km.toFixed(1) : Math.round(km)} km`;
}

export function defaultUnit(): DistanceUnit {
  if (typeof navigator === "undefined") return "km";
  return navigator.language === "en-US" || navigator.language === "en-GB" ? "mi" : "km";
}

export function telHref(phone: string): string | null {
  const cleaned = phone.replace(/[^\d+]/g, "");
  if (cleaned.replace(/\D/g, "").length < 7) return null;
  return `tel:${cleaned}`;
}

export function mapsUrl(lat: number, lng: number): string {
  const url = new URL("https://www.google.com/maps/dir/");
  url.searchParams.set("api", "1");
  url.searchParams.set("destination", `${lat.toFixed(6)},${lng.toFixed(6)}`);
  url.searchParams.set("travelmode", "driving");
  return url.toString();
}

export function formatWhen(date: string): string {
  const parsed = new Date(`${date}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  return new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  }).format(parsed);
}

export function todayISO(): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function routeTitle(date: string): string {
  const parsed = new Date(`${date}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return "Route";
  const weekday = new Intl.DateTimeFormat(undefined, { weekday: "long" }).format(parsed);
  return `${weekday} route`;
}
