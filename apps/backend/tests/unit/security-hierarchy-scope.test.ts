import { describe, expect, it } from "vitest";
import { Types } from "mongoose";
import { hierarchicalScopeClauses } from "../../src/modules/security/security.service.js";

describe("security hierarchy scope clauses", () => {
  it("separates unit, building, and property-level records", () => {
    const propertyId = new Types.ObjectId();
    const buildingId = new Types.ObjectId();
    const unitId = new Types.ObjectId();
    expect(
      hierarchicalScopeClauses([propertyId], [buildingId], [unitId]),
    ).toEqual([
      { unitId: { $in: [unitId] } },
      { unitId: { $exists: false }, buildingId: { $in: [buildingId] } },
      {
        unitId: { $exists: false },
        buildingId: { $exists: false },
        propertyId: { $in: [propertyId] },
      },
    ]);
  });

  it("creates a match-nothing scope when no hierarchy is assigned", () => {
    expect(hierarchicalScopeClauses([], [], [])).toEqual([
      { unitId: { $in: [] } },
      { unitId: { $exists: false }, buildingId: { $in: [] } },
      {
        unitId: { $exists: false },
        buildingId: { $exists: false },
        propertyId: { $in: [] },
      },
    ]);
  });
});
