import type { Metadata } from 'next';
import { Plus_Jakarta_Sans } from 'next/font/google';
import MaterialThemeProvider from '@/components/MaterialThemeProvider';
import './globals.css';

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-plus-jakarta',
});

export const metadata: Metadata = {
  title: 'nexWAVE | Operations Control',
  description: 'Sequential warehouse route operations for nexWAVE teams.',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="id" className={`${plusJakartaSans.variable} h-full`}>
      <body className="min-h-full"><MaterialThemeProvider>{children}</MaterialThemeProvider></body>
    </html>
  );
}
