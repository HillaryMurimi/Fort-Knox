import { Types, type ClientSession } from "mongoose";
import { SubscriptionMovement } from "../../database/models/SubscriptionMovement.js";
import { SubscriptionInvoice } from "../../database/models/SubscriptionInvoice.js";
import { OrganizationContract } from "../../database/models/OrganizationContract.js";
import { BillingEvent } from "../../database/models/BillingEvent.js";
import { Organization } from "../../database/models/Organization.js";
import { OrganizationSubscription } from "../../database/models/OrganizationSubscription.js";

export const MovementRepository = {
  latest: (subscriptionId: Types.ObjectId, session: ClientSession) =>
    SubscriptionMovement.findOne({ subscriptionId })
      .sort({ sequence: -1 })
      .session(session),
  source: (sourceKey: string, session: ClientSession) =>
    SubscriptionMovement.findOne({ sourceKey }).session(session),
  async paidEvidence(invoiceId: Types.ObjectId, session: ClientSession) {
    const invoice = await SubscriptionInvoice.findOne({
      _id: invoiceId,
      provider: "PAYSTACK",
      status: "PAID",
    }).session(session);
    if (!invoice) return null;
    const contractId = invoice.contractId ?? invoice.originContractId;
    const contract = contractId
      ? await OrganizationContract.findOne({
          _id: contractId,
          organizationId: invoice.organizationId,
          status: "SIGNED",
        }).session(session)
      : null;
    const proof = invoice.providerInvoiceId
      ? await BillingEvent.findOne({
          organizationId: invoice.organizationId,
          provider: "PAYSTACK",
          externalReference: invoice.providerInvoiceId,
          type: "INVOICE_PAID",
          status: "PROCESSED",
        }).session(session)
      : null;
    const organization = await Organization.findById(invoice.organizationId)
      .select("settings")
      .session(session);
    const subscription = await OrganizationSubscription.findOne({
      _id: invoice.subscriptionId,
      organizationId: invoice.organizationId,
      provider: "PAYSTACK",
      status: "ACTIVE",
    })
      .select("currentPeriodStart currentPeriodEnd")
      .session(session);
    const priorPaid = await SubscriptionInvoice.exists({
      organizationId: invoice.organizationId,
      status: "PAID",
      _id: { $ne: invoice._id },
    }).session(session);
    return {
      invoice,
      contract,
      proof,
      organization,
      subscription,
      priorPaid: !!priorPaid,
    };
  },
};
