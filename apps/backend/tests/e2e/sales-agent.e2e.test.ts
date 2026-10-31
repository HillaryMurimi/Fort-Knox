import {
  beforeAll,
  beforeEach,
  afterAll,
  afterEach,
  describe,
  it,
  expect,
} from "vitest";
import { randomUUID } from "node:crypto";
import mongoose, { Types } from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import request from "supertest";
import { createApp } from "../../src/app.js";
import { User } from "../../src/database/models/User.js";
import { SalesLead } from "../../src/database/models/SalesLead.js";
import { SalesActivity } from "../../src/database/models/SalesActivity.js";
import {
  SalesAgent,
  SalesAgentRun,
  SalesAgentApproval,
} from "../../src/database/models/SalesAgent.js";
import { PlatformSwitch } from "../../src/database/models/PlatformSwitch.js";
import { Job } from "../../src/database/models/Job.js";
import { SalesAgentService as service } from "../../src/modules/sales/sales-agent.service.js";
import { SalesSuccessService } from "../../src/modules/sales/sales-success.service.js";
import { JobService } from "../../src/modules/jobs/job.service.js";
import {
  setSalesModelTestProvider,
  type SalesModelProvider,
} from "../../src/integrations/ai/sales-model.provider.js";
import {
  agentKeys,
  agentTools,
  type AgentKey,
  type AgentOutput,
} from "../../src/modules/sales/sales-agent.schemas.js";
import type { AuthenticatedUser } from "../../src/core/types/auth.js";
import { completedAdminFixture } from "../helpers/admin-assurance.js";
import { setSalesResearchTestProvider } from '../../src/integrations/research/sales-research.provider.js';
import { Organization } from '../../src/database/models/Organization.js';
const output = (key: AgentKey): AgentOutput => ({
  summary: "Review actual customer context",
  evidence: ["Customer expressed a migration concern."],
  confidence: "MEDIUM",
  limitation: "No calendar or delivery confirmation.",
  action: {
    tool: agentTools[key][0]!,
    text: "Offer a guided migration briefing after checking consent.",
    reason: "Recorded customer requirement",
    subject: null,
    sourceUrls: [],
  },
});
const provider = (
  key: AgentKey,
  generate?: SalesModelProvider["generate"],
): SalesModelProvider => ({
  configured: () => true,
  generate:
    generate ??
    (async () => ({
      output: output(key),
      requestId: "test-provider-request",
      model: "controlled-test-model",
      inputTokens: 120,
      outputTokens: 100,
    })),
});
describe.skipIf(!process.env.RUN_E2E)(
  "Durable sales agent execution and review",
  () => {
    let mongo: MongoMemoryReplSet,
      admin: AuthenticatedUser,
      leadId: string,
      token: string;
    const app = createApp();
    beforeAll(async () => {
      mongo = await MongoMemoryReplSet.create({
        replSet: { count: 1 },
        binary: process.env.MONGOMS_SYSTEM_BINARY
          ? { systemBinary: process.env.MONGOMS_SYSTEM_BINARY }
          : {},
      });
      await mongoose.connect(mongo.getUri());
      for (const model of [
        SalesAgent,
        SalesAgentRun,
        SalesAgentApproval,
        Job,
        User,
        SalesLead,
        SalesActivity,
        PlatformSwitch,
      ])
        await model.init();
    }, 180000);
    afterAll(async () => {
      await mongoose.disconnect();
      await mongo?.stop();
    });
    beforeEach(async () => {
      for (const c of Object.values(mongoose.connection.collections))
        await c.deleteMany({});
      const user = await User.create({
        phone: "+254700005001",
        email: "agent-admin@example.test",
        firstName: "Agent",
        lastName: "Admin",
        isPlatformAdmin: true,
      });
      token = await completedAdminFixture(user._id);
      admin = {
        userId: user._id,
        isPlatformAdmin: true,
        sessionId: new Types.ObjectId(),
        mfaVerifiedAt: new Date(),
        adminDualChannel: true,
        memberships: [],
      };
      leadId = (
        await SalesSuccessService.create(admin, {
          name: "Customer",
          email: "customer@example.test",
          properties: 3,
          units: "100",
          challenge: "Needs careful migration",
          source: "Referral",
        })
      ).id;
      for (const key of [
        "SALES_AI_RUNTIME",
        "SALES_APPROVALS",
        "SALES_RESEARCH",
        ...agentKeys.map((k) => "SALES_AGENT_" + k),
      ])
        await PlatformSwitch.create({
          key,
          kind: "FEATURE",
          name: key,
          description: "Isolated test policy",
          enabled: true,
          mode: "ON",
        });
    });
    afterEach(() => { setSalesModelTestProvider(undefined); setSalesResearchTestProvider(undefined); });
    async function configure(
      key: AgentKey,
      overrides: Record<string, unknown> = {},
    ) {
      await service.configure(admin, key, {
        revision: 0,
        enabled: true,
        paused: false,
        maxDailyRuns: 20,
        maxOutputTokens: 1500,
        maxDailyTokens: 1000000,
        dailyBudgetMicroUsd: 0,
        ...overrides,
      });
    }
    async function create(key: AgentKey, commandId = randomUUID()) {
      return service.create(admin, {
        agent: key,
        leadId,
        objective: "Review customer needs and propose one next action",
        commandId,
      });
    }

    it.each(agentKeys)(
      "executes %s with a controlled provider, creates exact-payload approval and never sends",
      async (key) => {
        await configure(key);
        setSalesModelTestProvider(provider(key));
        const task = await create(key);
        expect(await Job.countDocuments({ type: "sales.agent.execute" })).toBe(
          1,
        );
        const jobs = await JobService.runDueJobs(1);
        expect(jobs[0]?.status).toBe("SUCCEEDED");
        const view = await service.view(admin, task.id);
        expect(view.run).toMatchObject({
          status: "AWAITING_APPROVAL",
          instructionVersion: 1,
          inputTokens: 120,
          outputTokens: 100,
        });
        expect(view.approval).toMatchObject({
          status: "PENDING",
          tool: agentTools[key][0],
        });
        expect(
          await SalesActivity.countDocuments({ kind: "sales.agent.note" }),
        ).toBe(0);
        if (!view.approval) throw new Error("Approval missing");
        await expect(
          service.decide(admin, String(view.approval._id), {
            decision: "APPROVE",
            payloadHash: "0".repeat(64),
            reason: "Review exact payload",
          }),
        ).rejects.toMatchObject({ code: "APPROVAL_CHANGED" });
        const approved = await service.decide(
          admin,
          String(view.approval._id),
          {
            decision: "APPROVE",
            payloadHash: view.approval.payloadHash,
            reason: "Reviewed actual proposal",
          },
        );
        expect(approved.dispatched).toBe(false);
        expect((await service.view(admin, task.id)).run.status).toBe(
          "COMPLETED",
        );
      },
    );
    it("idempotently queues one task and rejects command reuse with a different objective", async () => {
      const commandId = randomUUID();
      const first = await create("CRM_INTELLIGENCE", commandId),
        second = await create("CRM_INTELLIGENCE", commandId);
      expect(first.id).toBe(second.id);
      expect(await Job.countDocuments({})).toBe(1);
      await expect(
        service.create(admin, {
          agent: "CRM_INTELLIGENCE",
          leadId,
          objective: "Different objective",
          commandId,
        }),
      ).rejects.toMatchObject({ code: "COMMAND_REUSED" });
    });
    it("converges simultaneous identical task commands to one durable execution", async () => {
      const commandId = randomUUID();
      const [first, second] = await Promise.all([
        create("CRM_INTELLIGENCE", commandId),
        create("CRM_INTELLIGENCE", commandId),
      ]);
      expect(first.id).toBe(second.id);
      expect(await SalesAgentRun.countDocuments({ commandId })).toBe(1);
      expect(await Job.countDocuments({ type: "sales.agent.execute" })).toBe(1);
    });
    it("recovers an expired worker lease without duplicate proposals", async () => {
      await configure("CRM_INTELLIGENCE");
      setSalesModelTestProvider(provider("CRM_INTELLIGENCE"));
      const task = await create("CRM_INTELLIGENCE"),
        old = new Date(Date.now() - 700000);
      await SalesAgentRun.updateOne(
        { _id: task.id },
        {
          $set: {
            status: "RUNNING",
            leaseOwner: "lost-worker",
            leaseUntil: old,
          },
        },
      );
      await Job.updateOne(
        { type: "sales.agent.execute" },
        {
          $set: {
            status: "RUNNING",
            lockedAt: old,
            lockedBy: "lost-worker",
            leaseExpiresAt: old,
          },
        },
      );
      await JobService.runDueJobs(1);
      await JobService.runDueJobs(1);
      expect(await SalesAgentRun.findById(task.id).lean()).toMatchObject({
        status: "AWAITING_APPROVAL",
      });
      expect(await SalesAgentApproval.countDocuments({ runId: task.id })).toBe(
        1,
      );
    });
    it("blocks unavailable providers and disabled features without fabricating output", async () => {
      await configure("CRM_INTELLIGENCE");
      setSalesModelTestProvider({
        configured: () => false,
        generate: async () => {
          throw new Error("Must not call");
        },
      });
      const task = await create("CRM_INTELLIGENCE");
      await service.execute(task.id);
      expect(await SalesAgentRun.findById(task.id).lean()).toMatchObject({
        status: "BLOCKED",
        errorCode: "AI_NOT_CONFIGURED",
      });
      expect(await SalesAgentApproval.countDocuments({})).toBe(0);
      setSalesModelTestProvider(provider("CRM_INTELLIGENCE"));
      await service.control(admin, task.id, {
        action: "RESUME",
        reason: "Provider now available",
      });
      await PlatformSwitch.updateOne(
        { key: "SALES_AI_RUNTIME" },
        { $set: { mode: "OFF" } },
      );
      await service.execute(task.id);
      expect(await SalesAgentRun.findById(task.id).lean()).toMatchObject({
        status: "BLOCKED",
        errorCode: "SERVICE_DISABLED",
      });
    });
    it("does not let prompt text authorize a forbidden tool", async () => {
      await configure("SALES_OUTREACH");
      setSalesModelTestProvider(provider("CRM_INTELLIGENCE"));
      const task = await create("SALES_OUTREACH");
      for (let attempt = 0; attempt < 3; attempt++)
        await service.execute(task.id).catch(() => {});
      expect(await SalesAgentRun.findById(task.id).lean()).toMatchObject({
        status: "FAILED",
        errorCode: "AGENT_TOOL_DENIED",
      });
      expect(await SalesAgentApproval.countDocuments({})).toBe(0);
    });
    it("enforces daily limits atomically and rechecks revoked permissions at execution", async () => {
      await configure("CRM_INTELLIGENCE", { maxDailyRuns: 1 });
      setSalesModelTestProvider(provider("CRM_INTELLIGENCE"));
      await service.execute((await create("CRM_INTELLIGENCE")).id);
      const second = await create("CRM_INTELLIGENCE");
      await service.execute(second.id);
      expect(await SalesAgentRun.findById(second.id).lean()).toMatchObject({
        status: "BLOCKED",
        errorCode: "AGENT_LIMIT_REACHED",
      });
      await User.updateOne(
        { _id: admin.userId },
        { $set: { isPlatformAdmin: false } },
      );
      const third = await SalesAgentRun.create({
        agent: "CRM_INTELLIGENCE",
        leadId,
        requestedBy: admin.userId,
        objective: "Review revoked execution",
        serviceIdentity: "sales:CRM_INTELLIGENCE",
        instructionVersion: 1,
        commandId: randomUUID(),
        commandHash: "x",
      });
      await service.execute(String(third._id));
      expect(await SalesAgentRun.findById(third._id).lean()).toMatchObject({
        status: "BLOCKED",
        errorCode: "SALES_PERMISSION_REQUIRED",
      });
    });
    it("fences a cancelled in-flight response and preserves approvals across resume generations", async () => {
      await configure("CRM_INTELLIGENCE");
      let release!: () => void, entered!: () => void;
      const started = new Promise<void>((resolve) => {
          entered = resolve;
        }),
        gate = new Promise<void>((resolve) => {
          release = resolve;
        });
      setSalesModelTestProvider(
        provider("CRM_INTELLIGENCE", async () => {
          entered();
          await gate;
          return {
            output: output("CRM_INTELLIGENCE"),
            requestId: "cancelled-request",
            model: "test",
            inputTokens: 100,
            outputTokens: 50,
          };
        }),
      );
      const task = await create("CRM_INTELLIGENCE"),
        execution = service.execute(task.id);
      await started;
      await service.control(admin, task.id, {
        action: "CANCEL",
        reason: "Stop this pending execution",
      });
      release();
      await execution;
      expect(await SalesAgentRun.findById(task.id).lean()).toMatchObject({
        status: "CANCELLED",
      });
      expect(await SalesAgentApproval.countDocuments({ runId: task.id })).toBe(
        0,
      );
      setSalesModelTestProvider(provider("CRM_INTELLIGENCE"));
      const resumed = await create("CRM_INTELLIGENCE");
      await service.execute(resumed.id);
      await service.control(admin, resumed.id, {
        action: "PAUSE",
        reason: "Review additional context",
      });
      await service.control(admin, resumed.id, {
        action: "RESUME",
        reason: "Context review complete",
      });
      await service.execute(resumed.id);
      expect(
        await SalesAgentApproval.countDocuments({ runId: resumed.id }),
      ).toBe(2);
      expect(
        await SalesAgentApproval.countDocuments({
          runId: resumed.id,
          status: "CANCELLED",
        }),
      ).toBe(1);
    });
    it('executes permitted-source research, binds citations and imports explicitly reviewed CRM fields once', async () => {
      await configure('LEAD_RESEARCHER');
      const sourceUrl = 'https://company.example.com/rental-services';
      setSalesResearchTestProvider({ key: 'BRAVE', search: async query => {
        expect(query).toBe('rental property management companies Kenya');
        return [{ title: 'Company public services', url: sourceUrl, excerpt: 'Public source excerpt; not identity or consent proof.', provider: 'BRAVE', retrievedAt: new Date() }];
      } });
      setSalesModelTestProvider(provider('LEAD_RESEARCHER', async input => {
        expect(JSON.stringify(input.context)).toContain(sourceUrl);
        return { output: { ...output('LEAD_RESEARCHER'), action: { ...output('LEAD_RESEARCHER').action, sourceUrls: [sourceUrl] } }, requestId: 'controlled-research-response', model: 'test', inputTokens: 150, outputTokens: 100 };
      }));
      const task = await service.create(admin, { agent: 'LEAD_RESEARCHER', leadId, objective: 'Find suitable companies using permitted public sources', researchQuery: 'rental property management companies Kenya', commandId: randomUUID() });
      await service.execute(task.id);
      const reviewed = await service.view(admin, task.id);
      expect(reviewed.run.status).toBe('AWAITING_APPROVAL'); expect(reviewed.run.researchSources).toHaveLength(1);
      expect((await service.list(admin, {})).items[0]).not.toHaveProperty('researchSources');
      if (!reviewed.approval) throw new Error('Research approval missing');
      const body = { payloadHash: reviewed.approval.payloadHash, sourceUrl, customer: { name: 'Reviewed business prospect', email: 'public-business@example.test', properties: 2, units: '40', challenge: 'Reviewed migration requirement', source: 'Reviewed permitted research' } };
      await expect(service.importResearch(admin, String(reviewed.approval._id), body)).rejects.toMatchObject({ code: 'APPROVAL_CHANGED' });
      await service.decide(admin, String(reviewed.approval._id), { decision: 'APPROVE', payloadHash: reviewed.approval.payloadHash, reason: 'Reviewed exact cited source and limitations' });
      const imported = await service.importResearch(admin, String(reviewed.approval._id), body);
      expect(await SalesLead.findById(imported.id).lean()).toMatchObject({ sourceUrl, consent: 'UNKNOWN', assignedTo: admin.userId });
      await expect(service.importResearch(admin, String(reviewed.approval._id), { ...body, customer: { ...body.customer, email: 'different-review@example.test' } })).rejects.toMatchObject({ code: 'RESEARCH_SOURCE_IMPORTED' });
      expect(await SalesLead.countDocuments()).toBe(2);
      await expect(service.importResearch({ ...admin, adminDualChannel: false }, String(reviewed.approval._id), body)).rejects.toMatchObject({ code: 'FRESH_AUTH_REQUIRED' });
      const existingOwner = await User.create({ phone: '+254700005020', email: 'existing-owner@example.test', firstName: 'Existing', lastName: 'Owner', emailVerifiedAt: new Date() });
      await Organization.create({ name: 'Existing registered organization', slug: 'research-existing-org', onboarding: { ownerUserId: existingOwner._id } });
      await expect(service.importResearch(admin, String(reviewed.approval._id), { ...body, customer: { ...body.customer, email: existingOwner.email } })).rejects.toMatchObject({ code: 'EXISTING_ACCOUNT_REVIEW' });
      expect(await Job.countDocuments({ type: 'sales.research.expire' })).toBe(1);
      await SalesAgentRun.updateOne({ _id: task.id }, { $set: { researchExpiresAt: new Date(0) } });
      expect((await service.view(admin, task.id)).run.output).toBeUndefined();
      expect(await service.expireResearch(task.id)).toEqual({ redacted: true });
      expect((await SalesAgentApproval.findById(reviewed.approval._id))?.payloadHash).toBe(body.payloadHash);
      expect((await SalesAgentApproval.findById(reviewed.approval._id))?.payload).toMatchObject({ redacted: true });
      expect((await SalesLead.findById(imported.id))?.sourceUrl).toBe(sourceUrl);
      expect(await service.expireResearch(task.id)).toEqual({ redacted: false });
    });
    it('blocks missing research configuration and fabricated citations without creating approvals', async () => {
      await configure('LEAD_RESEARCHER'); setSalesModelTestProvider(provider('LEAD_RESEARCHER'));
      const raw = { agent: 'LEAD_RESEARCHER', leadId, objective: 'Find permitted public business sources', researchQuery: 'rental property companies', commandId: randomUUID() };
      const missing = await service.create(admin, raw); await service.execute(missing.id);
      expect(await SalesAgentRun.findById(missing.id).lean()).toMatchObject({ status: 'BLOCKED', errorCode: 'RESEARCH_NOT_CONFIGURED' });
      setSalesResearchTestProvider({ key: 'BRAVE', search: async () => [] });
      setSalesModelTestProvider(provider('LEAD_RESEARCHER', async () => ({ output: { ...output('LEAD_RESEARCHER'), action: { ...output('LEAD_RESEARCHER').action, sourceUrls: ['https://invented.example.com/claim'] } }, requestId: 'invalid-source-test', model: 'test', inputTokens: 100, outputTokens: 100 })));
      const invalid = await service.create(admin, { ...raw, commandId: randomUUID() }); await expect(service.execute(invalid.id)).rejects.toMatchObject({ code: 'RESEARCH_EVIDENCE_REQUIRED' });
      expect(await SalesAgentRun.findById(invalid.id).lean()).toMatchObject({ errorCode: 'RESEARCH_EVIDENCE_REQUIRED' });
      expect(await SalesAgentApproval.countDocuments()).toBe(0);
      await expect(service.create(admin, { ...raw, researchQuery: 'private-contact@example.test', commandId: randomUUID() })).rejects.toThrow();
      await expect(service.create(admin, { ...raw, agent: 'CRM_INTELLIGENCE', commandId: randomUUID() })).rejects.toThrow();
      setSalesModelTestProvider(provider('LEAD_RESEARCHER'));
      const pending = await service.create(admin, { ...raw, commandId: randomUUID() }); await service.execute(pending.id);
      await service.control(admin, pending.id, { action: 'PAUSE', reason: 'Review source evidence before resuming' });
      await SalesAgentRun.updateOne({ _id: pending.id }, { $set: { researchExpiresAt: new Date(0) } });
      await service.control(admin, pending.id, { action: 'RESUME', reason: 'Collect fresh permitted-source evidence' });
      await service.execute(pending.id);
      expect((await SalesAgentApproval.findOne({ runId: pending.id, generation: 1 }))?.payload).toMatchObject({ redacted: true });
      expect((await SalesAgentRun.findById(pending.id))?.status).toBe('AWAITING_APPROVAL');
      await SalesAgentRun.updateOne({ _id: pending.id }, { $set: { researchExpiresAt: new Date(0) } });
      await JobService.execute({ type: 'sales.research.expire', payload: { runId: pending.id } });
      expect((await SalesAgentRun.findById(pending.id))?.status).toBe('CANCELLED');
      expect((await SalesAgentApproval.findOne({ runId: pending.id }).sort({ generation: -1 }))?.status).toBe('EXPIRED');
    });
    it('serializes simultaneous reviewed imports so separate sources cannot duplicate the same contact', async () => {
      await configure('LEAD_RESEARCHER');
      const urls = ['https://company.example.com/source-one', 'https://company.example.com/source-two'];
      setSalesResearchTestProvider({ key: 'BRAVE', search: async () => urls.map(url => ({ title: 'Public company source', url, excerpt: 'Unverified public business excerpt', provider: 'BRAVE' as const, retrievedAt: new Date() })) });
      setSalesModelTestProvider(provider('LEAD_RESEARCHER', async () => ({ output: { ...output('LEAD_RESEARCHER'), action: { ...output('LEAD_RESEARCHER').action, sourceUrls: urls } }, requestId: 'concurrent-import-test', model: 'test', inputTokens: 100, outputTokens: 100 })));
      const task = await service.create(admin, { agent: 'LEAD_RESEARCHER', leadId, researchQuery: 'rental management companies', objective: 'Review sourced companies for explicit import', commandId: randomUUID() }); await service.execute(task.id);
      const approval = await SalesAgentApproval.findOne({ runId: task.id }); if (!approval) throw new Error('Approval missing');
      await service.decide(admin, String(approval._id), { decision: 'APPROVE', payloadHash: approval.payloadHash, reason: 'Reviewed exact permitted-source references' });
      const results = await Promise.allSettled(urls.map(sourceUrl => service.importResearch(admin, String(approval._id), { payloadHash: approval.payloadHash, sourceUrl, customer: { name: 'One business customer', email: 'one-business@example.test', properties: 2, units: '40', challenge: 'Reviewed customer requirements', source: 'Reviewed research' } })));
      expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
      expect(results.find(r => r.status === 'rejected')).toMatchObject({ reason: { code: 'POSSIBLE_DUPLICATE' } });
      expect(await SalesLead.countDocuments({ email: 'one-business@example.test' })).toBe(1);
    });
    it("requires authenticated, authorized HTTP access and fresh administrator decisions", async () => {
      expect(
        (await request(app).get("/api/v1/sales/success/agent-runs")).status,
      ).toBe(401);
      const response = await request(app)
        .post("/api/v1/sales/success/agent-runs")
        .auth(token, { type: "bearer" })
        .send({
          agent: "CRM_INTELLIGENCE",
          leadId,
          objective: "Inspect actual customer context",
          commandId: randomUUID(),
          tool: "grant.permissions",
        });
      expect(response.status).toBe(400);
      await expect(
        service.configure(
          { ...admin, adminDualChannel: false },
          "CRM_INTELLIGENCE",
          {},
        ),
      ).rejects.toMatchObject({ code: "FRESH_AUTH_REQUIRED" });
    });
  it('executes the exact approved note payload and permits safe rejection after owner revocation', async () => {
    await configure('CRM_INTELLIGENCE'); setSalesModelTestProvider(provider('CRM_INTELLIGENCE'));
    const task = await create('CRM_INTELLIGENCE'); await service.execute(task.id);
    const approval = await SalesAgentApproval.findOne({ runId: task.id });
    if (!approval) throw new Error('Approval missing');
    await SalesAgentRun.updateOne({ _id: task.id }, { $set: { 'output.action.text': 'Altered unapproved execution text' } });
    await service.decide(admin, String(approval._id), { decision: 'APPROVE', payloadHash: approval.payloadHash, reason: 'Reviewed exact original payload' });
    expect((await SalesActivity.findOne({ resourceId: task.id, kind: 'sales.agent.note' }))?.text).toBe(output('CRM_INTELLIGENCE').action.text);
    const another = await create('CRM_INTELLIGENCE'); await service.execute(another.id);
    const pending = await SalesAgentApproval.findOne({ runId: another.id });
    if (!pending) throw new Error('Approval missing');
    await User.updateOne({ _id: admin.userId }, { $set: { status: 'DEACTIVATED' } });
    const reviewer = await User.create({ phone: '+254700005009', email: 'reviewer@example.test', firstName: 'Review', lastName: 'Admin', isPlatformAdmin: true });
    const reviewAuth = { ...admin, userId: reviewer._id };
    await expect(service.decide(reviewAuth, String(pending._id), { decision: 'APPROVE', payloadHash: pending.payloadHash, reason: 'Must recheck the revoked owner' })).rejects.toMatchObject({ code: 'AGENT_ACTOR_REVOKED' });
    await service.decide(reviewAuth, String(pending._id), { decision: 'REJECT', payloadHash: pending.payloadHash, reason: 'Safely reject revoked actor proposal' });
    expect((await SalesAgentApproval.findById(pending._id))?.status).toBe('REJECTED');
  });
  },
);
