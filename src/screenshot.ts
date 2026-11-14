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

export function readInvoiceText(text: string, clients: Client[], today: Date = new Date()): ShotRead {
  const cleaned = text.replace(/\u00a0/g, ' ').replace(/[|]/g, 'I').trim();
  const parsed = parsePrompt(cleaned, clients, today);
  const lines = cleaned.split(/\n/).map((line) => line.trim()).filter(Boolean);
  const found: string[] = [];

  const phone = cleaned.match(PHONE)?.[0].replace(/[^\d+]/g, '').replace(/^\+44/, '0') ?? '';
  const email = cleaned.match(EMAIL)?.[0] ?? '';
  const labelledName = labelled(lines, 'client|customer|bill\\s*to|name|attn');
  const name = labelledName || lines.find((line) => looksLikeName(line) && !/trids/i.test(line));
  const client = clients.find((item) => item.id === parsed.clientId);
  let clientId = parsed.clientId;
  let newClient: ShotClient | undefined;
  if (!client && name) {
    newClient = {
      name,
      address: '',
      postcode: '',
      phone,
      email,
    };
  } else if (client) found.push(`Client: ${client.name}`);

  let amount = parsed.amount;
  if (amount == null) amount = labelledMoney(cleaned) ?? largestMoney(cleaned);
  if (amount != null) found.push(`Amount: £${(amount / 100).toFixed(2)}`);

  const postcode = formatPostcode(parsed.sitePostcode || cleaned.match(POSTCODE)?.[0]);
  if (postcode) found.push(`Postcode: ${postcode}`);

  const address = tidyAddress(parsed.siteAddress || labelled(lines, 'site|address|job\\s*address|property') || addressBeforePostcode(lines));
  if (address) found.push(`Address: ${address}`);
  if (newClient) {
    newClient.address = address ?? '';
    newClient.postcode = postcode ?? '';
    found.unshift(`New client: ${newClient.name}`);
  }

  let description = parsed.description || labelled(lines, 'description|details|job|work');
  if (!description) description = lines.find((line) => JOB.test(line) && line.length <= 80);
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
  if (line.length < 3 || line.length > 60) return false;
  if (/\d/.test(line) || /£|@/.test(line) || POSTCODE.test(line)) return false;
  const words = line.split(/\s+/);
  if (words.length < 2 || words.length > 6) return false;
  return words.every((word) => /^[A-Za-z][A-Za-z.'&-]*$/.test(word) || /^(ltd|limited|plc|llp)$/i.test(word));
}

function labelledMoney(text: string): number | undefined {
  const match = text.match(/(?:grand\s+total|amount\s+due|balance\s+due|total|amount|price|charge|cost)\s*[:\-]?\s*(?:£|gbp)?\s*(\d[\d,]*(?:\.\d{2})?)/i);
  return match ? pence(match[1]) : undefined;
}

function largestMoney(text: string): number | undefined {
  const amounts = [...text.matchAll(/(?:£|gbp)\s*(\d[\d,]*(?:\.\d{2})?)/gi)].map((match) => pence(match[1]));
  const usable = amounts.filter((value): value is number => value != null);
  if (!usable.length) return undefined;
  return Math.max(...usable);
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
