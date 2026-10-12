import mongoose, { Types, type ClientSession } from "mongoose";
import { createHash } from "node:crypto";
import { z } from "zod";
import { AppError } from "../../core/errors/AppError.js";
import { AuthorizationService } from "../../core/authorization/authorization.service.js";
import type { AuthenticatedUser } from "../../core/types/auth.js";
import { Organization } from "../../database/models/Organization.js";
import { OrganizationSubscription } from "../../database/models/OrganizationSubscription.js";
import { SubscriptionPlan } from "../../database/models/SubscriptionPlan.js";
import { Property } from "../../database/models/Property.js";
import { Building } from "../../database/models/Building.js";
import { Floor } from "../../database/models/Floor.js";
import { Unit } from "../../database/models/Unit.js";
import { User } from "../../database/models/User.js";
import { Tenant } from "../../database/models/Tenant.js";
import { Tenancy } from "../../database/models/Tenancy.js";
import { RentCharge } from "../../database/models/RentCharge.js";
import { OrganizationMembership } from "../../database/models/OrganizationMembership.js";
import { Role } from "../../database/models/Role.js";
import { AuditLog } from "../../database/models/AuditLog.js";
import { AuditService } from "../audit/audit.service.js";
import { GuidedPilotService, pilotIsOpen } from "./guided-pilot.service.js";
import { loadPaidPortfolio } from "../onboarding/portfolio-access.js";
import { availableChannels } from "../auth/otp-policy.js";
import { unitType } from "../units/unit.schemas.js";

const label = z.string().trim().min(1).max(100);
const code = z
  .string()
  .trim()
  .min(1)
  .max(50)
  .regex(/^[a-zA-Z0-9_-]+$/)
  .transform((value) => value.toUpperCase());
const minor = z.number().int().min(0).max(10000000000);
const phone = z
  .string()
  .trim()
  .transform((value) => value.replace(/[\s()-]/g, ""))
  .pipe(
    z.string().regex(/^\+[1-9]\d{7,14}$/, "Use an international phone number"),
  );
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (value) =>
      Number.isFinite(Date.parse(value)) &&
      new Date(value).toISOString().slice(0, 10) === value,
    "Use a valid calendar date",
  );
export const importRowSchema = z
  .object({
    propertyName: z.string().trim().min(1).max(160),
    propertyCode: code,
    address: z.string().trim().min(1).max(200),
    city: label.default("Nairobi"),
    country: label.default("Kenya"),
    propertyType: z
      .enum([
        "APARTMENT",
        "RESIDENTIAL_ESTATE",
        "COMMERCIAL",
        "MIXED_USE",
        "OFFICE",
        "RETAIL",
        "WAREHOUSE",
        "OTHER",
      ])
      .default("APARTMENT"),
    buildingName: z.string().trim().min(1).max(160),
    buildingCode: code,
    floorName: label,
    floorLevel: z.number().int().min(-10).max(300),
    unitCode: code,
    unitType,
    unitTypeLabel: label.optional(),
    monthlyRentMinor: minor,
    depositMinor: minor.default(0),
    openingBalanceMinor: minor.default(0),
    occupancyStatus: z
      .enum(["VACANT", "OCCUPIED", "RESERVED", "UNAVAILABLE"])
      .optional(),
    tenantFirstName: label.optional(),
    tenantLastName: label.optional(),
    tenantPhone: phone.optional(),
    tenantEmail: z
      .email()
      .max(200)
      .transform((value) => value.toLowerCase())
      .optional(),
    tenancyStart: date.optional(),
    tenancyEnd: date.optional(),
    caretakerFirstName: label.optional(),
    caretakerLastName: label.optional(),
    caretakerPhone: phone.optional(),
    caretakerEmail: z
      .email()
      .max(200)
      .transform((value) => value.toLowerCase())
      .optional(),
  })
  .strict()
  .superRefine((row, ctx) => {
    const tenant = !!(
      row.tenantFirstName ||
      row.tenantLastName ||
      row.tenantPhone ||
      row.tenantEmail ||
      row.tenancyStart
    );
    if (
      (tenant || row.occupancyStatus === "OCCUPIED") &&
      !(
        row.tenantFirstName &&
        row.tenantLastName &&
        row.tenantPhone &&
        row.tenancyStart
      )
    )
      ctx.addIssue({
        code: "custom",
        message: "Occupied units require tenant names, phone and tenancy start",
      });
    if (tenant && row.occupancyStatus && row.occupancyStatus !== "OCCUPIED")
      ctx.addIssue({
        code: "custom",
        message: "A current tenancy requires OCCUPIED status",
      });
    if (
      !tenant &&
      (row.depositMinor || row.openingBalanceMinor || row.tenancyEnd)
    )
      ctx.addIssue({
        code: "custom",
        message: "Deposits and opening balances require a tenancy",
      });
    if (
      row.tenancyEnd &&
      row.tenancyStart &&
      row.tenancyEnd <= row.tenancyStart
    )
      ctx.addIssue({
        code: "custom",
        message: "Tenancy end must follow start",
      });
    if (row.unitType === "OTHER" && !row.unitTypeLabel)
      ctx.addIssue({
        code: "custom",
        message: "Name the custom unit category",
      });
    const staff = !!(
      row.caretakerFirstName ||
      row.caretakerLastName ||
      row.caretakerPhone ||
      row.caretakerEmail
    );
    if (
      staff &&
      !(row.caretakerFirstName && row.caretakerLastName && row.caretakerPhone)
    )
      ctx.addIssue({
        code: "custom",
        message: "Caretakers require names and phone",
      });
  });
