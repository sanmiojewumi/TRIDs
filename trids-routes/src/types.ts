export type StopStatus = 'pending' | 'done' | 'skipped';

export interface Stop {
  id: string;
  name: string;
  phone: string;
  address: string;
  windowStart: string;
  windowEnd: string;
  notes: string;
  serviceMinutes: number;
  lat?: number;
  lon?: number;
  status: StopStatus;
  doneAt?: string;
}

export interface LatLon {
  lat: number;
  lon: number;
}

export interface DayPlan {
  date: string;
  startAddress: string;
  startLat?: number;
  startLon?: number;
  departAt: string;
  stops: Stop[];
  /** Travel minutes into each stop, in the current stop order. */
  travel: number[];
  /** Arrival clock time for each stop. */
  eta: string[];
  /** Minutes late for each stop. */
  late: number[];
  /** Road line for the latest arranged route, including the start. */
  routeLine?: LatLon[];
  optimized: boolean;
  finished: boolean;
}

export type NavApp = 'google' | 'waze';

export interface RouteSettings {
  startAddress: string;
  departAt: string;
  serviceMinutes: number;
  /** Satnav used for the whole route. */
  navApp: NavApp;
}

export interface AppState {
  version: 1;
  settings: RouteSettings;
  days: DayPlan[];
}
