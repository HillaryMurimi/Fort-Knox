import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { SalesMeetingCalendar } from '@/components/sales/sales-meeting-calendar';
import type { Meeting } from './sales-success';
const meeting: Meeting = { _id: 'meeting', startsAt: '2026-11-03T07:00:00Z', endsAt: '2026-11-03T07:30:00Z', timezone: 'Africa/Nairobi', representativeId: 'representative', type: 'DEMO', status: 'SCHEDULED', revision: 0 };
const act = async (work: () => Promise<unknown>) => { await work(); };
describe('Calendar evidence and review UI', () => {
  it('distinguishes manual scheduling from external confirmation and labels the actual timezone', () => {
    const html = renderToStaticMarkup(<SalesMeetingCalendar customerId="customer" meeting={meeting} admin pending={false} act={act}/>);
    expect(html).toContain('Not connected'); expect(html).toContain('no external confirmation'); expect(html).toContain('Africa/Nairobi'); expect(html).toContain('10:00'); expect(html).toContain('Check actual availability'); expect(html).toContain('Review and create requested invitation');
  });
  it('exposes only reconciliation to delegates and escapes provider references', () => {
    const html = renderToStaticMarkup(<SalesMeetingCalendar customerId="customer" meeting={{ ...meeting, calendar: { provider: 'GOOGLE', status: 'CONFIRMED', eventId: '<script>unsafe</script>' } }} admin={false} pending={false} act={act}/>);
    expect(html).toContain('Synchronize actual provider event'); expect(html).not.toContain('value="CREATE"'); expect(html).not.toContain('value="CANCEL"'); expect(html).not.toContain('value="RESCHEDULE"'); expect(html).toContain('&lt;script&gt;'); expect(html).not.toContain('<script>');
  });
  it('offers no resend for uncertain operations', () => {
    const html = renderToStaticMarkup(<SalesMeetingCalendar customerId="customer" meeting={{ ...meeting, calendar: { provider: 'MICROSOFT', status: 'UNCERTAIN', errorCode: 'CALENDAR_OUTCOME_UNKNOWN' } }} admin pending={false} act={act}/>);
    expect(html).toContain('CALENDAR_OUTCOME_UNKNOWN'); expect(html).toContain('Synchronize actual provider event'); expect(html).not.toContain('value="CREATE"'); expect(html).toContain('without automatically sending another invitation');
  });
});