export const previewImportSchema = z
  .object({ rows: z.array(z.unknown()).min(1).max(500) })
  .strict();
export const confirmImportSchema = previewImportSchema.extend({
  digest: z.string().regex(/^[a-f0-9]{64}$/),
  confirm: z.literal(true),
});
export type PilotImportRow = z.infer<typeof importRowSchema>;
type ErrorRow = { row: number; message: string };
export function validateImportRows(raw: unknown[]) {
  const rows: PilotImportRow[] = [],
    origins: number[] = [],
    errors: ErrorRow[] = [];
  const keys = new Set<string>(),
    tenants = new Set<string>(),
    emails = new Set<string>();
  const properties = new Map<string, string>(),
    buildings = new Map<string, string>(),
    floors = new Map<string, string>(),
    staff = new Map<string, string>(),
    staffEmails = new Map<string, string>();
  raw.forEach((value, index) => {
    const parsed = importRowSchema.safeParse(value);
    if (!parsed.success) {
      errors.push({
        row: index + 1,
        message: parsed.error.issues
          .map((issue) => issue.path.join(".") + ": " + issue.message)
          .join("; "),
      });
      return;
    }
    const row: PilotImportRow = {
      ...parsed.data,
      occupancyStatus:
        parsed.data.occupancyStatus ??
        (parsed.data.tenantPhone ? "OCCUPIED" : "VACANT"),
    };
    const error = (message: string) => errors.push({ row: index + 1, message });
    const key = [row.propertyCode, row.buildingCode, row.unitCode].join("/");
    if (keys.has(key)) error("Duplicate unit in upload");
    keys.add(key);
    if (row.tenantPhone && tenants.has(row.tenantPhone))
      error("Duplicate tenant phone in upload");
    if (row.tenantPhone) tenants.add(row.tenantPhone);
    if (row.tenantEmail && emails.has(row.tenantEmail))
      error("Duplicate tenant email in upload");
    if (row.tenantEmail) emails.add(row.tenantEmail);
    const shape = JSON.stringify([
      row.propertyName,
      row.address,
      row.city,
      row.country,
      row.propertyType,
    ]);
    if (
      properties.has(row.propertyCode) &&
      properties.get(row.propertyCode) !== shape
    )
      error("Inconsistent property details");
    properties.set(row.propertyCode, shape);
    const bk = row.propertyCode + "/" + row.buildingCode,
      fk = bk + "/" + row.floorLevel;
    if (buildings.has(bk) && buildings.get(bk) !== row.buildingName)
      error("Inconsistent building details");
    buildings.set(bk, row.buildingName);
    if (floors.has(fk) && floors.get(fk) !== row.floorName)
      error("Inconsistent floor details");
    floors.set(fk, row.floorName);
    if (row.caretakerPhone) {
      const staffShape = JSON.stringify([
        row.caretakerFirstName,
        row.caretakerLastName,
        row.caretakerEmail,
      ]);
      if (
        staff.has(row.caretakerPhone) &&
        staff.get(row.caretakerPhone) !== staffShape
      )
        error("Inconsistent caretaker contact details");
      staff.set(row.caretakerPhone, staffShape);
      if (row.caretakerEmail) {
        if (
          staffEmails.has(row.caretakerEmail) &&
          staffEmails.get(row.caretakerEmail) !== row.caretakerPhone
        )
          error("Duplicate caretaker email with different phones");
        staffEmails.set(row.caretakerEmail, row.caretakerPhone);
      }
    }
    rows.push(row);
    origins.push(index + 1);
  });
  rows.forEach((row, index) => {
    if (
      (row.caretakerPhone && tenants.has(row.caretakerPhone)) ||
      (row.caretakerEmail && emails.has(row.caretakerEmail))
    )
      errors.push({
        row: origins[index]!,
        message:
          "The same contact cannot be imported as both tenant and caretaker",
      });
  });
  return { rows, errors, origins };
}
const digestRows = (organizationId: string, rows: unknown[]) =>
  createHash("sha256")
    .update(
      JSON.stringify({
        organizationId,
        rows: rows.map((row) =>
          Object.fromEntries(
            Object.entries(row as Record<string, unknown>).sort(
              ([left], [right]) => left.localeCompare(right),
            ),
          ),
        ),
      }),
    )
    .digest("hex");
