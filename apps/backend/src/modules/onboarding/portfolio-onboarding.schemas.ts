import { z } from "zod";
export const portfolioStages = z.enum([
  "PROFILE",
  "PROPERTY",
  "UNITS",
  "PEOPLE",
  "DASHBOARD",
]);
export const portfolioDraftSchema = z
  .object({
    expectedRevision: z.number().int().nonnegative(),
    stage: portfolioStages,
    property: z
      .object({
        name: z.string().max(160),
        code: z.string().max(50),
        address: z.string().max(200),
        city: z.string().max(100),
        propertyType: z.enum([
          "APARTMENT",
          "RESIDENTIAL_ESTATE",
          "COMMERCIAL",
          "MIXED_USE",
          "OFFICE",
          "RETAIL",
          "WAREHOUSE",
          "OTHER",
        ]),
      })
      .strict()
      .optional(),
    importRows: z
      .array(
        z.partialRecord(
          z.enum([
            "propertyName",
            "propertyCode",
            "address",
            "city",
            "country",
            "propertyType",
            "buildingName",
            "buildingCode",
            "floorName",
            "floorLevel",
            "unitCode",
            "unitType",
            "unitTypeLabel",
            "monthlyRentMinor",
            "depositMinor",
            "openingBalanceMinor",
            "occupancyStatus",
            "tenantFirstName",
            "tenantLastName",
            "tenantPhone",
            "tenantEmail",
            "tenancyStart",
            "tenancyEnd",
            "caretakerFirstName",
            "caretakerLastName",
            "caretakerPhone",
            "caretakerEmail",
          ]),
          z.union([
            z.string().max(500),
            z.number().finite(),
            z.boolean(),
            z.null(),
          ]),
        ),
      )
      .max(500)
      .optional(),
  })
  .strict();
export const dashboardVisitSchema = z.object({}).strict();
