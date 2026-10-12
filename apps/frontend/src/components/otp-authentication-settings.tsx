'use client';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Alert, Button, Input } from '@/components/ui';
type Channel = 'EMAIL' | 'SMS';
export interface OtpSettings {
  environment: string; defaultChannel: 'EMAIL'; sensitivePolicy: string;
  channels: Array<{ channel: Channel; provider: string; configured: boolean; runtimeEnabled: boolean; enabled: boolean; available: boolean; tested: boolean; verifiedAt: string | null; health: string; productionReady: boolean }>;
  history: Array<{ _id: string; action: string; occurredAt: string; metadata?: { channel?: Channel; key?: string } }>;
  failures: Array<{ _id: string; action: string; occurredAt: string; metadata?: { channel?: Channel } }>;
}
export function OtpAuthenticationSettings() {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ['otp-authentication'], queryFn: () => api<OtpSettings>('/platform-control/otp-authentication') });
  const [test, setTest] = useState<{ testToken: string; channel: Channel; destination: string; expiresAt: string } | null>(null);
  const [code, setCode] = useState(''), [reason, setReason] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const send = useMutation({ mutationFn: (channel: Channel) => api<NonNullable<typeof test>>('/platform-control/otp-authentication/tests', { method: 'POST', body: JSON.stringify({ channel }) }),
    onSuccess: result => { setTest(result); setCode(''); setNotice(null); } });
  const verify = useMutation({ mutationFn: () => api('/platform-control/otp-authentication/tests/verify', { method: 'POST', body: JSON.stringify({ testToken: test?.testToken, code }) }),
    onSuccess: () => { setTest(null); setCode(''); setNotice('Receipt verified. Activation still requires an explicit security change.'); void queryClient.invalidateQueries({ queryKey: ['otp-authentication'] }); } });
  const change = useMutation({ mutationFn: async ({ channel, enabled }: { channel: Channel; enabled: boolean }) => {
    const keys = enabled ? [channel + '_NOTIFICATIONS', channel + '_OTP'] : [channel + '_OTP', channel + '_NOTIFICATIONS'];
    for (const key of keys) await api('/platform-control/switches/' + key, { method: 'PATCH', body: JSON.stringify({ mode: enabled ? 'ON' : 'OFF', reason, confirm: true }) });
  }, onSuccess: () => { setNotice('Authentication channel updated and audited.'); setReason(''); void queryClient.invalidateQueries({ queryKey: ['otp-authentication'] }); } });
  const busy = send.isPending || verify.isPending || change.isPending;
  const error = query.error ?? send.error ?? verify.error ?? change.error;
  return <section className="space-y-5" aria-labelledby="otp-settings-title">
    <div><h2 id="otp-settings-title" className="text-xl font-semibold">OTP authentication</h2><p className="mt-2 text-sm text-muted-foreground">Email is the initial launch default. SMS remains optional until its configured sender and actual receipt are verified. Provider acceptance alone does not prove delivery.</p></div>
    {query.isLoading && <p role="status">Checking authentication channels…</p>}
    {error && <div role="alert"><Alert tone="destructive">{error.message}</Alert><Button type="button" variant="outline" onClick={() => void query.refetch()}>Refresh status</Button></div>}
    {notice && <p role="status" className="text-sm">{notice}</p>}
    {query.data && <><p className="text-xs text-muted-foreground">Environment: {query.data.environment}. Sensitive changes retain password, email and SMS verification.</p>
      <div className="grid gap-4 lg:grid-cols-2">{query.data.channels.map(item => <article key={item.channel} className="space-y-4 rounded-xl border border-border bg-card p-5">
        <h3 className="font-semibold">{item.channel === 'EMAIL' ? 'Email OTP' : 'SMS OTP'} · {item.provider}</h3>
        <dl className="grid grid-cols-2 gap-2 text-sm">{[
          ['Configured', item.configured], ['Runtime permitted', item.runtimeEnabled], ['Receipt tested', item.tested], ['Enabled', item.enabled], ['Available for login', item.available], ['Production ready', item.productionReady],
        ].map(([label, value]) => <div key={String(label)}><dt className="text-muted-foreground">{label}</dt><dd className="font-medium">{value ? 'Yes' : 'No'}</dd></div>)}</dl>
        <p className="text-xs text-muted-foreground">{item.verifiedAt ? 'Receipt verified ' + new Date(item.verifiedAt).toLocaleString() : 'No current receipt-verification evidence.'}</p>
        {!item.runtimeEnabled && <p className="text-xs text-muted-foreground">The host operator must set the provider enable flag before activation. Configured SMS can still receive an explicit diagnostic test.</p>}
        <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" disabled={!item.configured || busy} loading={send.isPending && send.variables === item.channel} onClick={() => send.mutate(item.channel)}>Test delivery</Button>
          <Button type="button" variant="outline" disabled={busy || reason.trim().length < 3 || !item.enabled && (!item.configured || !item.tested || !item.runtimeEnabled)} onClick={() => change.mutate({ channel: item.channel, enabled: !item.enabled })}>{item.enabled ? 'Disable' : 'Enable'} {item.channel === 'EMAIL' ? 'email' : 'SMS'}</Button></div>
      </article>)}</div>
      <label className="block text-sm font-medium">Reason for channel change<Input value={reason} onChange={event => setReason(event.target.value)} maxLength={1000} className="mt-2" /></label>
      <Alert tone="warning">The last usable channel cannot be disabled. During an email-only launch, enabling SMS uses the audited host-operator procedure because sensitive actions still require both channels.</Alert>
      <div className="grid gap-4 lg:grid-cols-2"><div><h3 className="font-semibold">Recent delivery failures</h3>{query.data.failures.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">No recorded failures in the returned history.</p> : <ul className="mt-2 space-y-2 text-sm">{query.data.failures.map(item => <li key={item._id}>{item.metadata?.channel ?? 'Verification'} · {new Date(item.occurredAt).toLocaleString()}</li>)}</ul>}</div>
      <div><h3 className="font-semibold">Configuration and test history</h3>{query.data.history.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">No recorded changes.</p> : <ul className="mt-2 space-y-2 text-xs">{query.data.history.map(item => <li key={item._id}>{item.metadata?.channel ?? item.metadata?.key ?? 'Platform'} · {item.action} · {new Date(item.occurredAt).toLocaleString()}</li>)}</ul>}</div></div>
    </>}
    {test && <form className="space-y-3 rounded-xl border border-border bg-card p-5" aria-busy={verify.isPending} onSubmit={event => { event.preventDefault(); verify.mutate(); }}>
      <h3 className="font-semibold">Confirm {test.channel === 'EMAIL' ? 'email' : 'SMS'} test receipt</h3><p className="text-sm text-muted-foreground">Enter the test code received at {test.destination}. This test grants no login or step-up session.</p>
      <label className="block text-sm">Test verification code<Input autoFocus inputMode="numeric" autoComplete="one-time-code" maxLength={6} pattern="[0-9]{6}" value={code} onChange={event => setCode(event.target.value.replace(/\D/g, ''))} required className="mt-2" /></label>
      <div className="flex gap-2"><Button type="submit" disabled={code.length !== 6 || verify.isPending} loading={verify.isPending}>Verify receipt</Button><Button type="button" variant="ghost" disabled={verify.isPending} onClick={() => { setTest(null); setCode(''); }}>Cancel test</Button></div>
    </form>}
  </section>;
}
