import { api } from "../api";
import type { Property, Unit } from "./resource-types";

export type SetupUnit = Pick<
  Unit,
  "name" | "code" | "unitType" | "monthlyRent"
> &
  Partial<
    Pick<
      Unit,
      "unitTypeLabel" | "bedrooms" | "bathrooms" | "areaSqm" | "serviceCharge"
    >
  >;
export interface SetupFloor {
  name: string;
  code: string;
  level: number;
  units: SetupUnit[];
}
export interface SetupBuilding {
  name: string;
  code: string;
  floors: SetupFloor[];
}
export interface PropertySetupInput {
  property: Pick<Property, "name" | "code" | "propertyType" | "address"> & {
    description?: string;
    location?: Property["location"] | undefined;
  };
  structureMode: "BUILDINGS" | "STANDALONE";
  buildings: SetupBuilding[];
}
export interface PropertySetupResult {
  propertyId: string;
  buildingCount: number;
  floorCount: number;
  unitCount: number;
  estimatedMonthlyRent: number;
}

export const propertySetupClient = {
  create: (organizationId: string, input: PropertySetupInput) =>
    api<PropertySetupResult>(
      `/organizations/${organizationId}/property-setups`,
      { method: "POST", body: JSON.stringify(input) },
    ),
};

export interface UnitMix {
  unitType: Unit["unitType"];
  unitTypeLabel?: string;
  count: number;
  monthlyRent: number;
}

export function generateSetup(
  buildingNames: string[],
  floorCount: number,
  includeGround: boolean,
  mix: UnitMix[],
  mode: PropertySetupInput["structureMode"],
  prefix = "",
  startAt = 1,
): SetupBuilding[] {
  return buildingNames.map((name, buildingIndex) => {
    const buildingCode =
      mode === "STANDALONE" ? "SITE" : `B${buildingIndex + 1}`;
    const levels =
      mode === "STANDALONE"
        ? [0]
        : Array.from(
            { length: floorCount },
            (_, index) => index + (includeGround ? 0 : 1),
          );
    return {
      name: mode === "STANDALONE" ? "Site" : name.trim(),
      code: buildingCode,
      floors: levels.map((level) => {
        const floorCode = level === 0 ? "G" : `F${level}`;
        let number = startAt;
        const units = mix.flatMap((item) =>
          Array.from({ length: item.count }, () => {
            const suffix = String(number++).padStart(2, "0");
            const code = `${prefix || (mode === "STANDALONE" ? "S" : buildingCode)}-${floorCode}-${suffix}`;
            return {
              name: code,
              code,
              unitType: item.unitType,
              ...(item.unitTypeLabel
                ? { unitTypeLabel: item.unitTypeLabel }
                : {}),
              monthlyRent: item.monthlyRent,
            };
          }),
        );
        return {
          name: level === 0 ? "Ground Floor" : `Floor ${level}`,
          code: floorCode,
          level,
          units,
        };
      }),
    };
  });
}

export function summarizeSetup(buildings: SetupBuilding[]) {
  const floors = buildings.flatMap((building) => building.floors);
  const units = floors.flatMap((floor) => floor.units);
  const mix = units.reduce<Record<string, number>>((result, unit) => {
    const label = unit.unitTypeLabel || unit.unitType;
    result[label] = (result[label] || 0) + 1;
    return result;
  }, {});
  return {
    buildingCount: buildings.length,
    floorCount: floors.length,
    unitCount: units.length,
    estimatedMonthlyRent: units.reduce(
      (sum, unit) => sum + Math.round(unit.monthlyRent * 100),
      0,
    ) / 100,
    mix,
  };
}
