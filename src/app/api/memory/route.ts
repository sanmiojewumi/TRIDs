import { json, readJson, viewer } from "@/lib/auth";
import { sql } from "@/lib/db";
import { limited } from "@/lib/rate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function keyFor(address: string): string {
  return address.trim().toLowerCase().slice(0, 200);
}

export async function GET(request: Request) {
  const who = await viewer(request);
  if (who instanceof Response) return who;
  const address = new URL(request.url).searchParams.get("address") ?? "";
  const key = keyFor(address);
  if (key.length < 3) return json({ memory: null });
  const rows = await sql<{ client_name: string; phone: string; notes: string }>(
    "select client_name, phone, notes from address_memory where owner = $1 and address_key = $2",
    [who.owner, key],
  );
  const row = rows[0];
  if (!row) return json({ memory: null });
  return json({ memory: { clientName: row.client_name, phone: row.phone, notes: row.notes } });
}

export async function PUT(request: Request) {
  const who = await viewer(request);
  if (who instanceof Response) return who;
  if (limited(`mem:${who.owner}`, 60, 60_000)) return json({ error: "Too many saves." }, 429);
  const body = await readJson(request);
  if (body instanceof Response) return body;
  if (!body || typeof body !== "object") return json({ error: "Expected a stop." }, 400);
  const raw = body as Record<string, unknown>;
  const key = keyFor(typeof raw.address === "string" ? raw.address : "");
  if (key.length < 3) return json({ ok: true });
  const clientName = typeof raw.clientName === "string" ? raw.clientName.trim().slice(0, 80) : "";
  const phone = typeof raw.phone === "string" ? raw.phone.trim().slice(0, 40) : "";
  const notes = typeof raw.notes === "string" ? raw.notes.trim().slice(0, 500) : "";
  await sql(
    `insert into address_memory (owner, address_key, client_name, phone, notes)
     values ($1, $2, $3, $4, $5)
     on conflict (owner, address_key) do update set
       client_name = excluded.client_name,
       phone = excluded.phone,
       notes = excluded.notes,
       updated_at = now()`,
    [who.owner, key, clientName, phone, notes],
  );
  return json({ ok: true });
}
