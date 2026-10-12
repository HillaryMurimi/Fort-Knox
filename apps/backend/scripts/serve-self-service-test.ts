// Isolated test-only extension; never included in the production server or worker.
import "./serve-sales-demo-test.js";
import { createHmac } from "node:crypto";
import mongoose, { Types } from "mongoose";
import { env } from "../src/config/env.js";
import { integrationConfig } from "../src/core/integrations/config.js";
import { PaystackBillingProvider } from "../src/core/billing/billing-provider.js";
import { PaystackProvider } from "../src/core/integrations/paystack.provider.js";
import { PlatformSwitch } from "../src/database/models/PlatformSwitch.js";
import { ContractTemplateService } from "../src/modules/onboarding/contract-template.service.js";
import { defaultContractDraft } from "../src/modules/onboarding/contract-default.js";
import { contractVariables } from "../src/modules/onboarding/contract-snapshot.js";
import { Organization } from "../src/database/models/Organization.js";
import { OrganizationSubscription } from "../src/database/models/OrganizationSubscription.js";
import { SubscriptionInvoice } from "../src/database/models/SubscriptionInvoice.js";
import { AcquisitionJourney } from "../src/database/models/AcquisitionJourney.js";
import { IntegrationService } from "../src/modules/integrations/integration.service.js";
if (
  env.NODE_ENV !== "test" ||
  !process.send ||
  !mongoose.connection.name.endsWith("-test")
)
  throw Error("Private isolated IPC required");
env.SMS_ENABLED = false;
env.DOCUMENT_STORAGE_ENABLED = false;
env.ONBOARDING_RECOVERY_ENABLED = false;
for (const key of [
  "LANDLORD_ONBOARDING",
  "PAYSTACK_PAYMENTS",
  "DOCUMENT_STORAGE",
])
  await PlatformSwitch.create({
    key,
    kind: "SERVICE",
    name: key,
    description: "Isolated fixture",
    enabled: true,
    mode: "ON",
  });
const template = await ContractTemplateService.create(
  { userId: new Types.ObjectId(), isPlatformAdmin: true, memberships: [] },
  {
    ...defaultContractDraft,
    variables: [...contractVariables],
    effectiveAt: new Date("2026-01-01"),
  },
);
await ContractTemplateService.status(
  { userId: new Types.ObjectId(), isPlatformAdmin: true, memberships: [] },
  String(template!._id),
  "ACTIVE",
);
for (const model of [
  OrganizationSubscription,
  SubscriptionInvoice,
  AcquisitionJourney,
  mongoose.models.OrganizationContract!,
  mongoose.models.ContractTemplate!,
  mongoose.models.Document!,
  mongoose.models.Evidence!,
  mongoose.models.BillingEvent!,
])
  await model.createIndexes();
integrationConfig.paystack.enabled = true;
integrationConfig.paystack.secretKey = "sk_test_private_browser_fixture";
PaystackBillingProvider.prototype.createCustomer = async () => ({
  providerCustomerId: "CUS_private_fixture",
});
let privatePlanSequence = 0,
  privateSubscriptionSequence = 0;
PaystackBillingProvider.prototype.createPrepaidPlan = async () =>
  "PLN_private_fixture_" + ++privatePlanSequence;
PaystackBillingProvider.prototype.retryCheckout = async (_plan, input) => ({
  checkoutReference: input.checkoutReference!,
  checkoutUrl:
    env.WEB_ORIGIN +
    "/onboarding?reference=" +
    encodeURIComponent(input.checkoutReference!),
});
PaystackBillingProvider.prototype.scheduleRenewal = async (input) => ({
  subscription_code: "SUB_private_fixture_" + ++privateSubscriptionSequence,
  email_token: "private-test-only",
  next_payment_date: input.startsAt.toISOString(),
});
PaystackProvider.prototype.query = async (reference) => ({
  provider: "PAYSTACK",
  providerTransactionId: reference,
  status: "PENDING",
});
process.on("message", (message) => {
  const input = message as {
    type?: string;
    organizationId?: string;
    requestId?: string;
  };
  if (
    input.type !== "PCC_TEST_CONFIRM_PAYMENT" ||
    !Types.ObjectId.isValid(input.organizationId ?? "")
  )
    return;
  void (async () => {
    const org = await Organization.findById(input.organizationId).orFail(),
      sub = await OrganizationSubscription.findOne({
        organizationId: org._id,
      }).orFail(),
      invoice = await SubscriptionInvoice.findById(
        org.onboarding?.invoiceId,
      ).orFail();
    const body = {
      event: "charge.success",
      data: {
        status: "success",
        reference: sub.providerCheckoutReference,
        amount: invoice.totalMinor,
        currency: invoice.currency,
        paid_at: new Date().toISOString(),
        customer: { customer_code: "CUS_private_fixture" },
        authorization: {
          authorization_code: "AUTH_private_fixture",
          reusable: true,
        },
      },
    };
    const raw = Buffer.from(JSON.stringify(body)),
      signature = createHmac("sha512", integrationConfig.paystack.secretKey!)
        .update(raw)
        .digest("hex");
    await IntegrationService.handleWebhook("PAYSTACK", raw, signature);
    process.send!({
      type: "PCC_TEST_PAYMENT_RESULT",
      requestId: input.requestId,
      ok: true,
    });
  })().catch(() =>
    process.send!({
      type: "PCC_TEST_PAYMENT_RESULT",
      requestId: input.requestId,
      ok: false,
    }),
  );
});
process.stdout.write("SELF_SERVICE_TEST_READY\n");
