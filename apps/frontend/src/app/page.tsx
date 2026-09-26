import type { Metadata } from 'next';
import { LandingPage } from '@/components/marketing/landing/landing-page';

export const metadata: Metadata = {
  title: 'Property Command Center - Remote Control for Your Property Portfolio',
  description: 'Control rent, tenants, maintenance, expenses, contractors, CCTV, security and property performance from one operational command center.',
  alternates: { canonical: '/' },
  openGraph: {
    title: 'Property Command Center - Remote Control for Your Property Portfolio',
    description: 'Know what is happening, what it costs and who did it across your property portfolio.',
    type: 'website',
    images: [{ url: '/marketing/portfolio-blue-hour.png', width: 1680, height: 945, alt: 'A connected residential property portfolio at blue hour' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Property Command Center',
    description: 'A command center for your bricks and mortar.',
    images: ['/marketing/portfolio-blue-hour.png'],
  },
};

export default function HomePage() {
  return <LandingPage />;
}
