import {
  identityDecisionSchema,
  mergeProposalSchema,
  mergeDecisionSchema,
} from "./sales-identity.schemas.js";
import { Types, type ClientSession } from "mongoose";
import type { AuthenticatedUser } from "../../core/types/auth.js";
import { AppError } from "../../core/errors/AppError.js";
import { SalesLead } from "../../database/models/SalesLead.js";
import {
  SalesIdentityMatch,
  SalesMergeRequest,
} from "../../database/models/SalesIdentity.js";
import { Organization } from "../../database/models/Organization.js";
import { User } from "../../database/models/User.js";
import { Role } from "../../database/models/Role.js";
import { OrganizationMembership } from "../../database/models/OrganizationMembership.js";
import { AcquisitionJourney } from "../../database/models/AcquisitionJourney.js";
import { PlatformSwitch } from "../../database/models/PlatformSwitch.js";
import { AuditService } from "../audit/audit.service.js";
import { assertFreshAdmin } from "../auth/admin-security.js";
import { salesTransaction } from "./sales-agent.repository.js";
import { payloadHash } from "./sales-agent.service.js";
import { assertCustomerIdentityIndex } from "./sales-success-indexes.js";
import { SuccessRepository } from "./sales-success.repository.js";
export class SalesIdentityService {
  static async resolve(organizationId: Types.ObjectId, session: ClientSession) {
    const org = await Organization.findOne({
      _id: organizationId,
      status: "ACTIVE",
    })
      .select("onboarding.ownerUserId")
      .session(session);
    if (!org?.onboarding?.ownerUserId) return { status: "UNLINKED" };
    const owner = await User.findOne({
      _id: org.onboarding.ownerUserId,
      status: "ACTIVE",
      emailVerifiedAt: { $type: "date" },
    })
      .select("email emailVerifiedAt")
      .session(session);
    if (!owner?.email) return { status: "UNLINKED" };
    const landlord = await Role.findOne({
      key: "LANDLORD",
      system: true,
      organizationId: null,
    })
      .select("_id")
      .session(session);
    if (
      !landlord ||
      !(await OrganizationMembership.exists({
        organizationId,
        userId: owner._id,
        status: "ACTIVE",
        roleIds: landlord._id,
        "scope.allProperties": true,
      }).session(session))
    )
      return { status: "UNLINKED" };
    const journey = await AcquisitionJourney.findOne({ organizationId })
      .select("salesLeadId")
      .session(session);
    const matches = await SalesLead.find({
      email: owner.email.toLowerCase(),
      mergedInto: { $exists: false },
    })
      .select("_id organizationId revision")
      .limit(3)
      .session(session);
    const candidates =
      journey?.salesLeadId &&
      !matches.some((m) => String(m._id) === String(journey.salesLeadId))
        ? [
            ...matches,
            ...(await SalesLead.find({
              _id: journey.salesLeadId,
              mergedInto: { $exists: false },
            })
              .select("_id organizationId revision")
              .limit(1)
              .session(session)),
          ]
        : matches;
    const policy = await PlatformSwitch.findOne({
      key: "SALES_AUTOLINK",
      enabled: true,
      mode: "ON",
    })
      .select("_id")
      .session(session);
    const linked = await SalesLead.findOne({ organizationId })
      .select("_id")
      .session(session);
    let status = "UNLINKED";
    for (const lead of candidates) {
      const previous = await SalesIdentityMatch.findOne({
        leadId: lead._id,
        organizationId,
      }).session(session);
      if (previous?.status === "LINK_REJECTED") continue;
      const contactMatch = matches.some(
        (m) => String(m._id) === String(lead._id),
      );
      const conflict =
        (lead.organizationId &&
          String(lead.organizationId) !== String(organizationId)) ||
        (linked && String(linked._id) !== String(lead._id));
      const ambiguous = matches.length !== 1;
      const automatic = !!policy && contactMatch && !ambiguous && !conflict;
      const next =
        conflict || !contactMatch
          ? "CONFLICT"
          : linked || automatic
            ? "LINKED"
            : ambiguous
              ? "MATCH_SUGGESTED"
              : "LINK_PENDING_REVIEW";
      const evidence = conflict
        ? "ORGANIZATION_CONFLICT"
        : !contactMatch
          ? "REFERRAL_CONTACT_MISMATCH"
          : ambiguous
            ? "AMBIGUOUS_VERIFIED_EMAIL"
            : journey?.salesLeadId
              ? "REFERRAL_AND_VERIFIED_EMAIL"
              : "VERIFIED_OWNER_EMAIL";
      await SalesIdentityMatch.updateOne(
        { leadId: lead._id, organizationId },
        {
          $set: {
            status: next,
            evidence,
            contactHash: payloadHash(owner.email),
            verifiedAt: owner.emailVerifiedAt,
          },
        },
        { upsert: true, session },
      );
      if (automatic && !linked) {
        await assertCustomerIdentityIndex();
        const changed = await SalesLead.updateOne(
          {
            _id: lead._id,
            organizationId: { $exists: false },
            mergedInto: { $exists: false },
          },
          {
            $set: { organizationId, identityState: "LINKED" },
            $inc: { revision: 1 },
          },
          { session },
        );
        if (changed.modifiedCount)
          await AuditService.record(
            {
              organizationId,
              action: "sales.identity.automatically.linked",
              resourceType: "SalesLead",
              resourceId: lead._id,
              metadata: { evidence, ownerUserId: String(owner._id) },
            },
            session,
          );
      } else
        await SalesLead.updateOne(
          { _id: lead._id, organizationId: { $exists: false } },
          { $set: { identityState: next } },
          { session },
        );
      status = next;
    }
    return { status };
  }
  static async matches(auth: AuthenticatedUser, id: string) {
    await SuccessRepository.load(auth, id, "sales.leads.read");
    // Organization identity suggestions are platform governance data, not delegated contact context.
    if (!auth.isPlatformAdmin) return { items: [] };
    return {
      items: await SalesIdentityMatch.find({ leadId: id })
        .select("-contactHash")
        .sort({ createdAt: -1 })
        .limit(50)
        .lean(),
    };
  }
  static async review(auth: AuthenticatedUser, id: string, raw: unknown) {
    assertFreshAdmin(auth);
    const input = identityDecisionSchema.parse(raw);
    input.organizationId = input.organizationId.toLowerCase();
    await assertCustomerIdentityIndex();
    return salesTransaction(async (session) => {
      const lead = await SuccessRepository.load(
        auth,
        id,
        "sales.leads.update",
        session,
      );
      const match = await SalesIdentityMatch.findOne({
        leadId: id,
        organizationId: input.organizationId,
      }).session(session);
      if (!match)
        throw new AppError(
          404,
          "IDENTITY_MATCH_NOT_FOUND",
          "Identity proposal not found",
        );
      if (lead.revision !== input.revision)
        throw new AppError(
          409,
          "CUSTOMER_CHANGED",
          "Refresh customer before reviewing",
        );
      if (input.decision === "LINK") {
        if (
          lead.organizationId &&
          String(lead.organizationId) !== input.organizationId
        )
          throw new AppError(
            409,
            "IDENTITY_CONFLICT",
            "Customer already belongs to another organization",
          );
        if (
          await SalesLead.exists({
            _id: { $ne: lead._id },
            organizationId: input.organizationId,
          }).session(session)
        )
          throw new AppError(
            409,
            "IDENTITY_CONFLICT",
            "Organization already belongs to another customer",
          );
        if (
          !(await Organization.exists({ _id: input.organizationId }).session(
            session,
          ))
        )
          throw new AppError(
            404,
            "ORGANIZATION_NOT_FOUND",
            "Organization no longer exists",
          );
        lead.organizationId = new Types.ObjectId(input.organizationId);
        lead.identityState = "LINKED";
      } else if (!lead.organizationId) lead.identityState = "LINK_REJECTED";
      lead.revision += 1;
      await lead.save({ session });
      match.status = input.decision === "LINK" ? "LINKED" : "LINK_REJECTED";
      match.reviewedBy = auth.userId;
      match.reviewedAt = new Date();
      match.reviewReason = input.reason;
      await match.save({ session });
      await AuditService.record(
        {
          actorUserId: auth.userId,
          organizationId: match.organizationId,
          action: "sales.identity.reviewed",
          resourceType: "SalesLead",
          resourceId: lead._id,
          metadata: { decision: input.decision, reason: input.reason },
        },
        session,
      );
      return { status: match.status };
    });
  }
  static async proposeMerge(auth: AuthenticatedUser, raw: unknown) {
    assertFreshAdmin(auth);
    const input = mergeProposalSchema.parse(raw);
    if (input.sourceId === input.targetId)
      throw new AppError(400, "MERGE_SELF", "Choose two distinct customers");
    const [source, target] = await Promise.all([
      SuccessRepository.load(auth, input.sourceId, "sales.leads.read"),
      SuccessRepository.load(auth, input.targetId, "sales.leads.read"),
    ]);
    this.assertMerge(source, target, input);
    const hash = payloadHash({
      ...input,
      sourceId: String(source._id),
      targetId: String(target._id),
    });
    return salesTransaction(async (session) => {
      const [record] = await SalesMergeRequest.create(
        [
          {
            ...input,
            requestedBy: auth.userId,
            payloadHash: hash,
            expiresAt: new Date(Date.now() + 86400000),
          },
        ],
        { session },
      );
      if (!record)
        throw new AppError(500, "MERGE_CREATE_FAILED", "Cannot prepare merge");
      await AuditService.record(
        {
          actorUserId: auth.userId,
          action: "sales.merge.proposed",
          resourceType: "SalesMergeRequest",
          resourceId: record._id,
          metadata: {
            sourceId: input.sourceId,
            targetId: input.targetId,
            payloadHash: hash,
          },
        },
        session,
      );
      return {
        id: String(record._id),
        payloadHash: hash,
        source: {
          name: source.name,
          organizationId: source.organizationId,
          consent: source.consent,
        },
        target: {
          name: target.name,
          organizationId: target.organizationId,
          consent: target.consent,
        },
        expiresAt: record.expiresAt,
      };
    });
  }
  private static assertMerge(
    source: {
      email?: string | null;
      phone?: string | null;
      organizationId?: Types.ObjectId | null;
      revision: number;
      mergedInto?: Types.ObjectId | null;
    },
    target: {
      email?: string | null;
      phone?: string | null;
      revision: number;
      mergedInto?: Types.ObjectId | null;
    },
    input: { sourceRevision: number; targetRevision: number },
  ) {
    if (source.mergedInto || target.mergedInto)
      throw new AppError(
        409,
        "CUSTOMER_MERGED",
        "Choose current canonical records",
      );
    if (
      source.revision !== input.sourceRevision ||
      target.revision !== input.targetRevision
    )
      throw new AppError(409, "CUSTOMER_CHANGED", "Customer revisions changed");
    if (source.organizationId)
      throw new AppError(
        409,
        "MERGE_LINKED_SOURCE",
        "Keep the linked customer as the target; organization and financial identity cannot be transferred",
      );
    if (
      !(source.email && source.email === target.email) &&
      !(source.phone && source.phone === target.phone)
    )
      throw new AppError(
        409,
        "MERGE_IDENTITY_UNPROVEN",
        "Matching names are not proof; a normalized email or phone must match",
      );
  }
  static async mergeDecision(
    auth: AuthenticatedUser,
    id: string,
    raw: unknown,
  ) {
    assertFreshAdmin(auth);
    const input = mergeDecisionSchema.parse(raw);
    return salesTransaction(async (session) => {
      const record = await SalesMergeRequest.findOne({
        _id: id,
        status: "PENDING",
        payloadHash: input.payloadHash,
        ...(input.decision === 'APPROVE' ? { expiresAt: { $gt: new Date() } } : {}),
      }).session(session);
      if (!record)
        throw new AppError(
          409,
          "MERGE_CHANGED",
          "Merge was changed, reviewed or expired",
        );
      if (
        payloadHash({
          sourceId: String(record.sourceId),
          targetId: String(record.targetId),
          sourceRevision: record.sourceRevision,
          targetRevision: record.targetRevision,
          reason: record.reason,
        }) !== input.payloadHash
      )
        throw new AppError(
          409,
          "MERGE_CHANGED",
          "Merge payload no longer matches the reviewed proposal",
        );
      if (input.decision === "APPROVE") {
      const [source, target] = await Promise.all([
        SuccessRepository.load(
          auth,
          String(record.sourceId),
          "sales.leads.update",
          session,
        ),
        SuccessRepository.load(
          auth,
          String(record.targetId),
          "sales.leads.update",
          session,
        ),
      ]);
      this.assertMerge(source, target, record);

        const ids = [
          ...new Set(
            [...target.mergedLeadIds, source._id, ...source.mergedLeadIds].map(
              String,
            ),
          ),
        ];
        if (ids.length > 100)
          throw new AppError(
            409,
            "MERGE_HISTORY_LIMIT",
            "More than 100 source identities require separate reviewed migration",
          );
        target.mergedLeadIds = ids.map((id) => new Types.ObjectId(id));
        if (source.consent === "OPTED_OUT" || source.optedOutAt) {
          target.consent = "OPTED_OUT";
          target.optedOutAt = source.optedOutAt ?? new Date();
        }
        source.mergedInto = target._id;
        source.revision += 1;
        target.revision += 1;
        await source.save({ session });
        await target.save({ session });
        record.status = "COMPLETED";
      } else
        record.status = input.decision === "REJECT" ? "REJECTED" : "CANCELLED";
      record.reviewedBy = auth.userId;
      record.reviewedAt = new Date();
      await record.save({ session });
      await AuditService.record(
        {
          actorUserId: auth.userId,
          action: "sales.merge.reviewed",
          resourceType: "SalesMergeRequest",
          resourceId: record._id,
          metadata: {
            sourceId: String(record.sourceId),
            targetId: String(record.targetId),
            decision: input.decision,
            payloadHash: input.payloadHash,
          },
        },
        session,
      );
      return { status: record.status, canonicalId: String(record.targetId) };
    });
  }
}
