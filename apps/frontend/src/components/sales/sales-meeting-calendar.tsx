"use client";
import { useState, type FormEvent } from 'react';
import { api } from '@/lib/api';
import { Alert, Button } from '@/components/ui';
import type { Meeting } from '@/lib/data/sales-success';
const input = 'mt-1 min-w-0 w-full rounded-lg border border-border bg-background p-2 text-sm';
type Availability = { checkedAt: string; busy: { startsAt: string; endsAt: string }[]; provider: string };
export function SalesMeetingCalendar({ customerId, meeting, admin, pending, act }: { customerId: string; meeting: Meeting; admin: boolean; pending: boolean; act: (work: () => Promise<unknown>) => Promise<void> }) {
  const [action, setAction] = useState(meeting.calendar ? 'SYNC' : 'CREATE'), [availability, setAvailability] = useState<Availability>(), [checking, check] = useState(false), [error, setError] = useState('');
  const path = '/sales/success/customers/' + customerId;
  const timezone = meeting.timezone ?? 'Africa/Nairobi';
  const localTime = (value: string) => new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short', timeZone: timezone }).format(new Date(value));
  async function inspect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); check(true); setError(''); setAvailability(undefined);
    const data = new FormData(event.currentTarget);
    try { setAvailability(await api<Availability>(path + '/calendar/availability?' + new URLSearchParams({ representativeId: meeting.representativeId ?? '', startsAt: String(data.get('startsAt')), endsAt: String(data.get('endsAt')) }))); }
    catch (error) { setError(error instanceof Error ? error.message : 'Actual calendar availability is unavailable.'); } finally { check(false); }
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const values = new FormData(event.currentTarget);
    void act(() => api(path + '/meetings/' + meeting._id + '/calendar', { method: 'POST', body: JSON.stringify({ revision: meeting.revision, commandId: crypto.randomUUID(), action, evidence: values.get('evidence'), ...(action === 'RESCHEDULE' ? { startsAt: values.get('startsAt'), endsAt: values.get('endsAt') } : {}), ...(['CREATE', 'RESCHEDULE'].includes(action) && values.get('originApprovalId') ? { originApprovalId: values.get('originApprovalId') } : {}), ...(values.get('timezone') ? { timezone: values.get('timezone') } : {}) }) }));
  }
  return <details className="min-w-0 rounded-lg border p-3"><summary className="cursor-pointer text-sm font-medium">External calendar: {meeting.calendar?.status ?? 'Not connected'}</summary>
    <p className="mt-2 text-sm">Provider: {meeting.calendar?.provider ?? 'Not connected to this meeting'}. A manual scheduled meeting has no external confirmation. An invitation request does not prove delivery or attendance.</p>
    <p className="mt-2 text-sm">{localTime(meeting.startsAt)} to {localTime(meeting.endsAt)} ({timezone})</p>
    {meeting.calendar?.eventId && <p className="break-all text-xs">Provider event: {meeting.calendar.eventId}</p>}
    {meeting.calendar?.errorCode && <Alert>{meeting.calendar.errorCode}. Synchronize provider facts before reviewing another operation.</Alert>}
    <p className="mt-2 text-xs">Enter ISO times with an explicit offset, such as 2026-11-03T10:00:00+03:00. Display timezone defaults to the customer organization when configured. Availability is rechecked before dispatch.</p>
    {meeting.representativeId && <form className="mt-3 grid min-w-0 gap-3" onSubmit={event => void inspect(event)}>
      <label>Availability starts<input name="startsAt" required defaultValue={meeting.startsAt} className={input}/></label><label>Availability ends<input name="endsAt" required defaultValue={meeting.endsAt} className={input}/></label>
      <Button variant="outline" disabled={checking || pending}>Check actual availability</Button>
    </form>}
    {checking && <p role="status">Checking the authorized calendar...</p>}
    {error && <Alert>{error}</Alert>}
    {availability && <div role="status" className="mt-2 text-sm"><p>{availability.provider} checked {new Date(availability.checkedAt).toLocaleString()}. No reservation was created.</p>{availability.busy.length ? <ul>{availability.busy.map((period, n) => <li key={n}>{new Date(period.startsAt).toLocaleString()} to {new Date(period.endsAt).toLocaleString()}</li>)}</ul> : <p>No busy interval was returned for this window; booking still requires a fresh conflict check.</p>}</div>}
    {(admin || meeting.calendar) && <form className="mt-3 grid min-w-0 gap-3" onSubmit={submit}>
      <label>Calendar action<select aria-label="Calendar action" value={action} onChange={event => setAction(event.target.value)} className={input}>
        {meeting.calendar && <option value="SYNC">Synchronize actual provider event</option>}
        {admin && meeting.status === 'SCHEDULED' && (!meeting.calendar || (meeting.calendar.status === 'FAILED' && !meeting.calendar.attemptedAt)) && <option value="CREATE">Review and create requested invitation</option>}
        {admin && meeting.calendar?.eventId && ['CONFIRMED', 'CONFLICT'].includes(meeting.calendar.status) && meeting.status === 'SCHEDULED' && <option value="RESCHEDULE">Review and reschedule the existing event</option>}
        {admin && meeting.calendar?.eventId && ['CONFIRMED', 'CONFLICT'].includes(meeting.calendar.status) && <option value="CANCEL">Review and cancel the external event</option>}
      </select></label>
      {action === 'RESCHEDULE' && <><label>New meeting starts<input name="startsAt" required className={input}/></label><label>New meeting ends<input name="endsAt" required className={input}/></label></>}
      {['CREATE', 'RESCHEDULE'].includes(action) && <label>Approved coordinator proposal ID (optional)<input name="originApprovalId" pattern="[a-fA-F0-9]{24}" className={input}/></label>}
      <label>Display timezone (optional)<input name="timezone" placeholder="Organization default" className={input}/></label>
      <label>Customer selection and review evidence<textarea name="evidence" required minLength={20} maxLength={2000} className={input}/></label>
      <p className="text-xs">Creating, rescheduling and cancelling invitations require fresh administrator assurance. An uncertain operation is reconciled without automatically sending another invitation.</p>
      <Button className="h-auto max-w-full whitespace-normal" disabled={pending || (!admin && !meeting.calendar)}>Queue reviewed calendar operation</Button>
    </form>}
  </details>;
}
