type UnitRow = { _id: unknown; status: string };
type TenancyRow = { unitId: unknown; status: string; startDate: Date; movedOutAt?: Date | null; terminatedAt?: Date | null };

export function currentOccupancy(units: UnitRow[], tenancies: TenancyRow[], asOf: Date) {
  const activeByUnit = new Map<string, number>();
  for (const tenancy of tenancies) {
    if (!['ACTIVE', 'NOTICE'].includes(tenancy.status) || tenancy.startDate > asOf ||
        (tenancy.movedOutAt && tenancy.movedOutAt <= asOf) ||
        (tenancy.terminatedAt && tenancy.terminatedAt <= asOf)) continue;
    const id = String(tenancy.unitId);
    activeByUnit.set(id, (activeByUnit.get(id) ?? 0) + 1);
  }

  let rentable = 0, occupied = 0, vacant = 0, reserved = 0, maintenance = 0;
  let conflictingTenancies = 0, statusMismatches = 0, inactiveWithTenancy = 0;
  for (const unit of units) {
    const count = activeByUnit.get(String(unit._id)) ?? 0;
    if (count > 1) conflictingTenancies++;
    if (unit.status === 'INACTIVE') {
      if (count) inactiveWithTenancy++;
      continue;
    }
    rentable++;
    if (count) occupied++; else vacant++;
    if (unit.status === 'RESERVED' && !count) reserved++;
    if (unit.status === 'MAINTENANCE') maintenance++;
    if ((unit.status === 'OCCUPIED') !== Boolean(count) && ['OCCUPIED', 'VACANT'].includes(unit.status)) statusMismatches++;
  }
  const knownIds = new Set(units.map(unit => String(unit._id)));
  const missingUnits = [...activeByUnit.keys()].filter(id => !knownIds.has(id)).length;
  return {
    rentable, occupied, vacant, reserved, maintenance,
    quality: { conflictingTenancies, statusMismatches, inactiveWithTenancy, missingUnits,
      complete: conflictingTenancies === 0 && statusMismatches === 0 && inactiveWithTenancy === 0 && missingUnits === 0 },
  };
}
