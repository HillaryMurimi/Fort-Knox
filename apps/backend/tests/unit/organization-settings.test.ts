import { describe, expect, it } from "vitest";
import { updateOrganizationSchema } from "../../src/modules/organizations/organization.schemas.js";

describe("organization contact settings validation", () => {
  it("accepts bounded resident contact settings", () => {
    expect(
      updateOrganizationSchema.parse({
        settings: {
          managementPhone: "+254700000001",
          managementEmail: "office@example.com",
          emergencyPhone: "+254700000999",
          officeHours: "Mon-Fri 08:00-17:00",
        },
      }).settings?.managementEmail,
    ).toBe("office@example.com");
  });

  it("rejects invalid contact values and unknown settings", () => {
    expect(() =>
      updateOrganizationSchema.parse({
        settings: { managementEmail: "not-an-email" },
      }),
    ).toThrow();
    expect(() =>
      updateOrganizationSchema.parse({ settings: { privateKey: "secret" } }),
    ).toThrow();
    expect(() => updateOrganizationSchema.parse({})).toThrow();
  });
});
