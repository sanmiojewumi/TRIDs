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
const NOT_NAME = /\b(invoice|please|thanks|thank|morning|afternoon|evening|hello|whatsapp|total|amount|address|phone|service|repair|delivered|online|message|order|updated|property|upload)\b/i;

export function readInvoiceText(text: string, clients: Client[], today: Date = new Date(), caption = ''): ShotRead {
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

  const postcode = findPostcode(lines);
  if (postcode) found.push(`Postcode: ${postcode}`);

  const address = firstAddressLine(lines);
  if (address) found.push(`Address: ${address}`);
  if (newClient) {
    newClient.address = address ?? '';
    newClient.postcode = postcode ?? '';
    found.unshift(`New client: ${newClient.name}`);
  }

  let description = jobLine(lines);
  description = cleanDescription(description);
  found.push(`Description: ${description}`);

  if (parsed.workDates.length) found.push(`Work date: ${parsed.workDates.join(', ')}`);
  if (phone) found.push(`Phone: ${phone}`);

  return applyCaption({
    clientId,
    newClient,
    workDates: parsed.workDates,
    sitePostcode: postcode,
    siteAddress: address,
    amount,
    description,
    found,
  }, caption, clients, today);
}

function usefulLine(line: string): boolean {
  if (line.length < 3 || line.length > 120) return false;
  if (/trids/i.test(line)) return false;
  if (/^\d{1,2}:\d{2}\b/.test(line)) return false;
  if (/^https?:/i.test(line) || /@/.test(line) && line.split(/\s+/).length < 3) return false;
  if (/upload\s+an?\s+invoice/i.test(line)) return false;
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
  if (line.length < 3 || line.length > 60 || NOT_NAME.test(line) || JOB.test(line)) return false;
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

const STREET = /\b(?:street|st|road|rd|avenue|ave|lane|ln|close|drive|dr|way|court|place|crescent|gardens|terrace|grove|house|mews|rise|row|square|view|walk|hill|park|green)\b/i;
const HOUSE = /^\d{1,4}[a-z]?(?:[/-]\d{1,4}[a-z]?)?\s+[A-Za-z]/i;
const NOT_ADDRESS = /\b(work\s*order|updated|property|still|upload|invoice|monday|tuesday|wednesday|thursday|friday|saturday|sunday|january|february|march|april|june|july|august|september|october|november|december)\b/i;

function isAddressLine(line: string): boolean {
  const value = line.replace(POSTCODE, '').replace(/^[^A-Za-z0-9]+/, '').trim();
  if (!value || value.length > 50 || value.split(/\s+/).length > 7) return false;
  if (NOT_ADDRESS.test(value)) return false;
  return HOUSE.test(value) || STREET.test(value);
}

function findPostcode(lines: string[]): string | undefined {
  for (const line of lines) {
    const code = formatPostcode(line);
    if (code && line.replace(/[^A-Za-z0-9]/g, '').length <= code.replace(/\s/g, '').length + 1) return code;
  }
  for (const line of lines) {
    if (line.length > 40 && !isAddressLine(line)) continue;
    const match = line.match(POSTCODE);
    if (match) return formatPostcode(match[0]);
  }
  return undefined;
}

function streetOnly(line: string): string | undefined {
  const part = line.replace(POSTCODE, '').split(/[\n,]/).map((item) => item.trim()).find(isAddressLine);
  return part ? tidyAddress(part) : undefined;
}

function firstAddressLine(lines: string[]): string | undefined {
  const labelledAddress = labelled(lines, 'site|address|job\\s*address|property');
  if (labelledAddress) {
    const part = streetOnly(labelledAddress);
    if (part) return part;
  }
  const index = lines.findIndex((line) => formatPostcode(line));
  const around = index >= 0 ? lines.slice(Math.max(0, index - 4), index + 1) : lines;
  const nearest = [...around].reverse().find((line) => streetOnly(line)) ?? lines.find((line) => streetOnly(line));
  return nearest ? streetOnly(nearest) : undefined;
}

function jobLine(lines: string[]): string | undefined {
  const labelledJob = labelled(lines, 'description|details|job|work');
  if (labelledJob && !/upload\s+an?\s+invoice/i.test(labelledJob)) return labelledJob;
  for (const line of lines) {
    const rest = line.split(/[\n,]/).map((part) => part.trim()).filter((part) => part && !isAddressLine(part) && !formatPostcode(part)).join(', ');
    if (JOB.test(rest) && rest.length <= 60 && !/^(please|can you|could you|hey|hi)\b/i.test(rest) && !/upload\s+an?\s+invoice/i.test(rest)) return rest;
  }
  return undefined;
}

function cleanDescription(value: string | undefined): string {
  if (!value || /upload\s+an?\s+invoice/i.test(value)) return 'Job';
  return value.trim();
}

function captionPieces(caption: string): string[] {
  return caption.split(/[\n,]+/).map((part) => part.trim()).filter(Boolean);
}

function applyCaption(read: ShotRead, caption: string, clients: Client[], today: Date): ShotRead {
  const note = caption.trim();
  if (!note) return read;
  const extra = readInvoiceText(note, clients, today);
  const words = captionPieces(note).filter((part) => !isAddressLine(part) && !formatPostcode(part) && !/^(?:£|gbp)?\s*\d[\d,]*(?:\.\d{2})?$/.test(part) && !/^(client|customer|name|address|post\s?code)\b/i.test(part));
  const written = words.join(', ').replace(POSTCODE, '').replace(/(?:£|gbp)\s*\d[\d,]*(?:\.\d{2})?/gi, '').replace(/\s+/g, ' ').trim();
  const description = cleanDescription(written || read.description);
  const found = [`Description: ${description}`, ...read.found.filter((item) => !item.startsWith('Description:') && !item.startsWith('Address:') && !item.startsWith('Postcode:'))];
  if (extra.siteAddress || read.siteAddress) found.push(`Address: ${extra.siteAddress || read.siteAddress}`);
  if (extra.sitePostcode || read.sitePostcode) found.push(`Postcode: ${extra.sitePostcode || read.sitePostcode}`);
  return {
    clientId: read.clientId,
    newClient: read.newClient,
    workDates: extra.workDates.length ? extra.workDates : read.workDates,
    sitePostcode: extra.sitePostcode || read.sitePostcode,
    siteAddress: extra.siteAddress || read.siteAddress,
    amount: extra.amount ?? read.amount,
    description,
    found,
  };
}

function tidyAddress(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const cleaned = value.replace(POSTCODE, '').replace(/\s+,/g, ',').replace(/,+/g, ',').replace(/^[\s,]+|[\s,]+$/g, '').trim();
  return cleaned || undefined;
}
