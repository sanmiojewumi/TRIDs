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
  optimized: boolean;
  finished: boolean;
}

export interface RouteSettings {
  startAddress: string;
  departAt: string;
  serviceMinutes: number;
}

export interface AppState {
  version: 1;
  settings: RouteSettings;
  days: DayPlan[];
}
