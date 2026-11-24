import nodemailer from 'nodemailer';
import type { Env } from './env.js';

export function normalizePhone(value: string): string | null {
  const compact = value.replace(/[\s()-]/g, '');
  if (/^0\d{10}$/.test(compact)) return compact;
  if (/^\+234\d{10}$/.test(compact)) return `0${compact.slice(4)}`;
  if (/^234\d{10}$/.test(compact)) return `0${compact.slice(3)}`;
  return null;
}

export async function deliverCode(env: Env, channel: 'EMAIL' | 'SMS', target: string, code: string): Promise<'sent' | 'unconfigured' | 'failed'> {
  const text = `Your Ninted 9ja code is ${code}. It expires in 10 minutes.`;
  if (channel === 'EMAIL') {
    if (!env.smtpUrl) return 'unconfigured';
    try {
      const transport = nodemailer.createTransport(env.smtpUrl);
      await transport.sendMail({ from: 'Ninted 9ja <noreply@ninted9ja.local>', to: target, subject: 'Your Ninted 9ja code', text });
      return 'sent';
    } catch {
      return 'failed';
    }
  }
  if (!env.smsHttpUrl) return 'unconfigured';
  try {
    const response = await fetch(env.smsHttpUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(env.smsApiKey ? { authorization: `Bearer ${env.smsApiKey}` } : {}) },
      body: JSON.stringify({ to: target, text }),
    });
    return response.ok ? 'sent' : 'failed';
  } catch {
    return 'failed';
  }
}
