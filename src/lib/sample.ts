import { blankStop } from "./plan";
import type { RoutePlan, Stop } from "./types";
import { routeTitle, todayISO } from "./format";

function stop(partial: Partial<Stop> & Pick<Stop, "clientName" | "address">, serviceMin: number): Stop {
  return { ...blankStop(serviceMin), ...partial, id: crypto.randomUUID() };
}

export function samplePlan(): RoutePlan {
  const date = todayISO();
  const stops: Stop[] = [
    stop(
      {
        clientName: "Priya Shah",
        address: "1 Telegraph Hill Blvd, San Francisco, CA",
        phone: "415-555-0148",
        arrivalMode: "before",
        arriveBefore: "09:30",
        serviceMin: 8,
        stopType: "service",
        notes: "Call from the gate. Code 1942.",
      },
      5,
    ),
    stop(
      {
        clientName: "Jordan Hale",
        address: "1000 Great Highway, San Francisco, CA",
        phone: "415-555-0166",
        arrivalMode: "before",
        arriveBefore: "09:15",
        serviceMin: 7,
        stopType: "delivery",
      },
      5,
    ),
    stop(
      {
        clientName: "Ben Cho",
        address: "900 North Point St, San Francisco, CA",
        phone: "415-555-0114",
        serviceMin: 6,
        stopType: "pickup",
      },
      5,
    ),
    stop(
      {
        clientName: "Ana Ruiz",
        address: "1355 Market Street, San Francisco, CA",
        phone: "415-555-0176",
        arrivalMode: "between",
        arriveAfter: "10:00",
        arriveBefore: "11:30",
        serviceMin: 10,
        stopType: "delivery",
        reference: "A-184",
      },
      5,
    ),
    stop(
      {
        clientName: "Nora Blake",
        address: "24 Willie Mays Plaza, San Francisco, CA",
        phone: "415-555-0190",
        serviceMin: 5,
        stopType: "delivery",
      },
      5,
    ),
    stop(
      {
        clientName: "Luis Ortega",
        address: "50 Hagiwara Tea Garden Drive, San Francisco, CA",
        phone: "415-555-0128",
        arrivalMode: "after",
        arriveAfter: "11:00",
        serviceMin: 12,
        stopType: "service",
      },
      5,
    ),
  ];
  return {
    id: crypto.randomUUID(),
    name: routeTitle(date),
    date,
    startAddress: "San Francisco Ferry Building, San Francisco, CA",
    startLat: null,
    startLng: null,
    startTime: "08:00",
    roundTrip: true,
    endAddress: "",
    endLat: null,
    endLng: null,
    endTime: "",
    defaultServiceMin: 5,
    status: "open",
    completedAt: null,
    stops,
    breaks: [
      {
        id: crypto.randomUUID(),
        label: "Lunch",
        windowStart: "12:00",
        windowEnd: "13:30",
        durationMin: 30,
        status: "pending",
      },
    ],
    sequence: stops.map((item) => item.id),
    result: null,
  };
}
