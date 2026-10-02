import { env } from "../../config/env.js";
import { AppError } from "../../core/errors/AppError.js";
import { Organization } from "../../database/models/Organization.js";
import { SalesValueEvent } from "../../database/models/SalesDemoSession.js";
export async function assertSalesIndexes() {
  if (env.NODE_ENV !== "production") return;
  for (const [collection, name, key] of [
    [
      SalesValueEvent.collection,
      "sales_demo_command_unique",
      { sessionId: 1, commandId: 1 },
    ],
    [
      Organization.collection,
      "guided_pilot_demo_unique",
      { "guidedPilot.demoSessionId": 1 },
    ],
    [
      Organization.collection,
      "guided_pilot_lead_unique",
      { "guidedPilot.leadId": 1 },
    ],
  ] as const) {
    let indexes;
    try {
      indexes = await collection.indexes();
    } catch {
      throw new AppError(
        503,
        "SALES_INDEXES_REQUIRED",
        "Initialize sales indexes before preparing demonstrations",
      );
    }
    if (
      !indexes.some(
        (index) =>
          index.name === name &&
          index.unique &&
          JSON.stringify(index.key) === JSON.stringify(key),
      )
    )
      throw new AppError(
        503,
        "SALES_INDEXES_REQUIRED",
        "Initialize sales indexes before preparing demonstrations",
      );
  }
}
