import { parsePrompt } from './prompt';
import type { Client } from './types';

export interface ShotClient {
  name: string;
  address: string;
  postcode: string;
  phone: string;
  email: string;
}

export interface ShotRead {
  clientId?: string;
  newClient?: ShotClient;
  workDates: string[];
  sitePostcode?: string;
  siteAddress?: string;
  amount?: number;
  description?: string;
  found: string[];
}

const POSTCODE = /\b([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})\b/i;
const PHONE = /(?:\+44\s?|0)(?:\d[\s-]?){9,10}/;
const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const JOB = /\b(boiler|repair|service|install(?:ation)?|leak|tap|pipe|radiator|heating|bathroom|shower|toilet|gas|plumb\w*|cooker|hob|cylinder|unvented|drain)\b/i;
const NOT_NAME = /\b(invoice|please|thanks|thank|morning|afternoon|evening|hello|whatsapp|total|amount|address|phone|service|repair|delivered|online|message)\b/i;

export function readInvoiceText(text: string, clients: Client[], today: Date = new Date()): ShotRead {
  const lines = text
    .replace(/\u00a0/g, ' ')
    .replace(/[|]/g, 'I')
    .split(/\n/)
    .map((line) => line.trim())
    .filter(usefulLine);
  const focused = lines.join('\n').replace(/\b(yesterday|today|tomorrow|just now)\b/gi, ' ');
  const parsed = parsePrompt(focused, clients, today);
  const found: string[] = [];

  const phone = focused.match(PHONE)?.[0].replace(/[^\d+]/g, '').replace(/^\+44/, '0') ?? '';
  const email = focused.match(EMAIL)?.[0] ?? '';
  const labelledName = labelled(lines, 'client|customer|bill\\s*to|name|attn');
  const client = clients.find((item) => item.id === parsed.clientId);
  let clientId = parsed.clientId;
  let newClient: ShotClient | undefined;
  if (client) found.push(`Client: ${client.name}`);
  else {
    const name = labelledName || nameNearAddress(lines);
    if (name) {
      newClient = { name, address: '', postcode: '', phone, email };
    }
  }

  const amount = pickAmount(focused);
  if (amount != null) found.push(`Amount: £${(amount / 100).toFixed(2)}`);

  const postcode = formatPostcode(parsed.sitePostcode || focused.match(POSTCODE)?.[0]);
  if (postcode) found.push(`Postcode: ${postcode}`);

  const address = tidyAddress(parsed.siteAddress || labelled(lines, 'site|address|job\\s*address|property') || addressBeforePostcode(lines));
  if (address) found.push(`Address: ${address}`);
  if (newClient) {
    newClient.address = address ?? '';
    newClient.postcode = postcode ?? '';
    found.unshift(`New client: ${newClient.name}`);
  }

  let description = labelled(lines, 'description|details|job|work');
  if (!description) description = lines.find((line) => JOB.test(line) && line.length <= 60 && !/^(please|can you|could you|hey|hi)\b/i.test(line));
  if (description) found.push(`Description: ${description}`);

  if (parsed.workDates.length) found.push(`Work date: ${parsed.workDates.join(', ')}`);
  if (phone) found.push(`Phone: ${phone}`);

  return {
    clientId,
    newClient,
    workDates: parsed.workDates,
    sitePostcode: postcode,
    siteAddress: address,
    amount,
    description,
    found,
  };
}

function usefulLine(line: string): boolean {
  if (line.length < 3 || line.length > 120) return false;
  if (/trids/i.test(line)) return false;
  if (/^\d{1,2}:\d{2}\b/.test(line)) return false;
  if (/^https?:/i.test(line) || /@/.test(line) && line.split(/\s+/).length < 3) return false;
  if (/^(whatsapp|instagram|facebook|messenger|delivered|seen|online|typing|reply|forward|copy|edited|today|yesterday|just now|message|screenshot|camera|gallery|thanks|thank you|hi|hello|hey|ok|okay)$/i.test(line)) return false;
  return true;
}

function labelled(lines: string[], label: string): string | undefined {
  const sameLine = new RegExp(`^(?:${label})\\s*[:\\-]\\s*(.+)$`, 'i');
  const ownLine = new RegExp(`^(?:${label})\\s*[:\\-]?$`, 'i');
  for (let i = 0; i < lines.length; i++) {
    const same = lines[i].match(sameLine);
    if (same?.[1]) return same[1].trim();
    if (ownLine.test(lines[i]) && lines[i + 1]) return lines[i + 1];
  }
  return undefined;
}

function looksLikeName(line: string): boolean {
  if (line.length < 3 || line.length > 60 || NOT_NAME.test(line)) return false;
  if (/\d/.test(line) || /£/.test(line) || POSTCODE.test(line)) return false;
  const words = line.split(/\s+/);
  if (words.length < 2 || words.length > 6) return false;
  return words.every((word) => /^[A-Za-z][A-Za-z.'&-]*$/.test(word) || /^(ltd|limited|plc|llp)$/i.test(word));
}

function nameNearAddress(lines: string[]): string | undefined {
  const anchor = lines.findIndex((line) => POSTCODE.test(line) || /^\d{1,4}[a-z]?\s+[a-z]/i.test(line));
  if (anchor < 0) return lines.find(looksLikeName);
  for (let i = Math.max(0, anchor - 3); i < anchor; i++) {
    if (looksLikeName(lines[i])) return lines[i];
  }
  return lines.find(looksLikeName);
}

function pickAmount(text: string): number | undefined {
  const labelled = text.match(/(?:grand\s+total|amount\s+due|balance\s+due|total(?:\s+price|\s+due)?)\s*[:\-]?\s*(?:£|gbp)?\s*(\d[\d,]*(?:\.\d{2})?)/i);
  if (labelled) return pence(labelled[1]);
  const amounts = [...text.matchAll(/(?:£|gbp)\s*(\d[\d,]*(?:\.\d{2})?)/gi)]
    .map((match) => pence(match[1]))
    .filter((value): value is number => value != null);
  if (!amounts.length) return undefined;
  return amounts[amounts.length - 1];
}

function pence(raw: string): number | undefined {
  const value = Number(raw.replace(/,/g, ''));
  if (!Number.isFinite(value) || value <= 0 || value > 100000) return undefined;
  return Math.round(value * 100);
}

function formatPostcode(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const compact = raw.toUpperCase().replace(/\s+/g, '');
  const full = compact.match(/^([A-Z]{1,2}\d[A-Z\d]?)(\d[A-Z]{2})$/);
  return full ? `${full[1]} ${full[2]}` : undefined;
}

function addressBeforePostcode(lines: string[]): string | undefined {
  const index = lines.findIndex((line) => POSTCODE.test(line));
  if (index <= 0) return undefined;
  const parts: string[] = [];
  for (let i = index - 1; i >= 0 && parts.length < 3; i--) {
    if (looksLikeName(lines[i]) || /^(phone|tel|email|total|amount)/i.test(lines[i])) break;
    if (lines[i].length > 50) continue;
    parts.unshift(lines[i].replace(POSTCODE, '').replace(/[, ]+$/, '').trim());
  }
  const joined = parts.filter(Boolean).join(', ');
  return joined || undefined;
}

function tidyAddress(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const cleaned = value.replace(POSTCODE, '').replace(/\s+,/g, ',').replace(/,+/g, ',').replace(/^[\s,]+|[\s,]+$/g, '').trim();
  return cleaned || undefined;
}
