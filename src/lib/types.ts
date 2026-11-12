export type StopType = "delivery" | "pickup" | "service";
export type OrderPref = "first" | "auto" | "last";
export type ArrivalMode = "anytime" | "before" | "after" | "between";
export type StopStatus = "pending" | "done" | "skipped";

export type Stop = {
  id: string;
  clientName: string;
  address: string;
  lat: number | null;
  lng: number | null;
  phone: string;
  notes: string;
  reference: string;
  stopType: StopType;
  order: OrderPref;
  arrivalMode: ArrivalMode;
  arriveAfter: string;
  arriveBefore: string;
  serviceMin: number;
  status: StopStatus;
};

export type RouteBreak = {
  id: string;
  label: string;
  windowStart: string;
  windowEnd: string;
  durationMin: number;
  status: StopStatus;
};

export type MatrixJson = {
  ids: string[];
  seconds: number[][];
  meters: number[][];
};

export type ResultEvent = {
  id: string;
  kind: "stop" | "break";
  etaSec: number;
  departSec: number;
  driveSec: number;
  distanceM: number;
  waitSec: number;
  lateSec: number;
};

export type RouteResult = {
  locked: boolean;
  routing: "road" | "estimated";
  stopOrder: string[];
  events: ResultEvent[];
  driveSec: number;
  distanceM: number;
  lateSec: number;
  waitSec: number;
  finishSec: number;
  geometry: [number, number][];
  matrix: MatrixJson;
  enteredDriveSec: number | null;
  enteredLateSec: number | null;
};

export type RoutePlan = {
  id: string;
  name: string;
  date: string;
  startAddress: string;
  startLat: number | null;
  startLng: number | null;
  startTime: string;
  roundTrip: boolean;
  endAddress: string;
  endLat: number | null;
  endLng: number | null;
  endTime: string;
  defaultServiceMin: number;
  stops: Stop[];
  breaks: RouteBreak[];
  sequence: string[];
  result: RouteResult | null;
};

export type Place = {
  label: string;
  lat: number;
  lng: number;
};
