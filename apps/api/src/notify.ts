import nodemailer from 'nodemailer';
import type { PrismaClient } from '@prisma/client';
import type { Env } from './env.js';

export async function notifyUser(
  prisma: PrismaClient,
  env: Env,
  user: { id: string; email?: string | null; phone?: string | null },
  input: { title: string; body: string; linkUrl?: string },
) {
  await prisma.notification.create({
    data: {
      userId: user.id,
      channel: 'IN_APP',
      title: input.title,
      body: input.body,
      linkUrl: input.linkUrl,
      status: 'SENT',
    },
  });

  if (user.email) {
    if (!env.smtpUrl) {
      await prisma.notification.create({
        data: {
          userId: user.id,
          channel: 'EMAIL',
          title: input.title,
          body: input.body,
          linkUrl: input.linkUrl,
          status: 'SKIPPED_UNCONFIGURED',
        },
      });
    } else {
      try {
        const transport = nodemailer.createTransport(env.smtpUrl);
        await transport.sendMail({
          from: 'Ninted 9ja <noreply@ninted9ja.local>',
          to: user.email,
          subject: input.title,
          text: input.body,
        });
        await prisma.notification.create({
          data: {
            userId: user.id,
            channel: 'EMAIL',
            title: input.title,
            body: input.body,
            linkUrl: input.linkUrl,
            status: 'SENT',
          },
        });
      } catch {
        await prisma.notification.create({
          data: {
            userId: user.id,
            channel: 'EMAIL',
            title: input.title,
            body: input.body,
            status: 'FAILED',
          },
        });
      }
    }
  }

  if (user.phone) {
    if (!env.smsHttpUrl) {
      await prisma.notification.create({
        data: {
          userId: user.id,
          channel: 'SMS',
          title: input.title,
          body: input.body,
          status: 'SKIPPED_UNCONFIGURED',
        },
      });
    } else {
      try {
        const response = await fetch(env.smsHttpUrl, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            ...(env.smsApiKey ? { authorization: `Bearer ${env.smsApiKey}` } : {}),
          },
          body: JSON.stringify({ to: user.phone, text: `${input.title}: ${input.body}` }),
        });
        await prisma.notification.create({
          data: {
            userId: user.id,
            channel: 'SMS',
            title: input.title,
            body: input.body,
            status: response.ok ? 'SENT' : 'FAILED',
          },
        });
      } catch {
        await prisma.notification.create({
          data: {
            userId: user.id,
            channel: 'SMS',
            title: input.title,
            body: input.body,
            status: 'FAILED',
          },
        });
      }
    }
  }

  if (!env.pushHttpUrl) {
    await prisma.notification.create({
      data: {
        userId: user.id,
        channel: 'PUSH',
        title: input.title,
        body: input.body,
        linkUrl: input.linkUrl,
        status: 'SKIPPED_UNCONFIGURED',
      },
    });
  } else {
    try {
      const response = await fetch(env.pushHttpUrl, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(env.pushApiKey ? { authorization: `Bearer ${env.pushApiKey}` } : {}),
        },
        body: JSON.stringify({ userId: user.id, title: input.title, body: input.body, linkUrl: input.linkUrl }),
      });
      await prisma.notification.create({
        data: {
          userId: user.id,
          channel: 'PUSH',
          title: input.title,
          body: input.body,
          linkUrl: input.linkUrl,
          status: response.ok ? 'SENT' : 'FAILED',
        },
      });
    } catch {
      await prisma.notification.create({
        data: {
          userId: user.id,
          channel: 'PUSH',
          title: input.title,
          body: input.body,
          status: 'FAILED',
        },
      });
    }
  }
}
