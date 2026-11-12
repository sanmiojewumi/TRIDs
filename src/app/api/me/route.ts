import { json, viewer } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const who = await viewer(request);
  if (who instanceof Response) return who;
  return json({ name: who.name, kind: who.kind });
}
