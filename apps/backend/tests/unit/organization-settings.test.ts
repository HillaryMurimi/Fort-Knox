import { describe, expect, it } from "vitest";
import { updateOrganizationSchema } from "../../src/modules/organizations/organization.schemas.js";
import { Organization } from "../../src/database/models/Organization.js";

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

  it('defaults existing and new organization documents to the legacy KES region', () => {
    const organization = new Organization({ name: 'Acacia', slug: 'acacia' });
    expect(organization.regionalProfile.toObject()).toMatchObject({
      countryCode: 'KE', baseCurrency: 'KES', allowedCurrencies: ['KES'], locale: 'en-KE', timeZone: 'Africa/Nairobi',
    });
  });

  it('accepts locale and time zone edits but rejects country and currency switches', () => {
    expect(updateOrganizationSchema.parse({ regionalProfile: { locale: 'en-GB', timeZone: 'Europe/London' } }).regionalProfile).toEqual({ locale: 'en-GB', timeZone: 'Europe/London' });
    expect(() => updateOrganizationSchema.parse({ regionalProfile: { locale: 'invalid_locale' } })).toThrow();
    expect(() => updateOrganizationSchema.parse({ regionalProfile: { timeZone: 'Mars/Olympus' } })).toThrow();
    expect(() => updateOrganizationSchema.parse({ regionalProfile: { baseCurrency: 'USD' } })).toThrow();
    expect(() => updateOrganizationSchema.parse({ regionalProfile: { countryCode: 'US' } })).toThrow();
  });
});
