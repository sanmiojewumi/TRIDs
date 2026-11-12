import { json, viewer } from "@/lib/auth";
import { sql } from "@/lib/db";
import type { RoutePlan } from "@/lib/types";
import { validatePlan } from "@/lib/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const who = await viewer(request);
  if (who instanceof Response) return who;
  if (request.headers.get("x-trids-request") !== "1") return json({ error: "Blocked." }, 403);
  const { id } = await context.params;
  if (!ID.test(id)) return json({ error: "Unknown route." }, 400);
  const rows = await sql<{ payload: unknown }>("select payload from routes where id = $1 and owner = $2", [
    id,
    who.owner,
  ]);
  let payload = rows[0]?.payload;
  if (typeof payload === "string") {
    try {
      payload = JSON.parse(payload) as unknown;
    } catch {
      payload = null;
    }
  }
  const plan = payload ? validatePlan(payload) : null;
  if (!plan) return json({ error: "Route not found." }, 404);
  const copy: RoutePlan = {
    ...plan,
    id: crypto.randomUUID(),
    name: `${plan.name} copy`.slice(0, 80),
  };
  await sql(
    "insert into routes (id, owner, name, route_date, payload) values ($1, $2, $3, $4, $5::jsonb)",
    [copy.id, who.owner, copy.name, copy.date, JSON.stringify(copy)],
  );
  return json({ route: copy });
}