type Mode = "PILOT" | "PAID";

async function existingReferences(
  organizationId: string,
  rows: PilotImportRow[],
  session?: ClientSession,
) {
  const properties = await Property.find({
    organizationId,
    code: { $in: rows.map((row) => row.propertyCode) },
  })
    .session(session ?? null)
    .lean();
  const propertyMap = new Map(
    properties.map((property) => [property.code, property]),
  );
  const buildingPairs = rows
    .filter((row) => propertyMap.has(row.propertyCode))
    .map((row) => ({
      propertyId: propertyMap.get(row.propertyCode)!._id,
      code: row.buildingCode,
    }));
  const buildings = buildingPairs.length
    ? await Building.find({ organizationId, $or: buildingPairs })
        .session(session ?? null)
        .limit(500)
        .lean()
    : [];
  const buildingMap = new Map(
    buildings.map((building) => [
      String(building.propertyId) + "/" + building.code,
      building,
    ]),
  );
  const floorPairs = rows.flatMap((row) => {
    const property = propertyMap.get(row.propertyCode),
      building =
        property &&
        buildingMap.get(String(property._id) + "/" + row.buildingCode);
    return building
      ? [{ buildingId: building._id, level: row.floorLevel }]
      : [];
  });
  const floors = floorPairs.length
    ? await Floor.find({ organizationId, $or: floorPairs })
        .session(session ?? null)
        .limit(500)
        .lean()
    : [];
  const floorMap = new Map(
    floors.map((floor) => [
      String(floor.buildingId) + "/" + floor.level,
      floor,
    ]),
  );
  const unitPairs = rows.flatMap((row) => {
    const property = propertyMap.get(row.propertyCode),
      building =
        property &&
        buildingMap.get(String(property._id) + "/" + row.buildingCode);
    return building ? [{ buildingId: building._id, code: row.unitCode }] : [];
  });
  const units = unitPairs.length
    ? await Unit.find({ organizationId, $or: unitPairs })
        .select("buildingId code")
        .session(session ?? null)
        .limit(500)
        .lean()
    : [];
  const unitKeys = new Set(
    units.map((unit) => String(unit.buildingId) + "/" + unit.code),
  );
  return {
    properties,
    propertyMap,
    buildings,
    buildingMap,
    floors,
    floorMap,
    unitKeys,
  };
}
function referenceErrors(
  rows: PilotImportRow[],
  origins: number[],
  refs: Awaited<ReturnType<typeof existingReferences>>,
  mode: Mode,
) {
  const errors: ErrorRow[] = [];
  rows.forEach((row, index) => {
    const error = (message: string) =>
      errors.push({ row: origins[index]!, message });
    const property = refs.propertyMap.get(row.propertyCode);
    if (!property) return;
    if (mode === "PILOT") {
      error(
        "Property code already exists; import only new properties, use existing setup for additions",
      );
      return;
    }
    if (
      property.status !== "ACTIVE" ||
      property.name !== row.propertyName ||
      property.propertyType !== row.propertyType ||
      property.address?.addressLine1 !== row.address ||
      property.address?.city !== row.city ||
      property.address?.country !== row.country
    )
      error(
        "Existing property details do not match. Correct the reference; import never overwrites the property.",
      );
    const building = refs.buildingMap.get(
      String(property._id) + "/" + row.buildingCode,
    );
    if (!building) return;
    if (building.status !== "ACTIVE" || building.name !== row.buildingName)
      error("Existing building details do not match");
    const floor = refs.floorMap.get(
      String(building._id) + "/" + row.floorLevel,
    );
    if (floor && (floor.status !== "ACTIVE" || floor.name !== row.floorName))
      error("Existing floor details do not match");
    if (refs.unitKeys.has(String(building._id) + "/" + row.unitCode))
      error("Unit code already exists in this building");
  });
  return errors;
}
async function existingContacts(
  organizationId: string,
  rows: PilotImportRow[],
  session?: ClientSession,
) {
  const phones = rows
    .flatMap((row) => [row.tenantPhone, row.caretakerPhone])
    .filter((value): value is string => !!value);
  const emails = rows
    .flatMap((row) => [row.tenantEmail, row.caretakerEmail])
    .filter((value): value is string => !!value);
  const users =
    phones.length || emails.length
      ? await User.find({
          $or: [{ phone: { $in: phones } }, { email: { $in: emails } }],
        })
          .select("phone email firstName lastName status")
          .session(session ?? null)
          .limit(1000)
          .lean()
      : [];
  const role = rows.some((row) => row.caretakerPhone)
    ? await Role.findOne({
        key: "CARETAKER",
        system: true,
        organizationId: null,
      })
        .session(session ?? null)
        .lean()
    : null;
  const memberships =
    users.length && role
      ? await OrganizationMembership.find({
          organizationId,
          userId: { $in: users.map((user) => user._id) },
          roleIds: role._id,
          status: "ACTIVE",
        })
          .session(session ?? null)
          .limit(500)
          .lean()
      : [];
  const allowedStaff = new Map(
    memberships.map((member) => [String(member.userId), member]),
  );
  const staffUsers = new Map<string, (typeof users)[number]>();
  rows.forEach((row) => {
    const user = users.find(
      (candidate) =>
        candidate.phone === row.caretakerPhone &&
        candidate.email === row.caretakerEmail &&
        candidate.status === "ACTIVE" &&
        candidate.firstName === row.caretakerFirstName &&
        candidate.lastName === row.caretakerLastName &&
        allowedStaff.has(String(candidate._id)),
    );
    if (user && row.caretakerPhone) staffUsers.set(row.caretakerPhone, user);
  });
  return { users, staffUsers, role };
}
function contactErrors(
  rows: PilotImportRow[],
  origins: number[],
  contacts: Awaited<ReturnType<typeof existingContacts>>,
) {
  const errors: ErrorRow[] = [];
  rows.forEach((row, index) => {
    if (
      contacts.users.some(
        (user) =>
          user.phone === row.tenantPhone ||
          (!!row.tenantEmail && user.email === row.tenantEmail),
      )
    )
      errors.push({
        row: origins[index]!,
        message:
          "Tenant contact belongs to an account; use controlled existing-tenant onboarding",
      });
    if (
      row.caretakerPhone &&
      !contacts.staffUsers.has(row.caretakerPhone) &&
      contacts.users.some(
        (user) =>
          user.phone === row.caretakerPhone ||
          (!!row.caretakerEmail && user.email === row.caretakerEmail),
      )
    )
      errors.push({
        row: origins[index]!,
        message:
          "Caretaker contact requires the controlled existing-account workflow",
      });
  });
  return errors;
}
export class PilotImportService {
  static previewPaid(
    auth: AuthenticatedUser,
    organizationId: string,
    raw: unknown,
  ) {
    return this.preview(auth, organizationId, raw, "PAID");
  }
  static confirmPaid(
    auth: AuthenticatedUser,
    organizationId: string,
    raw: unknown,
  ) {
    return this.confirm(auth, organizationId, raw, "PAID");
  }
  static async preview(
    auth: AuthenticatedUser,
    organizationId: string,
    raw: unknown,
    mode: Mode = "PILOT",
  ) {
    if (mode === "PAID") await loadPaidPortfolio(auth, organizationId);
    else await GuidedPilotService.load(auth, organizationId, true);
    const input = previewImportSchema.parse(raw),
      result = validateImportRows(input.rows),
      digest = digestRows(organizationId, result.rows);
    const action =
      mode === "PAID"
        ? "portfolio.bulk_import.completed"
        : "guided.pilot.bulk_import.completed";
    const prior = await AuditLog.findOne({
      organizationId,
      action,
      "metadata.digest": digest,
    })
      .select("metadata")
      .lean();
    if (prior && result.errors.length === 0)
      return {
        rows: result.rows,
        errors: [],
        valid: true,
        digest,
        replayed: true,
        summary: prior.metadata,
      };
    const refs = await existingReferences(organizationId, result.rows),
      contacts = await existingContacts(organizationId, result.rows);
    result.errors.push(
      ...referenceErrors(result.rows, result.origins, refs, mode),
      ...contactErrors(result.rows, result.origins, contacts),
    );
    const sms = (await availableChannels()).includes("SMS"),
      today = new Date().toISOString().slice(0, 10);
    result.rows.forEach((row, index) => {
      if (
        !sms &&
        ((row.tenantPhone && !row.tenantEmail) ||
          (row.caretakerPhone && !row.caretakerEmail))
      )
        result.errors.push({
          row: result.origins[index]!,
          message:
            "Email is required for tenant/caretaker activation while SMS is unavailable",
        });
      if (
        mode === "PAID" &&
        row.tenantPhone &&
        (row.tenancyStart! > today ||
          (!!row.tenancyEnd && row.tenancyEnd < today))
      )
        result.errors.push({
          row: result.origins[index]!,
          message:
            "Import current tenancies only; future or ended leases use the controlled tenancy workflow",
        });
    });
    return {
      rows: result.rows,
      errors: result.errors,
      valid: result.errors.length === 0,
      digest,
      summary: {
        properties: new Set(result.rows.map((row) => row.propertyCode)).size,
        newProperties: new Set(
          result.rows
            .filter((row) => !refs.propertyMap.has(row.propertyCode))
            .map((row) => row.propertyCode),
        ).size,
        buildings: new Set(
          result.rows.map((row) => row.propertyCode + "/" + row.buildingCode),
        ).size,
        units: result.rows.length,
        tenancies: result.rows.filter((row) => row.tenantPhone).length,
        caretakers: new Set(
          result.rows.map((row) => row.caretakerPhone).filter(Boolean),
        ).size,
        openingBalanceMinor: result.rows.reduce(
          (sum, row) => sum + row.openingBalanceMinor,
          0,
        ),
      },
    };
  }
  static async confirm(
    auth: AuthenticatedUser,
    organizationId: string,
    raw: unknown,
    mode: Mode = "PILOT",
  ) {
    const input = confirmImportSchema.parse(raw);
    const paid =
      mode === "PAID" ? await loadPaidPortfolio(auth, organizationId) : null;
    if (!paid) await GuidedPilotService.load(auth, organizationId, true);
    for (const permission of [
      "property.create",
      "building.create",
      "floor.create",
      "unit.create",
      "tenant.create",
      "tenancy.create",
      "rent.manage",
    ])
      AuthorizationService.assertCan(auth, permission, { organizationId });
    const result = validateImportRows(input.rows);
    if (result.errors.length)
      throw new AppError(
        400,
        "IMPORT_VALIDATION_FAILED",
        "Correct the import errors before continuing",
        result.errors,
      );
    if (digestRows(organizationId, result.rows) !== input.digest)
      throw new AppError(
        409,
        "IMPORT_PREVIEW_CHANGED",
        "Rows changed after preview; validate again",
      );
    if (result.rows.some((row) => row.caretakerPhone))
      AuthorizationService.assertCan(auth, "organization.members.manage", {
        organizationId,
      });
    const sms = (await availableChannels()).includes("SMS");
    if (
      !sms &&
      result.rows.some(
        (row) =>
          (row.tenantPhone && !row.tenantEmail) ||
          (row.caretakerPhone && !row.caretakerEmail),
      )
    )
      throw new AppError(
        400,
        "EMAIL_REQUIRED",
        "Tenant and caretaker email is required while SMS is unavailable",
      );
    const action =
        mode === "PAID"
          ? "portfolio.bulk_import.completed"
          : "guided.pilot.bulk_import.completed",
      dataset = mode === "PAID" ? "LIVE" : "PILOT";
    const session = await mongoose.startSession();
    let output: Record<string, number | string | boolean> = {};
    try {
      await session.withTransaction(async () => {
        const org =
          await Organization.findById(organizationId).session(session);
        if (
          !org ||
          (mode === "PILOT" &&
            (!org.guidedPilot || !pilotIsOpen(org.guidedPilot)))
        )
          throw new AppError(410, "PILOT_EXPIRED", "Pilot is expired");
        const prior = await AuditLog.findOne({
          organizationId: org._id,
          action,
          "metadata.digest": input.digest,
        }).session(session);
        if (prior) {
          output = {
            units: result.rows.length,
            imported: true,
            replayed: true,
            digest: input.digest,
          };
          return;
        }
        if (mode === "PAID") {
          const live = await OrganizationSubscription.findOne({
            organizationId,
            status: "ACTIVE",
          }).session(session);
          if (
            !live ||
            (org.onboarding && org.onboarding.state !== "ACTIVE") ||
            (live.provider === "PAYSTACK" &&
              live.currentPeriodEnd <= new Date())
          )
            throw new AppError(
              402,
              "PAID_ACTIVATION_REQUIRED",
              "Verified paid access is required",
            );
          // Serialize with subscription cancellation/expiry changes as well as workspace capacity.
          await OrganizationSubscription.updateOne(
            { _id: live._id, status: "ACTIVE" },
            { $inc: { __v: 1 } },
            { session },
          );
        }
        const changed = await Organization.updateOne(
          { _id: org._id, __v: org.__v },
          { $inc: { __v: 1 } },
          { session },
        );
        if (!changed.modifiedCount)
          throw new AppError(
            409,
            "IMPORT_CONFLICT",
            "Workspace changed; preview again",
          );
        const refs = await existingReferences(
            organizationId,
            result.rows,
            session,
          ),
          refErrors = referenceErrors(result.rows, result.origins, refs, mode);
        if (refErrors.length)
          throw new AppError(
            409,
            "IMPORT_DUPLICATE",
            "Import references changed; correct or preview the batch again",
            refErrors,
          );
        const contacts = await existingContacts(
          organizationId,
          result.rows,
          session,
        );
        if (contactErrors(result.rows, result.origins, contacts).length)
          throw new AppError(
            409,
            "IMPORT_IDENTITY_EXISTS",
            "Import cannot overwrite or attach an unrelated existing identity",
          );
        const tenantRole = result.rows.some((row) => row.tenantPhone)
          ? await Role.findOne({
              key: "TENANT",
              system: true,
              organizationId: null,
            }).session(session)
          : null;
        if (result.rows.some((row) => row.tenantPhone) && !tenantRole)
          throw new AppError(
            503,
            "TENANT_ROLE_REQUIRED",
            "Configure the existing tenant role",
          );
        if (result.rows.some((row) => row.caretakerPhone) && !contacts.role)
          throw new AppError(
            503,
            "CARETAKER_ROLE_REQUIRED",
            "Configure the existing caretaker role",
          );
        const plan = await SubscriptionPlan.findOne({
          key: paid?.plan.key ?? org.guidedPilot!.planKey,
          active: true,
        }).session(session);
        if (!plan)
          throw new AppError(
            403,
            "FEATURE_NOT_ENTITLED",
            "Selected plan unavailable",
          );
        // Queries are sequential within the MongoDB transaction.
        const currentUnits = await Unit.countDocuments({
          organizationId,
          status: { $ne: "INACTIVE" },
        }).session(session);
        const currentProperties = await Property.countDocuments({
          organizationId,
          status: { $ne: "ARCHIVED" },
        }).session(session);
        const currentTenants = await Tenant.countDocuments({
          organizationId,
          status: { $ne: "INACTIVE" },
        }).session(session);
        const currentUsers = await OrganizationMembership.countDocuments({
          organizationId,
          status: "ACTIVE",
        }).session(session);
        const newProperties = new Set(
          result.rows
            .filter((row) => !refs.propertyMap.has(row.propertyCode))
            .map((row) => row.propertyCode),
        ).size;
        const newTenants = result.rows.filter((row) => row.tenantPhone).length;
        const newStaff = new Set(
          result.rows
            .filter(
              (row) =>
                row.caretakerPhone &&
                !contacts.staffUsers.has(row.caretakerPhone),
            )
            .map((row) => row.caretakerPhone),
        ).size;
        for (const [current, additional, maximum] of [
          [currentUnits, result.rows.length, plan.entitlements?.maxUnits],
          [currentProperties, newProperties, plan.entitlements?.maxProperties],
          [currentTenants, newTenants, plan.entitlements?.maxTenants],
          [currentUsers, newTenants + newStaff, plan.entitlements?.maxUsers],
        ] as Array<[number, number, number | undefined]>)
          if (
            maximum !== undefined &&
            maximum !== -1 &&
            current + additional > maximum
          )
            throw new AppError(
              403,
              "PLAN_LIMIT_REACHED",
              "Import exceeds the selected plan capacity",
            );
        if (
          mode === "PAID" &&
          org.onboarding?.unitCount != null &&
          currentUnits + result.rows.length > org.onboarding.unitCount
        )
          throw new AppError(
            403,
            "COMMERCIAL_UNIT_LIMIT",
            "Import exceeds the signed unit commitment; use the audited commercial review workflow",
          );
        const pmap = new Map<string, Types.ObjectId>(
          refs.properties.map((property) => [property.code, property._id]),
        );
        const bmap = new Map<string, Types.ObjectId>(),
          fmap = new Map<string, Types.ObjectId>();
        refs.buildings.forEach((building) => {
          const property = refs.properties.find(
            (item) => String(item._id) === String(building.propertyId),
          );
          if (property)
            bmap.set(property.code + "/" + building.code, building._id);
        });
        refs.floors.forEach((floor) => {
          const building = refs.buildings.find(
            (item) => String(item._id) === String(floor.buildingId),
          );
          const property =
            building &&
            refs.properties.find(
              (item) => String(item._id) === String(building.propertyId),
            );
          if (property && building)
            fmap.set(
              property.code + "/" + building.code + "/" + floor.level,
              floor._id,
            );
        });
        const propertyRows: Record<string, unknown>[] = [],
          buildingRows: Record<string, unknown>[] = [],
          floorRows: Record<string, unknown>[] = [],
          unitRows: Record<string, unknown>[] = [];
        const userRows: Record<string, unknown>[] = [],
          tenantRows: Record<string, unknown>[] = [],
          tenancyRows: Record<string, unknown>[] = [],
          memberRows: Record<string, unknown>[] = [],
          chargeRows: Record<string, unknown>[] = [];
        const caretakerGroups = new Map<
            string,
            {
              row: PilotImportRow;
              properties: Set<string>;
              buildings: Set<string>;
            }
          >(),
          now = new Date(),
          today = now.toISOString().slice(0, 10);
        for (const row of result.rows) {
          let propertyId = pmap.get(row.propertyCode);
          if (!propertyId) {
            propertyId = new Types.ObjectId();
            pmap.set(row.propertyCode, propertyId);
            propertyRows.push({
              _id: propertyId,
              organizationId: org._id,
              name: row.propertyName,
              code: row.propertyCode,
              propertyType: row.propertyType,
              address: {
                addressLine1: row.address,
                city: row.city,
                country: row.country,
              },
              totalUnits: 0,
              createdBy: auth.userId,
              updatedBy: auth.userId,
            });
          }
          const bk = row.propertyCode + "/" + row.buildingCode;
          let buildingId = bmap.get(bk);
          if (!buildingId) {
            buildingId = new Types.ObjectId();
            bmap.set(bk, buildingId);
            buildingRows.push({
              _id: buildingId,
              organizationId: org._id,
              propertyId,
              name: row.buildingName,
              code: row.buildingCode,
              createdBy: auth.userId,
              updatedBy: auth.userId,
            });
          }
          const fk = bk + "/" + row.floorLevel;
          let floorId = fmap.get(fk);
          if (!floorId) {
            floorId = new Types.ObjectId();
            fmap.set(fk, floorId);
            floorRows.push({
              _id: floorId,
              organizationId: org._id,
              propertyId,
              buildingId,
              name: row.floorName,
              level: row.floorLevel,
              code: "F" + row.floorLevel,
              createdBy: auth.userId,
              updatedBy: auth.userId,
            });
          }
          const unitId = new Types.ObjectId(),
            scope = {
              organizationId: org._id,
              propertyId,
              buildingId,
              floorId,
            };
          unitRows.push({
            _id: unitId,
            ...scope,
            name: row.unitCode,
            code: row.unitCode,
            unitType: row.unitType,
            unitTypeLabel: row.unitTypeLabel,
            monthlyRent: row.monthlyRentMinor / 100,
            status: row.occupancyStatus,
            createdBy: auth.userId,
            updatedBy: auth.userId,
          });
          if (row.caretakerPhone) {
            const group = caretakerGroups.get(row.caretakerPhone) ?? {
              row,
              properties: new Set<string>(),
              buildings: new Set<string>(),
            };
            group.properties.add(String(propertyId));
            group.buildings.add(String(buildingId));
            caretakerGroups.set(row.caretakerPhone, group);
          }
          if (row.tenantPhone) {
            if (row.tenancyStart! > today)
              throw new AppError(
                400,
                "FUTURE_ACTIVE_TENANCY",
                "Future leases must use controlled pending tenancy onboarding",
              );
            if (row.tenancyEnd && row.tenancyEnd < today)
              throw new AppError(
                400,
                "EXPIRED_ACTIVE_TENANCY",
                "Ended leases must use the historical tenancy workflow",
              );
            const userId = new Types.ObjectId(),
              tenantId = new Types.ObjectId(),
              tenancyId = new Types.ObjectId();
            // Importing a contact or tenancy never verifies ownership or fabricates a collection.
            userRows.push({
              _id: userId,
              phone: row.tenantPhone,
              email: row.tenantEmail,
              firstName: row.tenantFirstName,
              lastName: row.tenantLastName,
              status: "ACTIVE",
            });
            tenantRows.push({
              _id: tenantId,
              organizationId: org._id,
              userId,
              status: "ACTIVE",
              createdBy: auth.userId,
              updatedBy: auth.userId,
            });
            tenancyRows.push({
              _id: tenancyId,
              ...scope,
              unitId,
              tenantId,
              leaseNumber: (mode === "PAID" ? "IMPORT-" : "PILOT-") + unitId,
              startDate: new Date(row.tenancyStart!),
              endDate: row.tenancyEnd ? new Date(row.tenancyEnd) : undefined,
              monthlyRent: row.monthlyRentMinor / 100,
              depositAmount: row.depositMinor / 100,
              status: "ACTIVE",
              activatedAt: now,
              createdBy: auth.userId,
              updatedBy: auth.userId,
            });
            memberRows.push({
              organizationId: org._id,
              userId,
              roleIds: [tenantRole!._id],
              status: "ACTIVE",
              scope: {
                allProperties: false,
                propertyIds: [],
                buildingIds: [],
                unitIds: [unitId],
              },
              invitedBy: auth.userId,
            });
            chargeRows.push({
              ...scope,
              unitId,
              tenantId,
              tenancyId,
              periodStart: new Date(
                Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
              ),
              periodEnd: now,
              dueDate: now,
              rentAmount: 0,
              rentAmountMinor: 0,
              adjustments: row.openingBalanceMinor / 100,
              adjustmentsMinor: row.openingBalanceMinor,
              totalAmount: row.openingBalanceMinor / 100,
              totalAmountMinor: row.openingBalanceMinor,
              paidAmount: 0,
              paidAmountMinor: 0,
              balanceAmount: row.openingBalanceMinor / 100,
              balanceAmountMinor: row.openingBalanceMinor,
              currency: "KES",
              status: row.openingBalanceMinor ? "OPEN" : "PAID",
              notes:
                "Confirmed imported opening balance; no provider payment inferred",
              createdBy: auth.userId,
              updatedBy: auth.userId,
            });
          }
        }
        for (const [phoneNumber, group] of caretakerGroups) {
          const existing = contacts.staffUsers.get(phoneNumber);
          const propertyIds = [...group.properties].map(
              (id) => new Types.ObjectId(id),
            ),
            buildingIds = [...group.buildings].map(
              (id) => new Types.ObjectId(id),
            );
          if (existing) {
            await OrganizationMembership.updateOne(
              {
                organizationId: org._id,
                userId: existing._id,
                roleIds: contacts.role!._id,
                status: "ACTIVE",
              },
              {
                $addToSet: {
                  "scope.propertyIds": { $each: propertyIds },
                  "scope.buildingIds": { $each: buildingIds },
                },
              },
              { session },
            );
          } else {
            const userId = new Types.ObjectId();
            userRows.push({
              _id: userId,
              phone: phoneNumber,
              email: group.row.caretakerEmail,
              firstName: group.row.caretakerFirstName,
              lastName: group.row.caretakerLastName,
              status: "ACTIVE",
            });
            memberRows.push({
              organizationId: org._id,
              userId,
              roleIds: [contacts.role!._id],
              status: "ACTIVE",
              scope: {
                allProperties: false,
                propertyIds,
                buildingIds,
                unitIds: [],
              },
              invitedBy: auth.userId,
            });
          }
        }
        // Bounded collection batches avoid a database round trip for every imported unit.
        if (propertyRows.length)
          await Property.insertMany(propertyRows, { session });
        if (buildingRows.length)
          await Building.insertMany(buildingRows, { session });
        if (floorRows.length) await Floor.insertMany(floorRows, { session });
        await Unit.insertMany(unitRows, { session });
        if (userRows.length) await User.insertMany(userRows, { session });
        if (tenantRows.length) await Tenant.insertMany(tenantRows, { session });
        if (tenancyRows.length)
          await Tenancy.insertMany(tenancyRows, { session });
        if (memberRows.length)
          await OrganizationMembership.insertMany(memberRows, { session });
        if (chargeRows.length)
          await RentCharge.insertMany(chargeRows, { session });
        type Count = { _id: Types.ObjectId; count: number };
        const counts = await Unit.aggregate<{
          properties: Count[];
          buildings: Count[];
          floors: Count[];
        }>([
          {
            $match: {
              organizationId: org._id,
              propertyId: { $in: [...pmap.values()] },
              status: { $ne: "INACTIVE" },
            },
          },
          {
            $facet: {
              properties: [
                { $group: { _id: "$propertyId", count: { $sum: 1 } } },
              ],
              buildings: [
                { $group: { _id: "$buildingId", count: { $sum: 1 } } },
              ],
              floors: [{ $group: { _id: "$floorId", count: { $sum: 1 } } }],
            },
          },
        ]).session(session);
        if (counts[0]) {
          await Property.bulkWrite(
            counts[0].properties.map((item) => ({
              updateOne: {
                filter: { _id: item._id, organizationId: org._id },
                update: { $set: { totalUnits: item.count } },
              },
            })),
            { session },
          );
          await Building.bulkWrite(
            counts[0].buildings.map((item) => ({
              updateOne: {
                filter: { _id: item._id, organizationId: org._id },
                update: { $set: { totalUnits: item.count } },
              },
            })),
            { session },
          );
          await Floor.bulkWrite(
            counts[0].floors.map((item) => ({
              updateOne: {
                filter: { _id: item._id, organizationId: org._id },
                update: { $set: { totalUnits: item.count } },
              },
            })),
            { session },
          );
        }
        await AuditService.record(
          {
            organizationId: org._id,
            actorUserId: auth.userId,
            action,
            resourceType: "Organization",
            resourceId: org._id,
            metadata: {
              digest: input.digest,
              units: result.rows.length,
              tenancies: newTenants,
              caretakers: caretakerGroups.size,
              properties: propertyRows.length,
              dataset,
            },
          },
          session,
        );
        await AuditService.publish(
          {
            organizationId: org._id,
            name:
              mode === "PAID"
                ? "portfolio.import.completed"
                : "guided.pilot.import.completed",
            aggregateType: "Organization",
            aggregateId: org._id,
            payload: { units: result.rows.length, dataset },
          },
          session,
        );
        output = {
          imported: true,
          digest: input.digest,
          units: result.rows.length,
          tenancies: newTenants,
          caretakers: caretakerGroups.size,
          properties: propertyRows.length,
        };
      });
    } finally {
      await session.endSession();
    }
    return output;
  }
}
