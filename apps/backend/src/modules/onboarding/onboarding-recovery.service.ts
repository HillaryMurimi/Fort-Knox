import mongoose, { Types, type ClientSession } from "mongoose";
import { env } from "../../config/env.js";
import { AppError } from "../../core/errors/AppError.js";
import { Organization } from "../../database/models/Organization.js";
import { User } from "../../database/models/User.js";
import { OrganizationMembership } from "../../database/models/OrganizationMembership.js";
import { Role } from "../../database/models/Role.js";
import { DomainEvent } from "../../database/models/DomainEvent.js";
import { Job } from "../../database/models/Job.js";
import { Property } from "../../database/models/Property.js";
import { Unit } from "../../database/models/Unit.js";
import { NotificationPreference } from "../../database/models/NotificationPreference.js";
import { NotificationService } from "../notifications/notification.service.js";
import { AuditService } from "../audit/audit.service.js";

export const recoveryEvents = [
  "landlord.signup.created",
  "landlord.email.verified",
  "organization.activated",
  "portfolio.import.completed",
] as const;
export const recoveryEnabled = () =>
  env.ONBOARDING_RECOVERY_ENABLED && !!env.ONBOARDING_RECOVERY_APPROVAL_CASE;
const cooldown = 7 * 86400000;
export class OnboardingRecoveryService {
  static async schedule(
    event: { eventId: string; organizationId: Types.ObjectId; name: string },
    session: ClientSession,
  ) {
    if (
      !recoveryEnabled() ||
      !recoveryEvents.some((name) => name === event.name)
    )
      return;
    await Job.create(
      [
        {
          organizationId: event.organizationId,
          type: "domain-event.onboarding-recovery",
          payload: { eventId: event.eventId },
          availableAt: new Date(Date.now() + 48 * 3600000),
          dedupeKey: "domain-event:onboarding-recovery:" + event.eventId,
          maxAttempts: 5,
        },
      ],
      { session },
    );
  }
  private static async candidate(
    organizationId: Types.ObjectId,
    session?: ClientSession,
  ) {
    const org = await Organization.findOne({
      _id: organizationId,
      status: "ACTIVE",
    })
      .session(session ?? null)
      .lean();
    if (
      !org?.onboarding?.ownerUserId ||
      (org.settings as { onboardingRecovery?: { emailOptIn?: boolean } })
        ?.onboardingRecovery?.emailOptIn !== true
    )
      return null;
    const user = await User.findOne({
      _id: org.onboarding.ownerUserId,
      status: "ACTIVE",
      isPlatformAdmin: false,
      emailVerifiedAt: { $type: "date" },
    })
      .session(session ?? null)
      .lean();
    if (!user?.email) return null;
    const role = await Role.findOne({
      key: "LANDLORD",
      system: true,
      organizationId: null,
    })
      .session(session ?? null)
      .lean();
    if (
      !role ||
      !(await OrganizationMembership.exists({
        organizationId,
        userId: user._id,
        status: "ACTIVE",
        roleIds: role._id,
        "scope.allProperties": true,
      }).session(session ?? null))
    )
      return null;
    const preference = await NotificationPreference.findOne({
      organizationId,
      userId: user._id,
      eventType: "ONBOARDING_RECOVERY",
    })
      .session(session ?? null)
      .lean();
    if (
      preference &&
      (!preference.enabled || !preference.channels.includes("EMAIL"))
    )
      return null;
    let stage = "AGREEMENT_AND_PLAN",
      destination = "/onboarding";
    if (
      ["CONTRACT_SIGNED", "INVOICE_ISSUED", "PAYMENT_PENDING"].includes(
        org.onboarding.state,
      )
    )
      stage = "PAYMENT";
    if (org.onboarding.state === "ACTIVE") {
      destination = "/get-started";
      if (
        !(await Property.exists({
          organizationId,
          status: { $ne: "ARCHIVED" },
        }).session(session ?? null))
      )
        stage = "FIRST_PROPERTY";
      else if (
        !(await Unit.exists({
          organizationId,
          status: { $ne: "INACTIVE" },
        }).session(session ?? null))
      )
        stage = "UNITS";
      else if (!org.portfolioOnboarding?.firstDashboardAt)
        stage = "FIRST_DASHBOARD";
      else return null;
    }
    return { org, user, stage, destination };
  }
  static async consume(eventId: string, organizationId: Types.ObjectId) {
    if (!recoveryEnabled()) return { skipped: "DISABLED" };
    const event = await DomainEvent.findOne({
      eventId,
      organizationId,
      aggregateType: "Organization",
      aggregateId: organizationId,
      name: { $in: recoveryEvents },
    }).lean();
    if (!event)
      throw new AppError(
        404,
        "RECOVERY_EVENT_NOT_FOUND",
        "Recovery event is not bound to this organization",
      );
    const session = await mongoose.startSession();
    let queued = false;
    try {
      await session.withTransaction(async () => {
        await Organization.updateOne(
          { _id: organizationId },
          { $inc: { __v: 1 } },
          { session },
        );
        const current = await this.candidate(organizationId, session);
        if (!current) return;
        const count = current.org.portfolioOnboarding?.recoveryCount ?? 0,
          last = current.org.portfolioOnboarding?.lastRecoveryAt,
          now = new Date();
        if (count >= 3 || (last && now.getTime() - last.getTime() < cooldown))
          return;
        const notice = await NotificationService.systemEnqueue(
          {
            organizationId,
            recipientUserId: current.user._id,
            channel: "EMAIL",
            type: "ONBOARDING_RECOVERY",
            title: "Continue setting up your Dapinni workspace",
            body:
              "You opted in to setup reminders. Your saved progress is ready when you are. Resume securely at " +
              env.WEB_ORIGIN +
              "/login?next=" +
              encodeURIComponent(current.destination) +
              ". You can disable ONBOARDING_RECOVERY email in your notification preferences.",
            data: {
              stage: current.stage,
              approvalCase: env.ONBOARDING_RECOVERY_APPROVAL_CASE,
            },
            scheduledFor: now,
            dedupeKey:
              "onboarding-recovery:" + organizationId + ":" + (count + 1),
          },
          session,
        );
        if (!notice) return;
        await Job.create(
          [
            {
              organizationId,
              type: "notification.send",
              payload: { notificationId: String(notice._id) },
              availableAt: now,
              maxAttempts: 5,
              dedupeKey: "notification:" + notice._id,
            },
          ],
          { session },
        );
        await Organization.updateOne(
          { _id: organizationId },
          {
            $set: { "portfolioOnboarding.lastRecoveryAt": now },
            $inc: { "portfolioOnboarding.recoveryCount": 1 },
          },
          { session },
        );
        if (count + 1 < 3)
          await Job.create(
            [
              {
                organizationId,
                type: "domain-event.onboarding-recovery",
                payload: { eventId },
                availableAt: new Date(now.getTime() + cooldown),
                maxAttempts: 5,
                dedupeKey:
                  "domain-event:onboarding-recovery:" +
                  organizationId +
                  ":" +
                  (count + 2),
              },
            ],
            { session },
          );
        await AuditService.record(
          {
            organizationId,
            action: "onboarding.recovery.queued",
            resourceType: "Notification",
            resourceId: notice._id,
            metadata: {
              stage: current.stage,
              reminder: count + 1,
              approvalCase: env.ONBOARDING_RECOVERY_APPROVAL_CASE,
            },
          },
          session,
        );
        queued = true;
      });
    } finally {
      await session.endSession();
    }
    return { queued };
  }
  // Recheck authorization, consent, preferences and stage just before provider delivery.
  static async mayDeliver(
    organizationId: Types.ObjectId,
    userId: Types.ObjectId,
    stage: unknown,
    approvalCase: unknown,
  ) {
    if (
      !recoveryEnabled() ||
      approvalCase !== env.ONBOARDING_RECOVERY_APPROVAL_CASE
    )
      return false;
    const current = await this.candidate(organizationId);
    return (
      !!current && current.user._id.equals(userId) && current.stage === stage
    );
  }
}
