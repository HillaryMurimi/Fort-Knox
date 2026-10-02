import { mockAdminAssurance } from "../helpers/admin-assurance.js";
import request from "supertest";
import jwt from "jsonwebtoken";
import { Types } from "mongoose";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../src/app.js";
import { env } from "../../src/config/env.js";
import { User } from "../../src/database/models/User.js";
import { Role } from "../../src/database/models/Role.js";
import { OrganizationMembership } from "../../src/database/models/OrganizationMembership.js";
import { Organization } from "../../src/database/models/Organization.js";
afterEach(() => vi.restoreAllMocks());
const routes = [
  ["get", "/business-intelligence"],
  ["get", "/business-intelligence/drill-down"],
  ["get", "/morning-briefs"],
  ["get", "/morning-briefs/" + new Types.ObjectId()],
  ["post", "/morning-briefs"],
] as const;
function identity(role: string, admin = false) {
  const userId = new Types.ObjectId(),
    roleId = new Types.ObjectId(),
    organizationId = new Types.ObjectId();
  vi.spyOn(User, "findById").mockReturnValue({
    lean: async () => ({
      _id: userId,
      status: "ACTIVE",
      isPlatformAdmin: admin,
    }),
  } as never);
  vi.spyOn(OrganizationMembership, "find").mockReturnValue({
    lean: async () => [
      { organizationId, roleIds: [roleId], scope: { allProperties: true } },
    ],
  } as never);
  vi.spyOn(Role, "find").mockReturnValue({
    lean: async () => [
      { _id: roleId, key: role, permissions: ["platform.manage"] },
    ],
  } as never);
  if (admin) return mockAdminAssurance(userId);
  return jwt.sign(
    { sub: String(userId), type: "access" },
    env.JWT_ACCESS_SECRET,
  );
}
describe("platform business HTTP isolation", () => {
  it.each(routes)("requires authentication for %s %s", async (method, path) => {
    const response = await request(createApp())
      [method]("/api/v1/platform-control" + path)
      .send({});
    expect(response.status).toBe(401);
  });
  it.each([
    "LANDLORD",
    "PROPERTY_MANAGER",
    "CARETAKER",
    "CONTRACTOR",
    "TENANT",
    "SUPER_ADMIN",
  ])("denies an organization role %s across all endpoints", async (role) => {
    const token = identity(role),
      aggregate = vi.spyOn(Organization, "aggregate");
    for (const [method, path] of routes) {
      const response = await request(createApp())
        [method]("/api/v1/platform-control" + path)
        .auth(token, { type: "bearer" })
        .send({});
      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe("PLATFORM_ADMIN_REQUIRED");
    }
    expect(aggregate).not.toHaveBeenCalled();
  });
  it("validates query fields before reading platform records", async () => {
    const token = identity("SUPER_ADMIN", true),
      aggregate = vi.spyOn(Organization, "aggregate");
    const response = await request(createApp())
      .get(
        "/api/v1/platform-control/business-intelligence?plan=CONTROL&unexpected=secret",
      )
      .auth(token, { type: "bearer" });
    expect(response.status).toBe(400);
    expect(aggregate).not.toHaveBeenCalled();
  });
});
