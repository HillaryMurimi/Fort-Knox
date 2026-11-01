'use client';
import { useState } from 'react';
import { Button, Alert } from '@/components/ui';
import { resolveApiBaseUrl } from '@/lib/api';
export function SalesUnsubscribe({ token }: { token: string }) {
  const [status, setStatus] = useState<'READY' | 'BUSY' | 'DONE' | 'ERROR'>('READY');
  async function confirm() {
    setStatus('BUSY');
    try {
      const response = await fetch(resolveApiBaseUrl() + '/sales/outreach/unsubscribe', { method: 'POST', credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, confirm: true }) });
      if (!response.ok) throw new Error('Request failed'); setStatus('DONE');
    } catch { setStatus('ERROR'); }
  }
  return <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center space-y-5 px-6 py-12">
    <p className="text-sm font-semibold tracking-widest">DAPINNI</p><h1 className="text-3xl font-semibold">Stop sales updates</h1>
    <p>Confirm below to stop sales outreach associated with this invitation. Your account, security alerts and property operations notifications remain available.</p>
    {status === 'DONE' ? <p role="status">Sales updates have been stopped where this request matched an invitation.</p> : <Button disabled={status === 'BUSY'} onClick={() => void confirm()}>{status === 'BUSY' ? 'Saving preference...' : 'Confirm stop sales updates'}</Button>}
    {status === 'ERROR' && <Alert>Unable to save your preference. Please retry.</Alert>}
  </main>;
}
