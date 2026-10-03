'use client';
import { StatusSelect } from '@/components/ui';
import { useState } from 'react';
import { useCreateTenantMutation } from '@/hooks/queries/use-tenant-queries';
import type { Tenant } from '@/lib/data/resource-types';

export function TenantForm({ organizationId, tenant, onDone, onCancel }: { organizationId: string; tenant?: Tenant; onDone: () => void; onCancel: () => void }) {
  const create = useCreateTenantMutation(organizationId);
  const [userId, setUserId] = useState(tenant?.userId ?? '');
  const [status, setStatus] = useState<Tenant['status']>(tenant?.status ?? 'PROSPECT');
  const [last4, setLast4] = useState(tenant?.nationalIdLast4 ?? '');
  const [notes, setNotes] = useState(tenant?.notes ?? '');
  const pending = create.isPending;

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    try {
      const trimmedLast4 = last4.trim();
      const trimmedNotes = notes.trim();
      await create.mutateAsync({
        userId: userId.trim(),
        status,
        ...(trimmedLast4 ? { nationalIdLast4: trimmedLast4 } : {}),
        ...(trimmedNotes ? { notes: trimmedNotes } : {}),
      });
      onDone();
    } catch {}
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <label>
        <span className="field-label">User ID</span>
        <input required value={userId} onChange={(e) => setUserId(e.target.value)} placeholder="Existing user identifier" />
      </label>
      <label>
        <span className="field-label">Tenant status</span>
        <StatusSelect domain="entity" value={status} onChange={(e) => setStatus(e.target.value as Tenant['status'])}>
          {['PROSPECT', 'ACTIVE', 'INACTIVE', 'BLACKLISTED'].map((x) => (
            <option key={x}>{x}</option>
          ))}
        </StatusSelect>
      </label>
      <label>
        <span className="field-label">National ID last 4</span>
        <input maxLength={4} value={last4} onChange={(e) => setLast4(e.target.value.replace(/\D/g, ''))} />
      </label>
      <label>
        <span className="field-label">Notes</span>
        <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>
      <div className="flex justify-end gap-2">
        <button type="button" className="btn-secondary" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn-primary" disabled={pending}>{pending ? 'Creating…' : 'Create tenant'}</button>
      </div>
    </form>
  );
}