import { addDays, fromISO, toISO } from './dates';
import type { Client } from './types';

export interface ParsedPrompt {
  clientId?: string;
  workDates: string[];
  sitePostcode?: string;
  siteAddress?: string;
  amount?: number;
  description?: string;
}

const MONTHS = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
];
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const COMPANY_SUFFIX = /\b(ltd|limited|plc|llp|inc|co|company|group|services|contractors|construction|building|builders)\b/g;

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

function coreName(name: string): string {
  return norm(name.toLowerCase().replace(/&/g, ' and ').replace(COMPANY_SUFFIX, ' '));
}

export function matchClient(text: string, clients: Client[]): Client | undefined {
  const flat = norm(text);
  let best: { client: Client; score: number } | undefined;
  for (const client of clients) {
    const full = norm(client.name);
    const core = coreName(client.name);
    let score = 0;
    if (full && flat.includes(full)) score = full.length + 100;
    else if (core.length >= 2 && flat.includes(core)) score = core.length + 50;
    if (score && (!best || score > best.score)) best = { client, score };
  }
  return best?.client;
}

function monthIndex(word: string): number {
  const w = word.toLowerCase();
  if (w.length < 3) return -1;
  return MONTHS.findIndex((m) => m === w || (w.length >= 3 && m.startsWith(w) && (w.length === 3 || m === w)));
}

function validDate(y: number, m: number, d: number): string | undefined {
  const date = new Date(y, m, d);
  if (date.getFullYear() !== y || date.getMonth() !== m || date.getDate() !== d) return undefined;
  return toISO(date);
}

/** A bare day-of-month means "the most recent time that day occurred". */
function resolveBareDay(day: number, today: Date): string | undefined {
  let y = today.getFullYear();
  let m = today.getMonth();
  for (let i = 0; i < 12; i++) {
    const hit = validDate(y, m, day);
    if (hit && fromISO(hit) <= today) return hit;
    m--;
    if (m < 0) {
      m = 11;
      y--;
    }
  }
  return undefined;
}

function resolveDayMonth(day: number, month: number, today: Date, year?: number): string | undefined {
  if (year) return validDate(year, month, day);
  const thisYear = validDate(today.getFullYear(), month, day);
  if (thisYear && fromISO(thisYear) <= addDaysDate(today, 7)) return thisYear;
  return validDate(today.getFullYear() - 1, month, day);
}

function addDaysDate(d: Date, n: number): Date {
  return fromISO(addDays(toISO(d), n));
}

function expandRange(from: string, to: string): string[] {
  if (to < from) return [from];
  const out: string[] = [];
  for (let d = from, i = 0; d <= to && i < 62; d = addDays(d, 1), i++) out.push(d);
  return out;
}

const DATE_LEAD = String.raw`(?:(?:on|for|dated?|from|the)\s+)*`;
const ORD = String.raw`(\d{1,2})(?:st|nd|rd|th)?`;
const MONTH_WORD = `(${MONTHS.map((m) => m.slice(0, 3) + `(?:${m.slice(3)})?`).join('|')}|sept)`;

