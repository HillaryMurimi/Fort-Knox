import { env } from "../../config/env.js";
import { AppError } from "../../core/errors/AppError.js";
import { SalesLead } from "../../database/models/SalesLead.js";
export async function assertCustomerIdentityIndex() {
  if (env.NODE_ENV !== "production") return;
  const indexes = await SalesLead.collection.indexes().catch(() => []);
  if (
    !indexes.some(
      (i) =>
        i.name === "sales_customer_org_unique" &&
        i.unique &&
        i.key.organizationId === 1 &&
        i.partialFilterExpression?.organizationId?.$type === "objectId",
    )
  )
    throw new AppError(
      503,
      "SALES_INDEXES_REQUIRED",
      "Initialize sales indexes before linking customer identities",
    );
}
