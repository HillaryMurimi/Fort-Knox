import { env } from "../../config/env.js";
import { AppError } from "../../core/errors/AppError.js";
import { createHash, randomBytes } from "node:crypto";
import type { ClientSession, Types } from "mongoose";
import { AcquisitionJourney } from "../../database/models/AcquisitionJourney.js";
import { SubscriptionPlan } from "../../database/models/SubscriptionPlan.js";
import { priceSnapshot } from "../onboarding/contract-snapshot.js";
import {
  publicAcquisitionEventSchema,
  publicPlanQuoteSchema,
  type AcquisitionContext,
} from "./acquisition.schemas.js";

const digest = (token: string) =>
  createHash("sha256").update(token).digest("hex");
const eventFields = {
  landing_viewed: "landingAt",
  demo_started: "demoStartedAt",
  demo_completed: "demoCompletedAt",
  plan_selected: "planSelectedAt",
  signup_started: "signupStartedAt",
} as const;
export class AcquisitionService {
  static async catalog(raw: unknown) {
    const input = publicPlanQuoteSchema.parse(raw);
    const plans = await SubscriptionPlan.find({
      key: { $in: ["CONTROL", "FORT_KNOX"] },
      active: true,
    })
      .select(
        "key name description currency amount billingInterval metadata entitlements.features",
      )
      .sort({ amount: 1 })
      .limit(2)
      .lean();
    return {
      plans: plans.map((plan) => ({
        key: plan.key,
        name: plan.name,
        description: plan.description,
        pricing: priceSnapshot(plan, input.units, input.months),
        features: plan.entitlements?.features ?? [],
      })),
      minimumPrepaidMonths: 3,
      terms: {
        taxPolicy:
          "No tax is calculated by the current billing policy. The signed invoice is authoritative.",
        hardware:
          "Hardware, installation and separate provider costs are excluded unless agreed in writing.",
        renewal:
          "Renewal follows the signed agreement and configured payment authorization.",
        cancellation:
          "Review the current agreement before signing; cancellation and refund terms are retained with it.",
        paymentMethods:
          "Available methods are shown by secure Paystack checkout. Recurring billing requires reusable authorization.",
      },
    };
  }
  static async recordPublic(raw: unknown) {
    const input = publicAcquisitionEventSchema.parse(raw),
      now = new Date();
    if (env.NODE_ENV === "production") {
      const indexes = await AcquisitionJourney.collection
        .indexes()
        .catch(() => []);
      const ready = [
        "acquisition_token_unique",
        "acquisition_org_unique",
        "acquisition_anonymous_expiry",
      ].every((name) =>
        indexes.some(
          (index) =>
            index.name === name &&
            (name === "acquisition_anonymous_expiry"
              ? index.expireAfterSeconds === 0 &&
                index.partialFilterExpression?.retentionClass === "ANONYMOUS"
              : index.unique),
        ),
      );
      if (!ready)
        throw new AppError(
          503,
          "ACQUISITION_INDEXES_REQUIRED",
          "Initialize sales/acquisition indexes before collecting journey analytics",
        );
    }
    let token = input.journeyToken;
    let journey = token
      ? await AcquisitionJourney.findOne({
          tokenHash: digest(token),
          expiresAt: { $gt: now },
          retentionClass: "ANONYMOUS",
        }).select("_id")
      : null;
    if (!journey) {
      token = randomBytes(32).toString("base64url");
      journey = await AcquisitionJourney.create({
        tokenHash: digest(token),
        source: input.source,
        expiresAt: new Date(now.getTime() + 30 * 86400000),
      });
    }
    const field = eventFields[input.event];
    // Each session has one timestamp per public milestone; repeated renders do not inflate counts.
    await AcquisitionJourney.updateOne(
      {
        _id: journey._id,
        [field]: { $exists: false },
        retentionClass: "ANONYMOUS",
      },
      {
        $set: {
          [field]: now,
          ...(input.event === "plan_selected" && input.planKey
            ? { planKey: input.planKey }
            : {}),
        },
      },
    );
    return { journeyToken: token, recorded: true };
  }
  static async bindSignup(
    context: AcquisitionContext | undefined,
    organizationId: Types.ObjectId,
    session: ClientSession,
  ) {
    if (!context?.journeyToken) return null;
    const journey = await AcquisitionJourney.findOneAndUpdate(
      {
        tokenHash: digest(context.journeyToken),
        retentionClass: "ANONYMOUS",
        organizationId: { $exists: false },
        expiresAt: { $gt: new Date() },
      },
      {
        $set: {
          organizationId,
          retentionClass: "ACCOUNT",
          ...(context.selectedPlanKey
            ? { planKey: context.selectedPlanKey }
            : {}),
        },
        $unset: { tokenHash: 1 },
      },
      { new: true, session },
    );
    // Missing/expired analytics is never an account-creation or payment prerequisite.
    return journey?._id ?? null;
  }
}
