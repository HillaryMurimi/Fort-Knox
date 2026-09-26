import './globals.css';
import { ThemeProvider } from '@/providers/theme-provider';
import type { Metadata } from 'next';
import { QueryProvider } from '@/providers/query-provider';
import { AuthProvider } from '@/context/auth-context';
import { OrganizationProvider } from '@/context/organization-context';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'),
  title: { default: 'Property Management Command Center', template: '%s | Property Command Center' },
  description: 'Remote control for your bricks and mortar.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider><QueryProvider>
          <AuthProvider>
            <OrganizationProvider>{children}</OrganizationProvider>
          </AuthProvider>
        </QueryProvider></ThemeProvider>
      </body>
    </html>
  );
}