function extractDates(text: string, today: Date): { dates: string[]; rest: string } {
  const dates: string[] = [];
  let rest = text;
  const take = (re: RegExp, fn: (m: RegExpMatchArray) => void) => {
    rest = rest.replace(re, (...args) => {
      const groups = args.slice(0, -2) as string[];
      fn(groups as unknown as RegExpMatchArray);
      return ' ';
    });
  };

  take(/\b(?:the\s+)?day before yesterday\b/gi, () => dates.push(addDays(toISO(today), -2)));
  take(/\byesterday\b/gi, () => dates.push(addDays(toISO(today), -1)));
  take(/\b(?:today|this morning|this afternoon)\b/gi, () => dates.push(toISO(today)));

  take(new RegExp(String.raw`\b${DATE_LEAD}(\d{1,2})[/.](\d{1,2})(?:[/.](\d{2,4}))?\b`, 'gi'), (m) => {
    const day = Number(m[1]);
    const month = Number(m[2]) - 1;
    let year = m[3] ? Number(m[3]) : undefined;
    if (year && year < 100) year += 2000;
    const hit = resolveDayMonth(day, month, today, year);
    if (hit) dates.push(hit);
  });
  take(/\b(\d{4})-(\d{2})-(\d{2})\b/g, (m) => {
    const hit = validDate(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    if (hit) dates.push(hit);
  });

  take(
    new RegExp(String.raw`\b${DATE_LEAD}${ORD}\s*(?:to|until|through|-)\s*${ORD}\s*(?:of\s+)?${MONTH_WORD}(?:\s+(\d{4}))?\b`, 'gi'),
    (m) => {
      const mi = monthIndex(m[3] === 'sept' ? 'september' : expandMonth(m[3]));
      if (mi < 0) return;
      const year = m[4] ? Number(m[4]) : undefined;
      const a = resolveDayMonth(Number(m[1]), mi, today, year);
      const b = resolveDayMonth(Number(m[2]), mi, today, year);
      if (a && b) dates.push(...expandRange(a, b));
    },
  );

  take(
    new RegExp(String.raw`\b${DATE_LEAD}${ORD}\s+(?:of\s+)?${MONTH_WORD}(?:\s+(\d{4}))?\b`, 'gi'),
    (m) => {
      const mi = monthIndex(m[2] === 'sept' ? 'september' : expandMonth(m[2]));
      if (mi < 0) return;
      const hit = resolveDayMonth(Number(m[1]), mi, today, m[3] ? Number(m[3]) : undefined);
      if (hit) dates.push(hit);
    },
  );
  take(new RegExp(String.raw`\b${DATE_LEAD}${MONTH_WORD}\s+${ORD}(?:,?\s+(\d{4}))?\b`, 'gi'), (m) => {
    const mi = monthIndex(m[1] === 'sept' ? 'september' : expandMonth(m[1]));
    if (mi < 0) return;
    const hit = resolveDayMonth(Number(m[2]), mi, today, m[3] ? Number(m[3]) : undefined);
    if (hit) dates.push(hit);
  });

  take(
    new RegExp(String.raw`\b${DATE_LEAD}(\d{1,2})(?:st|nd|rd|th)\s*(?:to|until|through|-)\s*(\d{1,2})(?:st|nd|rd|th)\b`, 'gi'),
    (m) => {
      const a = resolveBareDay(Number(m[1]), today);
      const b = resolveBareDay(Number(m[2]), today);
      if (a && b) dates.push(...expandRange(a, b));
    },
  );
  take(new RegExp(String.raw`\b${DATE_LEAD}(\d{1,2})(?:st|nd|rd|th)\b`, 'gi'), (m) => {
    const day = resolveBareDay(Number(m[1]), today);
    if (day) dates.push(day);
  });

  take(new RegExp(String.raw`\b(?:last|on|this)?\s*(${WEEKDAYS.join('|')})\b`, 'gi'), (m) => {
    const target = WEEKDAYS.indexOf(m[1].toLowerCase());
    const diff = (today.getDay() - target + 7) % 7;
    dates.push(addDays(toISO(today), -diff));
  });

  return { dates: [...new Set(dates)].sort(), rest };
}

function expandMonth(abbr: string): string {
  const a = abbr.toLowerCase();
  return MONTHS.find((m) => m.startsWith(a.slice(0, 3))) ?? a;
}

const POSTCODE = /\b([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})\b/i;

export function parsePrompt(input: string, clients: Client[], today: Date = new Date()): ParsedPrompt {
  const result: ParsedPrompt = { workDates: [] };
  let text = ` ${input.trim()} `;

  const client = matchClient(text, clients);
  if (client) result.clientId = client.id;

  const desc = text.match(/\b(?:desc(?:ription)?|work(?:\s+was)?)\s*[:=-]\s*(.+?)\s*$/i);
  if (desc) {
    result.description = desc[1].trim().replace(/[.,;]+$/, '');
    text = text.replace(desc[0], ' ');
  }

  const pcLabelled = text.match(/\b(?:post\s?code|pc)\s*[:=-]?\s*([A-Z]{1,2}\d[A-Z\d]?(?:\s*\d[A-Z]{2})?)\b/i);
  const pcMatch = pcLabelled ?? text.match(POSTCODE);
  if (pcMatch) {
    const raw = (pcLabelled ? pcLabelled[1] : pcMatch[0]).toUpperCase().replace(/\s+/g, '');
    const full = raw.match(/^([A-Z]{1,2}\d[A-Z\d]?)(\d[A-Z]{2})$/);
    result.sitePostcode = full ? `${full[1]} ${full[2]}` : raw;
    text = text.replace(pcMatch[0], ' ');
  }

  const amountRe = /(?:£|gbp)\s*(\d[\d,]*(?:\.\d{1,2})?)\s*(k)?\b|(\d[\d,]*(?:\.\d{1,2})?)\s*(?:pounds|quid|gbp)\b/i;
  const amountMatch = text.match(amountRe);
  if (amountMatch) {
    const num = Number((amountMatch[1] ?? amountMatch[3]).replace(/,/g, ''));
    result.amount = Math.round(num * (amountMatch[2] ? 1000 : 1) * 100);
    text = text.replace(amountMatch[0], ' ');
  }

  const { dates, rest } = extractDates(text, today);
  result.workDates = dates;
  text = rest;

  const addr = text.match(
    /\b(?:at|address|site)\s*[:=-]?\s*(?:at\s+)?(.+?)(?=\s+(?:work|worked|job|done|completed|for|amount|total|invoice|post\s?code|pc)\b|[;]|\s*$)/i,
  );
  if (addr) {
    const cleaned = addr[1]
      .replace(/(?:\s*,){2,}/g, ',')
      .replace(/(?:[\s,.-]+(?:on|the|and|with))*[\s,.-]*$/i, '')
      .trim();
    if (cleaned && !(client && norm(cleaned) === norm(client.name))) result.siteAddress = cleaned;
  }
  return result;
}
