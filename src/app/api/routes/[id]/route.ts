import { json, readJson, viewer } from "@/lib/auth";
import { sql } from "@/lib/db";
import { limited } from "@/lib/rate";
import { validatePlan } from "@/lib/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  const who = await viewer(request);
  if (who instanceof Response) return who;
  if (limited(`write:${who.owner}`, 40, 60_000)) return json({ error: "Too many saves." }, 429);
  const { id } = await context.params;
  if (!ID.test(id)) return json({ error: "Unknown route." }, 400);
  const body = await readJson(request);
  if (body instanceof Response) return body;
  const plan = validatePlan(body);
  if (!plan || plan.id !== id) return json({ error: "That route could not be saved." }, 400);
  const rows = await sql<{ id: string }>(
    `update routes
     set name = $3, route_date = $4, payload = $5::jsonb, updated_at = now()
     where id = $1 and owner = $2
     returning id`,
    [id, who.owner, plan.name, plan.date, JSON.stringify(plan)],
  );
  if (!rows[0]) return json({ error: "Route not found." }, 404);
  return json({ route: plan });
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const who = await viewer(request);
  if (who instanceof Response) return who;
  const blocked = request.headers.get("x-trids-request") === "1" ? null : json({ error: "Blocked." }, 403);
  if (blocked) return blocked;
  const { id } = await context.params;
  if (!ID.test(id)) return json({ error: "Unknown route." }, 400);
  await sql("delete from routes where id = $1 and owner = $2", [id, who.owner]);
  return json({ ok: true });
}
