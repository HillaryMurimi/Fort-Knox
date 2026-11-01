import type { Metadata } from 'next';
import { SalesReferral } from '@/components/sales/sales-referral';
export const metadata: Metadata = { title: 'Your Dapinni invitation', robots: { index: false, follow: false }, referrer: 'no-referrer' };
export default async function ReferralPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <SalesReferral token={token} />;
}
