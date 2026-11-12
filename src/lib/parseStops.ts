export type ParsedStop = {
  clientName: string;
  address: string;
  phone: string;
  notes: string;
};

function isPhone(value: string): boolean {
  const trimmed = value.trim();
  const digits = trimmed.replace(/\D/g, "");
  return digits.length >= 7 && digits.length <= 15 && /^[+()\d][\d\s().+-]+$/.test(trimmed);
}

function splitCsv(line: string): string[] {
  const out: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else quoted = !quoted;
    } else if (ch === "," && !quoted) {
      out.push(current.trim());
      current = "";
    } else current += ch;
  }
  out.push(current.trim());
  return out.filter((part) => part.length > 0);
}

export function parseStopLines(text: string): ParsedStop[] {
  const stops: ParsedStop[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const parts = line.includes("\t") ? line.split("\t").map((part) => part.trim()).filter(Boolean) : splitCsv(line);
    if (parts.length === 0) continue;
    if (parts.length === 1) {
      stops.push({ clientName: "", address: parts[0], phone: "", notes: "" });
      continue;
    }
    let phone = "";
    const rest: string[] = [];
    for (const part of parts) {
      if (!phone && isPhone(part)) phone = part;
      else rest.push(part);
    }
    if (rest.length === 0) continue;
    const addressOnly = !phone && /\d/.test(rest[0]);
    const clientName = !addressOnly && rest.length > 1 ? rest[0] : "";
    const address = addressOnly ? rest.join(", ") : rest.length > 1 ? rest[1] : rest[0];
    const notes = addressOnly ? "" : rest.slice(rest.length > 1 ? 2 : 1).join(", ");
    if (!address) continue;
    stops.push({ clientName, address, phone, notes });
  }
  return stops.slice(0, 30);
}
