import mongoose, { Types } from "mongoose";
import { createHash } from "node:crypto";
import { z } from "zod";
import { AppError } from "../../core/errors/AppError.js";
import { AuthorizationService } from "../../core/authorization/authorization.service.js";
import type { AuthenticatedUser } from "../../core/types/auth.js";
import { Organization } from "../../database/models/Organization.js";
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
import { unitType } from "../units/unit.schemas.js";
const label = z.string().trim().min(1).max(100);
const code = z
  .string()
  .trim()
  .min(1)
  .max(40)
  .regex(/^[a-zA-Z0-9_-]+$/)
  .transform((v) => v.toUpperCase());
const minor = z.number().int().min(0).max(10000000000);
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (v) =>
      Number.isFinite(Date.parse(v)) &&
      new Date(v).toISOString().slice(0, 10) === v,
    "Use a valid calendar date",
  );
export const importRowSchema = z
  .object({
    propertyName: label,
    propertyCode: code,
    address: label,
    city: label.default("Nairobi"),
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
    buildingName: label,
    buildingCode: code,
    floorName: label,
    floorLevel: z.number().int().min(-10).max(300),
    unitCode: code,
    unitType,
    monthlyRentMinor: minor,
    depositMinor: minor.default(0),
    openingBalanceMinor: minor.default(0),
    tenantFirstName: label.optional(),
    tenantLastName: label.optional(),
    tenantPhone: z
      .string()
      .regex(/^\+254[17]\d{8}$/, "Use a Kenyan international phone number")
      .optional(),
    tenancyStart: date.optional(),
    tenancyEnd: date.optional(),
  })
  .strict()
  .superRefine((r, ctx) => {
    const occupied = !!(
      r.tenantFirstName ||
      r.tenantLastName ||
      r.tenantPhone ||
      r.tenancyStart
    );
    if (
      occupied &&
      !(
        r.tenantFirstName &&
        r.tenantLastName &&
        r.tenantPhone &&
        r.tenancyStart
      )
    )
      ctx.addIssue({
        code: "custom",
        message: "Occupied units require tenant names, phone and tenancy start",
      });
    if (!occupied && (r.depositMinor || r.openingBalanceMinor || r.tenancyEnd))
      ctx.addIssue({
        code: "custom",
        message: "Deposits and opening balances require a tenancy",
      });
    if (r.tenancyEnd && r.tenancyStart && r.tenancyEnd <= r.tenancyStart)
      ctx.addIssue({
        code: "custom",
        message: "Tenancy end must follow start",
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
export function validateImportRows(raw: unknown[]) {
  const rows: PilotImportRow[] = [],
    errors: Array<{ row: number; message: string }> = [],
    keys = new Set<string>(),
    phones = new Set<string>(),
    properties = new Map<string, string>(),
    buildings = new Map<string, string>(),
    floors = new Map<string, string>();
  raw.forEach((value, index) => {
    const parsed = importRowSchema.safeParse(value);
    if (!parsed.success) {
      errors.push({
        row: index + 1,
        message: parsed.error.issues
          .map((e) => `${e.path.join(".")}: ${e.message}`)
          .join("; "),
      });
      return;
    }
    const row = parsed.data,
      key = [row.propertyCode, row.buildingCode, row.unitCode].join("/");
    if (keys.has(key))
      errors.push({ row: index + 1, message: "Duplicate unit in upload" });
    keys.add(key);
    if (row.tenantPhone && phones.has(row.tenantPhone))
      errors.push({
        row: index + 1,
        message: "Duplicate tenant phone in upload",
      });
    if (row.tenantPhone) phones.add(row.tenantPhone);
    const propertyShape = JSON.stringify([
      row.propertyName,
      row.address,
      row.city,
      row.propertyType,
    ]);
    if (
      properties.has(row.propertyCode) &&
      properties.get(row.propertyCode) !== propertyShape
    )
      errors.push({ row: index + 1, message: "Inconsistent property details" });
    properties.set(row.propertyCode, propertyShape);
    const bk = `${row.propertyCode}/${row.buildingCode}`;
    if (buildings.has(bk) && buildings.get(bk) !== row.buildingName)
      errors.push({ row: index + 1, message: "Inconsistent building details" });
    buildings.set(bk, row.buildingName);
    const fk = `${bk}/${row.floorLevel}`;
    if (floors.has(fk) && floors.get(fk) !== row.floorName)
      errors.push({ row: index + 1, message: "Inconsistent floor details" });
    floors.set(fk, row.floorName);
    rows.push(row);
  });
  return { rows, errors };
}
const digestRows = (org: string, rows: unknown[]) =>
  createHash("sha256")
    .update(JSON.stringify({ organizationId: org, rows }))
    .digest("hex");
export class PilotImportService {
  static async preview(
    auth: AuthenticatedUser,
    organizationId: string,
    raw: unknown,
  ) {
    await GuidedPilotService.load(auth, organizationId, true);
    const input = previewImportSchema.parse(raw),
      result = validateImportRows(input.rows);
    if (result.rows.length) {
      const [existing, users] = await Promise.all([
        Property.find({
          organizationId,
          code: { $in: result.rows.map((r) => r.propertyCode) },
        })
          .select("code")
          .lean(),
        User.find({
          phone: {
            $in: result.rows
              .map((r) => r.tenantPhone)
              .filter((phone): phone is string => !!phone),
          },
        })
          .select("phone")
          .lean(),
      ]);
      const codes = new Set(existing.map((p) => p.code)),
        phones = new Set(users.map((u) => u.phone));
      result.rows.forEach((r, i) => {
        if (codes.has(r.propertyCode))
          result.errors.push({
            row: i + 1,
            message:
              "Property code already exists; import only new properties, use existing setup for additions",
          });
        if (r.tenantPhone && phones.has(r.tenantPhone))
          result.errors.push({
            row: i + 1,
            message:
              "Phone already belongs to an account; use controlled existing-tenant onboarding",
          });
      });
    }
    return {
      rows: result.rows,
      errors: result.errors,
      valid: result.errors.length === 0,
      digest: digestRows(organizationId, result.rows),
      summary: {
        properties: new Set(result.rows.map((r) => r.propertyCode)).size,
        buildings: new Set(
          result.rows.map((r) => r.propertyCode + "/" + r.buildingCode),
        ).size,
        units: result.rows.length,
        tenancies: result.rows.filter((r) => r.tenantPhone).length,
        openingBalanceMinor: result.rows.reduce(
          (s, r) => s + r.openingBalanceMinor,
          0,
        ),
      },
    };
  }
  static async confirm(
    auth: AuthenticatedUser,
    organizationId: string,
    raw: unknown,
  ) {
    const input = confirmImportSchema.parse(raw);
    await GuidedPilotService.load(auth, organizationId, true);
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
    const session = await mongoose.startSession();
    let output: Record<string, number | string | boolean> = {};
    try {
      await session.withTransaction(async () => {
        const org =
          await Organization.findById(organizationId).session(session);
        if (!org?.guidedPilot || !pilotIsOpen(org.guidedPilot))
          throw new AppError(410, "PILOT_EXPIRED", "Pilot is expired");
        const prior = await AuditLog.findOne({
          organizationId: org._id,
          action: "guided.pilot.bulk_import.completed",
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
        if (
          await Property.exists({
            organizationId,
            code: { $in: result.rows.map((r) => r.propertyCode) },
          }).session(session)
        )
          throw new AppError(
            409,
            "IMPORT_DUPLICATE",
            "A property in this import already exists",
          );
        if (
          await User.exists({
            phone: {
              $in: result.rows
                .map((r) => r.tenantPhone)
                .filter((phone): phone is string => !!phone),
            },
          }).session(session)
        )
          throw new AppError(
            409,
            "IMPORT_IDENTITY_EXISTS",
            "Import cannot overwrite or attach an existing global identity",
          );
        const role = await Role.findOne({
          key: "TENANT",
          system: true,
          organizationId: null,
        }).session(session);
        if (result.rows.some((r) => r.tenantPhone) && !role)
          throw new AppError(
            503,
            "TENANT_ROLE_REQUIRED",
            "Configure the existing tenant role",
          );
        const plan = await SubscriptionPlan.findOne({
          key: org.guidedPilot.planKey,
          active: true,
        }).session(session);
        if (!plan)
          throw new AppError(
            403,
            "FEATURE_NOT_ENTITLED",
            "Selected plan unavailable",
          );
        const [currentUnits, currentProperties, currentTenants, currentUsers] =
          await Promise.all([
            Unit.countDocuments({
              organizationId,
              status: { $ne: "INACTIVE" },
            }).session(session),
            Property.countDocuments({
              organizationId,
              status: { $ne: "ARCHIVED" },
            }).session(session),
            Tenant.countDocuments({
              organizationId,
              status: { $ne: "INACTIVE" },
            }).session(session),
            OrganizationMembership.countDocuments({
              organizationId,
              status: "ACTIVE",
            }).session(session),
          ]);
        for (const [current, additional, maximum] of [
          [currentUnits, result.rows.length, plan.entitlements?.maxUnits],
          [
            currentProperties,
            new Set(result.rows.map((r) => r.propertyCode)).size,
            plan.entitlements?.maxProperties,
          ],
          [
            currentTenants,
            result.rows.filter((r) => r.tenantPhone).length,
            plan.entitlements?.maxTenants,
          ],
          [
            currentUsers,
            result.rows.filter((r) => r.tenantPhone).length,
            plan.entitlements?.maxUsers,
          ],
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
        // Serialize pilot import capacity checks; retries re-read both counts and digest.
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
        const pmap = new Map<string, Types.ObjectId>(),
          bmap = new Map<string, Types.ObjectId>(),
          fmap = new Map<string, Types.ObjectId>(),
          now = new Date();
        let tenantCount = 0;
        for (const row of result.rows) {
          let pid = pmap.get(row.propertyCode);
          if (!pid) {
            pid = new Types.ObjectId();
            pmap.set(row.propertyCode, pid);
            await Property.create(
              [
                {
                  _id: pid,
                  organizationId: org._id,
                  name: row.propertyName,
                  code: row.propertyCode,
                  propertyType: row.propertyType,
                  address: {
                    addressLine1: row.address,
                    city: row.city,
                    country: "Kenya",
                  },
                  totalUnits: result.rows.filter(
                    (r) => r.propertyCode === row.propertyCode,
                  ).length,
                  createdBy: auth.userId,
                  updatedBy: auth.userId,
                },
              ],
              { session },
            );
          }
          const bk = row.propertyCode + "/" + row.buildingCode;
          let bid = bmap.get(bk);
          if (!bid) {
            bid = new Types.ObjectId();
            bmap.set(bk, bid);
            await Building.create(
              [
                {
                  _id: bid,
                  organizationId: org._id,
                  propertyId: pid,
                  name: row.buildingName,
                  code: row.buildingCode,
                  createdBy: auth.userId,
                  updatedBy: auth.userId,
                },
              ],
              { session },
            );
          }
          const fk = bk + "/" + row.floorLevel;
          let fid = fmap.get(fk);
          if (!fid) {
            fid = new Types.ObjectId();
            fmap.set(fk, fid);
            await Floor.create(
              [
                {
                  _id: fid,
                  organizationId: org._id,
                  propertyId: pid,
                  buildingId: bid,
                  name: row.floorName,
                  level: row.floorLevel,
                  code: `F${row.floorLevel}`,
                  createdBy: auth.userId,
                  updatedBy: auth.userId,
                },
              ],
              { session },
            );
          }
          const scope = {
              organizationId: org._id,
              propertyId: pid,
              buildingId: bid,
              floorId: fid,
            },
            uid = new Types.ObjectId();
          await Unit.create(
            [
              {
                _id: uid,
                ...scope,
                name: row.unitCode,
                code: row.unitCode,
                unitType: row.unitType,
                monthlyRent: row.monthlyRentMinor / 100,
                status: row.tenantPhone ? "OCCUPIED" : "VACANT",
                createdBy: auth.userId,
                updatedBy: auth.userId,
              },
            ],
            { session },
          );
          if (row.tenantPhone) {
            if (row.tenancyStart! > now.toISOString().slice(0, 10))
              throw new AppError(
                400,
                "FUTURE_ACTIVE_TENANCY",
                "Future leases must use controlled pending tenancy onboarding",
              );
            if (
              row.tenancyEnd &&
              row.tenancyEnd < now.toISOString().slice(0, 10)
            )
              throw new AppError(
                400,
                "EXPIRED_ACTIVE_TENANCY",
                "Ended leases must use the historical tenancy workflow",
              );
            const [user] = await User.create(
              [
                {
                  phone: row.tenantPhone,
                  firstName: row.tenantFirstName,
                  lastName: row.tenantLastName,
                  status: "ACTIVE",
                },
              ],
              { session },
            );
            const [tenant] = await Tenant.create(
              [
                {
                  organizationId: org._id,
                  userId: user!._id,
                  status: "ACTIVE",
                  createdBy: auth.userId,
                  updatedBy: auth.userId,
                },
              ],
              { session },
            );
            const [tenancy] = await Tenancy.create(
              [
                {
                  ...scope,
                  unitId: uid,
                  tenantId: tenant!._id,
                  leaseNumber: `PILOT-${uid}`,
                  startDate: new Date(row.tenancyStart!),
                  endDate: row.tenancyEnd
                    ? new Date(row.tenancyEnd)
                    : undefined,
                  monthlyRent: row.monthlyRentMinor / 100,
                  depositAmount: row.depositMinor / 100,
                  status: "ACTIVE",
                  activatedAt: now,
                  createdBy: auth.userId,
                  updatedBy: auth.userId,
                },
              ],
              { session },
            );
            await OrganizationMembership.create(
              [
                {
                  organizationId: org._id,
                  userId: user!._id,
                  roleIds: [role!._id],
                  status: "ACTIVE",
                  scope: {
                    allProperties: false,
                    propertyIds: [],
                    buildingIds: [],
                    unitIds: [uid],
                  },
                  invitedBy: auth.userId,
                },
              ],
              { session },
            );
            await RentCharge.create(
              [
                {
                  ...scope,
                  unitId: uid,
                  tenantId: tenant!._id,
                  tenancyId: tenancy!._id,
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
                },
              ],
              { session },
            );
            tenantCount++;
          }
        }
        await AuditService.record(
          {
            organizationId: org._id,
            actorUserId: auth.userId,
            action: "guided.pilot.bulk_import.completed",
            resourceType: "Organization",
            resourceId: org._id,
            metadata: {
              digest: input.digest,
              units: result.rows.length,
              tenancies: tenantCount,
              properties: pmap.size,
              dataset: "PILOT",
            },
          },
          session,
        );
        output = {
          imported: true,
          digest: input.digest,
          units: result.rows.length,
          tenancies: tenantCount,
          properties: pmap.size,
        };
      });
    } finally {
      await session.endSession();
    }
    return output;
  }
}
