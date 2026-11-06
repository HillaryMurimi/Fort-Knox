import { afterEach, describe, expect, it, vi } from "vitest";
import { env } from "../../src/config/env.js";
import { SubscriptionMovement } from "../../src/database/models/SubscriptionMovement.js";
import { assertMovementIndexes } from "../../src/modules/billing/subscription-movement.service.js";
const initial = env.NODE_ENV;
afterEach(() => {
  env.NODE_ENV = initial;
  vi.restoreAllMocks();
});
describe("Production movement uniqueness prerequisites", () => {
  it("fails closed for missing, partial or incorrectly scoped indexes", async () => {
    env.NODE_ENV = "production";
    const query = vi.spyOn(SubscriptionMovement.collection, "indexes");
    const source = {
      name: "subscription_movement_source_unique",
      unique: true,
      key: { sourceKey: 1 },
    };
    const sequence = {
      name: "subscription_movement_sequence_unique",
      unique: true,
      key: { subscriptionId: 1, sequence: 1 },
    };
    for (const indexes of [
      [],
      [source],
      [{ ...source, unique: false }, sequence],
      [{ ...source, partialFilterExpression: { dataset: "DEMO" } }, sequence],
      [{ ...source, key: { sourceKey: 1, extra: 1 } }, sequence],
    ]) {
      query.mockResolvedValue(indexes);
      await expect(assertMovementIndexes()).rejects.toMatchObject({
        code: "MOVEMENT_INDEXES_REQUIRED",
      });
    }
    query.mockResolvedValue([source, sequence]);
    await expect(assertMovementIndexes()).resolves.toBeUndefined();
  });
});
