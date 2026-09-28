import { describe, expect, it } from 'vitest';
import { generateSetup, summarizeSetup } from './property-setup';

const mix = [{ unitType: 'STUDIO' as const, count: 2, monthlyRent: 14000 }, { unitType: 'ONE_BEDROOM' as const, count: 4, monthlyRent: 18000 }];

describe('property setup generation', () => {
  it('generates a 60-unit, two-building property with unique codes and rent totals', () => {
    const buildings = generateSetup(['Building A', 'Building B'], 5, true, mix, 'BUILDINGS');
    const summary = summarizeSetup(buildings);
    expect(summary).toMatchObject({ buildingCount: 2, floorCount: 10, unitCount: 60, estimatedMonthlyRent: 1000000 });
    expect(summary.mix).toEqual({ STUDIO: 20, ONE_BEDROOM: 40 });
    const codes = buildings.flatMap(building => building.floors.flatMap(floor => floor.units.map(unit => unit.code)));
    expect(new Set(codes).size).toBe(60);
  });
  it('supports a standalone site and per-unit rent overrides without changing other units', () => {
    const buildings = generateSetup(['Ignored'], 4, true, mix, 'STANDALONE');
    expect(buildings).toHaveLength(1);
    expect(buildings[0]!.floors).toHaveLength(1);
    buildings[0]!.floors[0]!.units[0]!.monthlyRent = 16000;
    expect(summarizeSetup(buildings).estimatedMonthlyRent).toBe(102000);
    expect(buildings[0]!.floors[0]!.units[1]!.monthlyRent).toBe(14000);
  });
});
