import type { Metadata } from 'next';
import { SalesUnsubscribe } from '@/components/sales/sales-unsubscribe';
export const metadata: Metadata = { title: 'Stop Dapinni sales updates', robots: { index: false, follow: false }, referrer: 'no-referrer' };
export default async function UnsubscribePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <SalesUnsubscribe token={token}/>;
}
