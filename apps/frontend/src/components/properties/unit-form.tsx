'use client';

import { useState } from 'react';
import type { Unit } from '@/lib/data/resource-types';
import { useCreateUnitMutation, useUpdateUnitMutation } from '@/hooks/queries/use-hierarchy-queries';

const types: Unit['unitType'][] = ['SINGLE_ROOM', 'BEDSITTER', 'STUDIO', 'ONE_BEDROOM', 'TWO_BEDROOM', 'THREE_PLUS_BEDROOM', 'FOUR_BEDROOM', 'FIVE_PLUS_BEDROOM', 'MAISONETTE', 'SHOP', 'OFFICE', 'RETAIL', 'COMMERCIAL_UNIT', 'OTHER'];

export function UnitForm({ organizationId, floorId, unit, onDone, onCancel }: { organizationId: string; floorId: string; unit?: Unit; onDone: () => void; onCancel: () => void }) {
  const create = useCreateUnitMutation(organizationId);
  const update = useUpdateUnitMutation(organizationId, unit?._id ?? '');
  const [name, setName] = useState(unit?.name ?? '');
  const [code, setCode] = useState(unit?.code ?? '');
  const [unitType, setUnitType] = useState<Unit['unitType']>(unit?.unitType ?? 'ONE_BEDROOM');
  const [unitTypeLabel, setUnitTypeLabel] = useState(unit?.unitTypeLabel ?? '');
  const [rent, setRent] = useState(String(unit?.monthlyRent ?? ''));
  const [service, setService] = useState(String(unit?.serviceCharge ?? ''));
  const pending = create.isPending || update.isPending;
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const input = { name: name.trim(), code: code.trim(), unitType, ...(unitType === 'OTHER' ? { unitTypeLabel: unitTypeLabel.trim() } : {}), monthlyRent: Number(rent), ...(service ? { serviceCharge: Number(service) } : {}) };
    try { if (unit) await update.mutateAsync(input); else await create.mutateAsync({ floorId, ...input }); onDone(); } catch { /* Mutation error shown below. */ }
  }
  return <form onSubmit={submit} className="space-y-4"><div className="grid grid-cols-2 gap-4"><label><span className="field-label">Name</span><input required value={name} onChange={event => setName(event.target.value)}/></label><label><span className="field-label">Code</span><input required value={code} onChange={event => setCode(event.target.value.toUpperCase())}/></label></div><label><span className="field-label">Unit type</span><select value={unitType} onChange={event => setUnitType(event.target.value as Unit['unitType'])}>{types.map(type => <option value={type} key={type}>{type.replaceAll('_', ' ')}</option>)}</select></label>{unitType === 'OTHER' && <label><span className="field-label">Custom unit type</span><input required value={unitTypeLabel} onChange={event => setUnitTypeLabel(event.target.value)} placeholder="Executive studio"/></label>}<div className="grid grid-cols-2 gap-4"><label><span className="field-label">Monthly asking rent (KES)</span><input required type="number" min="0" step="0.01" value={rent} onChange={event => setRent(event.target.value)}/></label><label><span className="field-label">Service charge (KES)</span><input type="number" min="0" step="0.01" value={service} onChange={event => setService(event.target.value)}/></label></div>{(create.error || update.error) && <p role="alert" className="text-sm text-red-700">{(create.error || update.error)?.message}</p>}<div className="flex justify-end gap-2"><button type="button" onClick={onCancel} className="btn-secondary">Cancel</button><button disabled={pending} className="btn-primary">{pending ? 'Saving...' : unit ? 'Save changes' : 'Create unit'}</button></div></form>;
}
