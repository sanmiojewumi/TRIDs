import { json, readJson, viewer } from "@/lib/auth";
import { sql } from "@/lib/db";
import { limited } from "@/lib/rate";
import type { RoutePlan } from "@/lib/types";
import { validatePlan } from "@/lib/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = { id: string; payload: unknown };

function storedPlan(row: Row): RoutePlan | null {
  let payload = row.payload;
  if (typeof payload === "string") {
    try {
      payload = JSON.parse(payload) as unknown;
    } catch {
      return null;
    }
  }
  const plan = validatePlan(payload);
  if (!plan) return null;
  plan.id = row.id;
  return plan;
}

export async function GET(request: Request) {
  const who = await viewer(request);
  if (who instanceof Response) return who;
  const rows = await sql<Row>(
    "select id, payload from routes where owner = $1 order by route_date desc, updated_at desc limit 100",
    [who.owner],
  );
  return json({ routes: rows.map(storedPlan).filter((plan): plan is RoutePlan => plan != null) });
}

export async function POST(request: Request) {
  const who = await viewer(request);
  if (who instanceof Response) return who;
  if (limited(`write:${who.owner}`, 40, 60_000)) return json({ error: "Too many saves." }, 429);
  const body = await readJson(request);
  if (body instanceof Response) return body;
  const plan = validatePlan(body);
  if (!plan) return json({ error: "That route is missing a date, a start time, or a stop." }, 400);
  const existing = await sql<{ owner: string }>("select owner from routes where id = $1", [plan.id]);
  if (existing[0] && existing[0].owner !== who.owner) return json({ error: "That route already exists." }, 409);
  const count = await sql<{ count: string }>("select count(*)::text as count from routes where owner = $1", [
    who.owner,
  ]);
  if (!existing[0] && Number(count[0]?.count ?? 0) >= 100) {
    return json({ error: "You have 100 saved routes. Delete one to add another." }, 400);
  }
  await sql(
    `insert into routes (id, owner, name, route_date, payload)
     values ($1, $2, $3, $4, $5::jsonb)
     on conflict (id) do update set
       name = excluded.name,
       route_date = excluded.route_date,
       payload = excluded.payload,
       updated_at = now()
     where routes.owner = $2`,
    [plan.id, who.owner, plan.name, plan.date, JSON.stringify(plan)],
  );
  return json({ route: plan });
}
