import type { Metadata } from 'next';
import { BRAND } from '@/lib/brand';
import { LandingPage } from '@/components/marketing/landing/landing-page';

export const metadata: Metadata = {
  title: { absolute: BRAND.title },
  description: BRAND.description,
  alternates: { canonical: '/' },
  openGraph: {
    title: BRAND.title,
    siteName: BRAND.name,
    description: BRAND.description,
    type: 'website',
    images: [{ url: '/marketing/portfolio-blue-hour.png', width: 1680, height: 945, alt: 'A connected residential property portfolio at blue hour' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: BRAND.title,
    description: BRAND.description,
    images: ['/marketing/portfolio-blue-hour.png'],
  },
};

export default function HomePage() {
  return <LandingPage />;
}
