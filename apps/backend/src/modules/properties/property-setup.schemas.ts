import { z } from 'zod';
import { createPropertySchema } from './property.schemas.js';
import { unitType } from '../units/unit.schemas.js';

const code = z.string().trim().min(1).max(50).regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/, 'Use letters, numbers, hyphens or underscores');
const money = z.number().finite().nonnegative().max(1_000_000_000).refine(value => Math.abs(value * 100 - Math.round(value * 100)) < 0.000001, 'Use at most two decimal places');
const unit = z.object({
  name: z.string().trim().min(1).max(100), code, unitType,
  unitTypeLabel: z.string().trim().min(1).max(100).optional(),
  monthlyRent: money,
  serviceCharge: money.optional(),
  bedrooms: z.number().int().min(0).max(100).optional(),
  bathrooms: z.number().int().min(0).max(100).optional(),
  areaSqm: z.number().finite().positive().optional()
}).strict().superRefine((value, ctx) => {
  if (value.unitType === 'OTHER' && !value.unitTypeLabel) ctx.addIssue({ code: 'custom', path: ['unitTypeLabel'], message: 'Name the custom unit type' });
});
const floor = z.object({ name: z.string().trim().min(1).max(100), code, level: z.number().int().min(-10).max(300), units: z.array(unit).min(1).max(100) }).strict();
const building = z.object({ name: z.string().trim().min(1).max(160), code, floors: z.array(floor).min(1).max(100) }).strict();

export const propertySetupSchema = z.object({
  property: createPropertySchema,
  structureMode: z.enum(['BUILDINGS', 'STANDALONE']),
  buildings: z.array(building).min(1).max(20)
}).strict().superRefine((value, ctx) => {
  if (value.structureMode === 'STANDALONE' && (value.buildings.length !== 1 || value.buildings[0].floors.length !== 1)) {
    ctx.addIssue({ code: 'custom', path: ['buildings'], message: 'Standalone properties require one site and one ground level' });
  }
  let unitCount = 0;
  const buildingCodes = new Set<string>();
  for (const [bi, item] of value.buildings.entries()) {
    const buildingCode = item.code.toUpperCase();
    if (buildingCodes.has(buildingCode)) ctx.addIssue({ code: 'custom', path: ['buildings', bi, 'code'], message: 'Building code must be unique' });
    buildingCodes.add(buildingCode);
    const floorCodes = new Set<string>();
    const levels = new Set<number>();
    const unitCodes = new Set<string>();
    for (const [fi, level] of item.floors.entries()) {
      const floorCode = level.code.toUpperCase();
      if (floorCodes.has(floorCode) || levels.has(level.level)) ctx.addIssue({ code: 'custom', path: ['buildings', bi, 'floors', fi], message: 'Floor code and level must be unique per building' });
      floorCodes.add(floorCode);
      levels.add(level.level);
      for (const [ui, room] of level.units.entries()) {
        unitCount++;
        const unitCode = room.code.toUpperCase();
        if (unitCodes.has(unitCode)) ctx.addIssue({ code: 'custom', path: ['buildings', bi, 'floors', fi, 'units', ui, 'code'], message: 'Unit code must be unique in its building' });
        unitCodes.add(unitCode);
      }
    }
  }
  if (unitCount > 500) ctx.addIssue({ code: 'custom', path: ['buildings'], message: 'Create at most 500 units at a time' });
});

export type PropertySetupInput = z.infer<typeof propertySetupSchema>;
