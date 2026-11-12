import { getIdentity } from "../../cursor/identity.js";

const NO_STORE = { "cache-control": "private, no-store" };

export type Viewer = {
  owner: string;
  name: string;
  kind: "person" | "key";
};

export function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: NO_STORE });
}

export function assertWrite(request: Request): Response | null {
  if (request.method === "GET" || request.method === "HEAD") return null;
  if (request.headers.get("x-trids-request") !== "1") {
    return json({ error: "Blocked." }, 403);
  }
  return null;
}

export async function viewer(request: Request): Promise<Viewer | Response> {
  const identity = await getIdentity(request);
  if (!identity.verified || typeof identity.sub !== "string" || identity.sub.length > 200) {
    return json({ error: "Sign in to save routes to your account." }, 401);
  }
  const stage = identity.stage === "preview" ? "preview" : "production";
  const kind = identity.kind === "key" ? "key" : "person";
  const name = typeof identity.name === "string" ? identity.name.slice(0, 80) : "";
  return {
    owner: stage === "preview" ? `preview:${identity.sub}` : identity.sub,
    name,
    kind,
  };
}

export async function readJson(request: Request): Promise<unknown | Response> {
  const blocked = assertWrite(request);
  if (blocked) return blocked;
  const text = await request.text();
  if (text.length > 700_000) return json({ error: "That route is too large." }, 413);
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return json({ error: "Expected JSON." }, 400);
  }
}
