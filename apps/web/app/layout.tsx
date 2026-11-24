import type { Metadata } from 'next';
import { Fraunces, Outfit } from 'next/font/google';
import { Shell } from '@/components/Shell';
import { SessionProvider } from '@/lib/session';
import './globals.css';

const serif = Fraunces({ subsets: ['latin'], variable: '--font-serif' });
const sans = Outfit({ subsets: ['latin'], variable: '--font-sans' });

export const metadata: Metadata = {
  title: 'Ninted 9ja',
  description: 'Buy and sell preloved and new goods across Nigeria.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${serif.variable} ${sans.variable}`} style={{ fontFamily: 'var(--font-sans), Outfit, sans-serif', ['--serif' as string]: 'var(--font-serif), Fraunces, serif' }}>
        <SessionProvider>
          <Shell>{children}</Shell>
        </SessionProvider>
      </body>
    </html>
  );
}
