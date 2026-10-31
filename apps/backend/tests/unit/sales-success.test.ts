import { describe, expect, it } from "vitest";
import { Types } from "mongoose";
import {
  assertSuccessPermission,
  customerScope,
} from "../../src/modules/sales/sales-success.repository.js";
import { onboardingProgress } from "../../src/modules/sales/sales-success.service.js";
import {
  meetingSchema,
  customerSchema,
} from "../../src/modules/sales/sales-success.schemas.js";
import { assertSalesGrantAuthority } from "../../src/modules/sales/sales-delegation.service.js";
import type { AuthenticatedUser } from "../../src/core/types/auth.js";
const auth: AuthenticatedUser = {
  userId: new Types.ObjectId(),
  isPlatformAdmin: false,
  memberships: [],
};
describe("sales success security and calculations", () => {
  it.each([
    "LANDLORD",
    "PROPERTY_MANAGER",
    "CARETAKER",
    "CONTRACTOR",
    "TENANT",
  ])("does not grant %s implicit sales access", (role) => {
    const user = {
      ...auth,
      memberships: [
        {
          organizationId: new Types.ObjectId(),
          roleIds: [],
          roles: [role],
          permissions: ["admin.manage", "role.assign"],
          scope: {
            allProperties: true,
            propertyIds: [],
            buildingIds: [],
            unitIds: [],
          },
        },
      ],
    };
    expect(() => assertSuccessPermission(user, "sales.leads.read")).toThrow();
    expect(() =>
      assertSalesGrantAuthority(user, ["sales.leads.read"]),
    ).toThrow();
  });
  it("scopes delegates to assigned records and rejects unrelated grants", () => {
    expect(customerScope(auth)).toEqual({ assignedTo: auth.userId });
    expect(customerScope({ ...auth, isPlatformAdmin: true })).toEqual({});
  });
  it("calculates exact inventory progress and distinguishes unknown expectations", () => {
    expect(onboardingProgress(100, 25)).toEqual({
      expectedUnits: 100,
      registeredUnits: 25,
      remainingUnits: 75,
      completionPercent: 25,
    });
    expect(onboardingProgress(10, 20).completionPercent).toBe(100);
    expect(onboardingProgress(undefined, 20).completionPercent).toBeNull();
  });
  it("rejects invalid meeting intervals, injection fields and invented identity links", () => {
    expect(
      meetingSchema.safeParse({
        representativeId: String(auth.userId),
        startsAt: "2026-11-10T11:00:00Z",
        endsAt: "2026-11-10T10:00:00Z",
        type: "DEMO",
      }).success,
    ).toBe(false);
    expect(
      customerSchema.safeParse({
        name: "Customer",
        properties: 1,
        units: "10",
        challenge: "Need control",
        source: "Manual",
        organizationId: String(new Types.ObjectId()),
      }).success,
    ).toBe(false);
  });
});
