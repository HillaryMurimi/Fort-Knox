import { createHash } from "node:crypto";
import { AppError } from "../../core/errors/AppError.js";
import { assertMaintenanceTransition } from "../maintenance/maintenance.transitions.js";
import type {
  DemoAction,
  DemoProfile,
  DemoSnapshot,
  DemoSummary,
  DemoEvidence,
  DemoMaintenance,
  DemoUnit,
} from "./sales-demo.types.js";
export const demoTemplates = [
  { id: "CONTROL_40", name: "Control · 40 units", units: 40, properties: 1 },
  { id: "CONTROL_150", name: "Control · 150 units", units: 150, properties: 3 },
  {
    id: "CONTROL_PORTFOLIO",
    name: "Control · multi-property portfolio",
    units: 300,
    properties: 5,
  },
  { id: "EXECUTIVE", name: "Executive apartments", units: 60, properties: 2 },
  {
    id: "FORT_SECURITY",
    name: "Fort Knox · security-conscious property",
    units: 40,
    properties: 1,
  },
  {
    id: "FORT_PORTFOLIO",
    name: "Fort Knox · multi-site portfolio",
    units: 300,
    properties: 5,
  },
];
export const demoStories = [
  {
    id: "RENT",
    name: "Rent & arrears",
    question:
      "How much is outstanding, where is it, and what can you do today?",
  },
  {
    id: "MAINTENANCE",
    name: "Maintenance & repairs",
    question: "Was the leaking pipe repaired — and how do you know?",
  },
  {
    id: "EXPENSES",
    name: "Expense accountability",
    question: "Why did we spend KES 18,000 on the pump?",
  },
  {
    id: "PORTFOLIO",
    name: "Portfolio visibility",
    question: "What needs your attention across the whole portfolio?",
  },
  {
    id: "STAFF",
    name: "Staff accountability",
    question: "Who was responsible, and what happened before the deadline?",
  },
  {
    id: "VACANCY",
    name: "Vacancy & occupancy",
    question: "Which empty unit is quietly increasing your exposure?",
  },
  {
    id: "EXECUTIVE",
    name: "Executive apartments",
    question:
      "You have managers, accountants, guards and software. Do you have one operational picture?",
  },
  {
    id: "SECURITY",
    name: "Fort Knox security",
    question: "What happened at 02:14 while you were away?",
  },
  {
    id: "FULL",
    name: "Full Command Center",
    question:
      "What does running the portfolio from one command center feel like?",
  },
];
const anchor = "2026-09-14T06:00:00.000Z";
const shift = (value: string, days: number) =>
  new Date(Date.parse(value) + days * 86400000).toISOString();
const share = (total: number, count: number, index: number) =>
  Math.floor(total / count) + (index < total % count ? 1 : 0);
const names = [
  "Wanjiku Njeri",
  "Kamau Otieno",
  "Amina Wambui",
  "Brian Mwangi",
  "Grace Achieng",
  "Daniel Kimani",
  "Faith Atieno",
  "Peter Maina",
];
const properties = [
  "Acacia Court · Kilimani",
  "Mawingu Gardens · Ruaka",
  "Jabali Heights · Kiambu",
  "Nyota Residences · Westlands",
  "Mwangaza Place · Thika",
];
function evidence(
  resourceId: string,
  title: string,
  content: string,
  at = anchor,
): DemoEvidence {
  return {
    id: `demo-evidence-${resourceId.replace("demo-", "")}-${title
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "")
      .slice(0, 24)}`,
    resourceId,
    title,
    content,
    sha256: createHash("sha256").update(content).digest("hex"),
    at,
    source: "DEMO",
  };
}
export function buildDemo(profile: DemoProfile): DemoSnapshot {
  const template = demoTemplates.find((t) => t.id === profile.template);
  if (!template)
    throw new AppError(
      400,
      "INVALID_TEMPLATE",
      "Select a known deterministic template",
    );
  const count = profile.units ?? template.units,
    propertyCount = profile.properties ?? template.properties;
  const occupied = Math.max(
    1,
    Math.round((count * (profile.occupancy ?? 94)) / 100),
  );
  const executive =
    profile.executiveApartments ||
    profile.primaryPain === "EXECUTIVE" ||
    profile.template === "EXECUTIVE";
  const commercial = profile.use === "COMMERCIAL";
  const expected =
    profile.monthlyRentRollMinor ??
    (profile.template === "CONTROL_150"
      ? 280000000
      : occupied * (executive ? 8500000 : commercial ? 4500000 : 2000000));
  const arrearsCount = Math.min(
    occupied,
    Math.max(1, Math.round((occupied * 17) / 141)),
  );
  const outstanding = Math.round((expected * 5) / 28),
    high = Math.min(5, arrearsCount);
  const balances = Array.from({ length: arrearsCount }, (_, i) =>
    share(
      i < high
        ? Math.round(outstanding * 0.36)
        : outstanding - Math.round(outstanding * 0.36),
      i < high ? high : arrearsCount - high,
      i < high ? i : i - high,
    ),
  );
  if (arrearsCount === high)
    for (let i = 0; i < high; i++) balances[i] = share(outstanding, high, i);
  const debtTotals = balances.map((balance) =>
    Math.max(balance, Math.floor(expected / occupied)),
  );
  const remaining = expected - debtTotals.reduce((s, n) => s + n, 0);
  if (remaining < 0)
    throw new AppError(
      400,
      "INVALID_DEMO_SCALE",
      "Rent roll is too small for the selected portfolio",
    );
  const units: DemoUnit[] = Array.from({ length: count }, (_, i) => ({
    id: `demo-unit-${i + 1}`,
    property:
      (executive
        ? properties[(i % propertyCount) % properties.length]
            .replace("Court", "Suites")
            .replace("Gardens", "Executive Residences")
        : commercial
          ? properties[(i % propertyCount) % properties.length]
              .replace("Court", "Business Centre")
              .replace("Gardens", "Plaza")
          : properties[(i % propertyCount) % properties.length]) +
      (propertyCount > properties.length
        ? ` · Site ${(i % propertyCount) + 1}`
        : ""),
    building: i % 2 ? "Block B" : "Block A",
    floor: `Floor ${Math.floor((i / propertyCount) % 5) + 1}`,
    code:
      i === occupied
        ? "B14"
        : `${i % 2 ? "B" : "A"}${String(Math.floor(i / 2) + 1).padStart(2, "0")}`,
    status: i < occupied ? ("OCCUPIED" as const) : ("VACANT" as const),
    monthlyRentMinor: Math.floor(expected / occupied),
    ...(i < occupied
      ? {
          tenant: `${commercial ? ["Nyota Design Studio", "Jabali Consulting", "Acacia Books", "Mawingu Trading"][i % 4] : names[i % names.length]}${i >= names.length ? ` · ${commercial ? "Occupier" : "Resident"} ${i + 1}` : ""}`,
          tenancyId: `demo-tenancy-${i + 1}`,
          leaseEndsAt: shift(anchor, 20 + (i % 180)),
        }
      : {
          previousTenancyEnd: shift(anchor, -(37 + (i - occupied) * 3)),
          vacantDays: 37 + (i - occupied) * 3,
          vacancyExposureMinor: Math.round(
            (Math.floor(expected / occupied) * (37 + (i - occupied) * 3)) / 30,
          ),
          vacancyAction: "Assign a viewing and readiness review",
        }),
  }));
  const charges = units.slice(0, occupied).map((unit, i) => {
    const total =
        i < arrearsCount
          ? debtTotals[i]
          : share(remaining, occupied - arrearsCount, i - arrearsCount),
      balance = balances[i] ?? 0;
    return {
      id: `demo-charge-${i + 1}`,
      unitId: unit.id,
      tenancyId: unit.tenancyId!,
      dueAt: shift(anchor, -9),
      totalMinor: total,
      paidMinor: total - balance,
      balanceMinor: balance,
      status: balance ? ("OVERDUE" as const) : ("PAID" as const),
      followUp: balance
        ? "Manager followed up on 11 September; tenant requested a ledger statement."
        : "Reconciled payment received.",
      history: [
        {
          at: shift(anchor, -69),
          label: "July rent reconciled",
          amountMinor: unit.monthlyRentMinor,
        },
        {
          at: shift(anchor, -38),
          label: "August rent reconciled",
          amountMinor: unit.monthlyRentMinor,
        },
        {
          at: shift(anchor, -3),
          label: "September payment allocated",
          amountMinor: total - balance,
        },
      ],
    };
  });
  const maintenance: DemoMaintenance[] = Array.from({ length: 8 }, (_, i) => ({
    id: `demo-maintenance-${i + 1}`,
    unitId: units[i % occupied].id,
    title: [
      "Critical water-pump repair",
      "Leaking kitchen pipe",
      "Lift service inspection",
      "Entrance lighting",
      "Bathroom seal replacement",
      "Drainage clearing",
      "Corridor painting",
      "Tap replacement",
    ][i],
    description:
      i === 0
        ? "Water pump stopped; tenants on upper floors have interrupted water supply."
        : i === 1
          ? "Tenant reported a leaking pipe through a structured service request."
          : "Reported through the tenant service desk; location and responsibility are attached.",
    priority: i === 0 ? "CRITICAL" : i === 1 ? "HIGH" : "MEDIUM",
    status:
      i < 2
        ? "APPROVAL_REQUIRED"
        : i < 4
          ? "ASSIGNED"
          : i < 6
            ? "IN_PROGRESS"
            : "CLOSED",
    requestedBy:
      i === 0 ? "Miriam · property manager" : units[i % occupied].tenant!,
    responsible: "Joseph · caretaker",
    contractor:
      i === 0 ? "Imara Pump Services" : "Mwangaza Plumbing & Services",
    assignedAt: shift(anchor, -2),
    deadline: shift(anchor, i === 0 ? -1 : 1),
    quoteMinor: i === 0 ? 1800000 : 850000,
    ...(i >= 4 ? { approvedMinor: 850000 } : {}),
    ...(i >= 6 ? { finalCostMinor: 800000 } : {}),
    evidenceIds: [],
    serviceStatus:
      i >= 6
        ? "Tenant confirmed resolution"
        : "Tenant can see request status without WhatsApp",
  }));
  const artifacts = maintenance.flatMap((item) => [
    evidence(
      item.id,
      "Before inspection",
      `${item.title}: fictional inspection record, location ${item.unitId}; caretaker reported condition before work.`,
    ),
    evidence(
      item.id,
      "Quotation",
      `${item.contractor} quoted KES ${(item.quoteMinor / 100).toFixed(2)}; scope and responsible person attached.`,
    ),
  ]);
  for (const item of maintenance)
    item.evidenceIds = artifacts
      .filter((e) => e.resourceId === item.id)
      .map((e) => e.id);
  return {
    version: 1,
    dataset: "SALES_DEMO",
    asOf: anchor,
    clock: anchor,
    organizationName: profile.companyName,
    plan: profile.plan,
    story: profile.primaryPain,
    units,
    charges,
    maintenance,
    incidents: [],
    evidence: artifacts,
    staff: [
      {
        id: "demo-task-1",
        responsible: "Joseph · caretaker",
        assignment: "Inspect Unit B14 and upload readiness evidence",
        assignedAt: shift(anchor, -4),
        deadline: shift(anchor, -1),
        status: "OVERDUE",
        evidence: "No completion evidence supplied",
      },
    ],
    notifications: [
      {
        id: "demo-notification-1",
        channel: "SIMULATED IN-APP",
        recipient: "Miriam · property manager",
        message:
          "Leaking pipe reported; location and tenant already identified.",
      },
    ],
    payments: [],
    history: [
      {
        at: shift(anchor, -3),
        action: "maintenance.reported",
        resourceId: "demo-maintenance-2",
        actor: "Tenant service desk",
        outcome: "Leaking pipe recorded; management notified (simulated)",
      },
      {
        at: shift(anchor, -2),
        action: "maintenance.quoted",
        resourceId: "demo-maintenance-1",
        actor: "Imara Pump Services",
        outcome: "KES 18,000 quotation retained; landlord approval required",
      },
    ],
    trends: Array.from({ length: 6 }, (_, i) => ({
      month: ["April", "May", "June", "July", "August", "September"][i],
      expectedMinor: expected,
      collectedMinor:
        i === 5
          ? expected - outstanding
          : Math.round(expected * [0.77, 0.8, 0.85, 0.82, 0.87][i]),
      occupancy: Math.max(0, (profile.occupancy ?? 94) - [6, 4, 5, 2, 1, 0][i]),
      repairs: [5, 8, 6, 4, 9, 6][i],
    })),
  };
}
export function summarizeDemo(s: DemoSnapshot): DemoSummary {
  const expectedMinor = s.charges.reduce((n, c) => n + c.totalMinor, 0),
    outstandingMinor = s.charges.reduce((n, c) => n + c.balanceMinor, 0);
  const open = s.maintenance.filter(
    (m) => !["COMPLETED", "VERIFIED", "CLOSED"].includes(m.status),
  );
  const attention: DemoSummary["attention"] = [];
  const overdue = s.charges.filter(
    (c) => c.balanceMinor > 0 && c.status === "OVERDUE",
  );
  for (const c of overdue.slice(0, 5)) {
    const u = s.units.find((u) => u.id === c.unitId)!;
    attention.push({
      id: c.id,
      kind: "RENT",
      title: `${u.code} · ${u.tenant}`,
      detail: `${u.property} · overdue since ${c.dueAt.slice(0, 10)}`,
      amountMinor: c.balanceMinor,
    });
  }
  for (const m of open.filter((m) => ["CRITICAL", "HIGH"].includes(m.priority)))
    attention.push({
      id: m.id,
      kind: "MAINTENANCE",
      title: m.title,
      detail: `${m.responsible} · ${m.status.replaceAll("_", " ")}`,
      amountMinor: m.quoteMinor,
    });
  const vacant = s.units.find(
    (u) => u.status === "VACANT" && u.vacancyAction !== "Viewing assigned",
  );
  if (vacant)
    attention.push({
      id: vacant.id,
      kind: "VACANCY",
      title: `${vacant.code} vacant for ${vacant.vacantDays} days`,
      detail: vacant.property,
      amountMinor: vacant.vacancyExposureMinor ?? 0,
    });
  for (const t of s.staff.filter((t) => t.status !== "COMPLETED"))
    attention.push({
      id: t.id,
      kind: "STAFF",
      title: t.assignment,
      detail: `${t.responsible} · ${t.status}`,
    });
  for (const i of s.incidents.filter((i) => i.status !== "RESOLVED"))
    attention.unshift({
      id: i.id,
      kind: "SECURITY",
      title: "02:14 AM · simulated perimeter event",
      detail: `${i.property} · ${i.status}`,
    });
  const painKind: Record<string, string> = {
    RENT: "RENT",
    MAINTENANCE: "MAINTENANCE",
    EXPENSES: "MAINTENANCE",
    EXECUTIVE: "MAINTENANCE",
    VACANCY: "VACANCY",
    STAFF: "STAFF",
    SECURITY: "SECURITY",
  };
  attention.sort(
    (a, b) =>
      Number(b.kind === painKind[s.story]) -
      Number(a.kind === painKind[s.story]),
  );
  return {
    expectedMinor,
    collectedMinor: expectedMinor - outstandingMinor,
    outstandingMinor,
    overdueTenants: new Set(overdue.map((c) => c.tenancyId)).size,
    occupancy: Math.round(
      (s.units.filter((u) => u.status === "OCCUPIED").length / s.units.length) *
        100,
    ),
    collectionPercent: expectedMinor
      ? Math.round(
          ((expectedMinor - outstandingMinor) / expectedMinor) * 1000,
        ) / 10
      : 0,
    openMaintenance: open.length,
    approvals: open.filter((m) => m.status === "APPROVAL_REQUIRED").length,
    attention,
  };
}
export function applyDemoAction(
  before: DemoSnapshot,
  action: DemoAction,
  actor: string,
): { snapshot: DemoSnapshot; event: string; outcome: string } {
  if (before.dataset !== "SALES_DEMO")
    throw new AppError(403, "DEMO_ONLY", "Simulation requires a demo session");
  const s = structuredClone(before),
    id = action.resourceId ?? "demo-portfolio";
  s.clock = new Date(Date.parse(s.clock) + 60000).toISOString();
  let event: string = action.kind.toLowerCase();
  let outcome: string;
  const charge = () => {
    const c = s.charges.find((c) => c.id === id);
    if (!c)
      throw new AppError(
        404,
        "DEMO_RESOURCE_NOT_FOUND",
        "Select a tenancy in this demonstration",
      );
    return c;
  };
  const maintenance = () => {
    const m = s.maintenance.find((m) => m.id === id);
    if (!m)
      throw new AppError(
        404,
        "DEMO_RESOURCE_NOT_FOUND",
        "Maintenance request not found in this demonstration",
      );
    return m;
  };
  const incident = () => {
    if (s.plan !== "FORT_KNOX")
      throw new AppError(
        403,
        "FEATURE_NOT_ENTITLED",
        "Security demonstration requires Fort Knox",
      );
    const i = s.incidents.find((i) => i.id === id);
    if (!i)
      throw new AppError(404, "DEMO_RESOURCE_NOT_FOUND", "Incident not found");
    return i;
  };
  switch (action.kind) {
    case "REVEAL_ARREARS":
      event = "arrears.exposure.revealed";
      outcome = `KES ${(summarizeDemo(s).outstandingMinor / 100).toLocaleString("en-KE")} outstanding exposed with tenancy-level causes`;
      break;
    case "OPEN_TENANCY":
      charge();
      event = "overdue.tenancy.identified";
      outcome = "Ledger, payment history and previous follow-up retrieved";
      break;
    case "SIMULATE_PAYMENT": {
      const c = charge(),
        amount = action.amountMinor ?? c.balanceMinor;
      if (amount <= 0 || amount > c.balanceMinor)
        throw new AppError(
          409,
          "INVALID_ALLOCATION",
          "Payment must be positive and no greater than the outstanding balance",
        );
      c.paidMinor += amount;
      c.balanceMinor -= amount;
      c.status = c.balanceMinor === 0 ? "PAID" : c.status;
      const ref = `DEMO-RECEIPT-${s.payments.length + 1}`;
      s.payments.push({
        id: `demo-payment-${s.payments.length + 1}`,
        chargeId: c.id,
        amountMinor: amount,
        at: s.clock,
        status: "RECONCILED",
        label: "SIMULATED PAYMENT",
        receipt: ref,
      });
      c.history.push({
        at: s.clock,
        label: `SIMULATED PAYMENT · reconciled · ${ref}`,
        amountMinor: amount,
      });
      event = "payment.reconciled";
      outcome = `KES ${(amount / 100).toFixed(2)} allocated. Receipt ${ref}; balance KES ${(c.balanceMinor / 100).toFixed(2)}`;
      break;
    }
    case "RENT_DUE": {
      const u = s.units.find((u) => u.id === id && u.status === "OCCUPIED");
      if (!u)
        throw new AppError(
          404,
          "DEMO_RESOURCE_NOT_FOUND",
          "Select an occupied unit",
        );
      if (s.charges.some((c) => c.id === `demo-next-charge-${id}`))
        throw new AppError(
          409,
          "RENT_ALREADY_DUE",
          "Next rent charge already exists",
        );
      s.charges.push({
        id: `demo-next-charge-${id}`,
        unitId: id,
        tenancyId: u.tenancyId!,
        dueAt: s.clock,
        totalMinor: u.monthlyRentMinor,
        paidMinor: 0,
        balanceMinor: u.monthlyRentMinor,
        status: "DUE",
        followUp: "Rent has just become due",
        history: [],
      });
      event = "rent.became.due";
      outcome = "Expected collections and tenant ledger increased";
      break;
    }
    case "ADVANCE_OVERDUE": {
      s.clock = shift(s.clock, 7);
      for (const c of s.charges)
        if (c.balanceMinor > 0 && Date.parse(c.dueAt) < Date.parse(s.clock))
          c.status = "OVERDUE";
      for (const u of s.units)
        if (u.status === "VACANT" && u.previousTenancyEnd) {
          u.vacantDays = Math.floor(
            (Date.parse(s.clock) - Date.parse(u.previousTenancyEnd)) / 86400000,
          );
          u.vacancyExposureMinor = Math.round(
            (u.monthlyRentMinor * u.vacantDays) / 30,
          );
        }
      event = "arrears.detected";
      outcome =
        "Demonstration clock advanced seven days; due balances entered arrears";
      break;
    }
    case "FOLLOW_UP": {
      const c = charge();
      c.followUp = `Simulated statement sent at ${s.clock}`;
      s.notifications.push({
        id: `demo-notification-${s.notifications.length + 1}`,
        channel: "SIMULATED SMS",
        recipient: c.tenancyId,
        message:
          "Rent statement and structured follow-up recorded; no SMS sent",
      });
      event = "arrears.followup.recorded";
      outcome = "SIMULATED SMS retained in tenancy history";
      break;
    }
    case "REPORT_LEAK": {
      if (s.maintenance.some((m) => m.id === "demo-maintenance-new-leak"))
        throw new AppError(
          409,
          "LEAK_ALREADY_REPORTED",
          "This scenario leak has already been reported",
        );
      const m: DemoMaintenance = {
        ...s.maintenance[1],
        id: "demo-maintenance-new-leak",
        title: "Tenant reports leaking pipe",
        status: "NEW",
        quoteMinor: 850000,
        evidenceIds: [],
        serviceStatus: "Request received; tenant sees PENDING",
      };
      delete m.approvedMinor;
      delete m.finalCostMinor;
      delete m.approvedBy;
      delete m.completionApprovedBy;
      const e = evidence(
        m.id,
        "Tenant report",
        "Fictional tenant report: kitchen pipe leaking; unit and tenancy linked automatically.",
        s.clock,
      );
      m.evidenceIds = [e.id];
      s.maintenance.push(m);
      s.evidence.push(e);
      s.notifications.push({
        id: `demo-notification-${s.notifications.length + 1}`,
        channel: "SIMULATED IN-APP",
        recipient: m.responsible,
        message: "New leaking pipe request; please triage",
      });
      event = "maintenance.problem.recorded";
      outcome =
        "PENDING request created, tenant location attached, manager/caretaker notified (simulated)";
      break;
    }
    case "TRIAGE":
    case "ASSIGN":
    case "QUOTE":
    case "APPROVE_MAINTENANCE":
    case "START_WORK":
    case "COMPLETE_REPAIR":
    case "VERIFY_REPAIR":
    case "CLOSE_REPAIR": {
      const m = maintenance();
      assertMaintenanceTransition(m.status, action.kind);
      const next = {
        TRIAGE: "TRIAGED",
        ASSIGN: "ASSIGNED",
        QUOTE: "APPROVAL_REQUIRED",
        APPROVE_MAINTENANCE: "APPROVED",
        START_WORK: "IN_PROGRESS",
        COMPLETE_REPAIR: "COMPLETED",
        VERIFY_REPAIR: "VERIFIED",
        CLOSE_REPAIR: "CLOSED",
      } as const;
      m.status = next[action.kind];
      if (
        action.kind === "QUOTE" &&
        !s.evidence.some(
          (e) => e.resourceId === m.id && e.title === "Quotation",
        )
      ) {
        const e = evidence(
          m.id,
          "Quotation",
          `${m.contractor} quoted KES ${(m.quoteMinor / 100).toFixed(2)}; scope and responsible person attached.`,
          s.clock,
        );
        s.evidence.push(e);
        m.evidenceIds.push(e.id);
      }
      if (action.kind === "ASSIGN") m.assignedAt = s.clock;
      if (action.kind === "APPROVE_MAINTENANCE") {
        m.approvedMinor = m.quoteMinor;
        m.approvedBy = actor;
        event = "approval.completed";
      }
      if (action.kind === "COMPLETE_REPAIR") {
        const cost = action.amountMinor ?? m.quoteMinor;
        if (!m.approvedMinor || cost > m.approvedMinor)
          throw new AppError(
            409,
            "BUDGET_EXCEEDED",
            "Obtain approval before exceeding the approved budget",
          );
        m.finalCostMinor = cost;
        m.serviceStatus =
          "Repair completed; tenant notified (simulated), awaiting verification";
        for (const [title, content] of [
          [
            "After repair",
            "Repair finished; pressure/leak check passed in this fictional scenario.",
          ],
          [
            "Invoice and receipt",
            `Simulated expenditure KES ${(cost / 100).toFixed(2)}; ${m.contractor}; approval by ${m.approvedBy}; no money transferred.`,
          ],
        ]) {
          const e = evidence(id, title, content, s.clock);
          s.evidence.push(e);
          m.evidenceIds.push(e.id);
        }
        event = "maintenance.problem.resolved";
      }
      if (action.kind === "VERIFY_REPAIR") {
        m.completionApprovedBy = actor;
        m.serviceStatus = "Tenant/service resolution verified by management";
      }
      outcome = `${m.title}: ${m.status.replaceAll("_", " ")}. ${m.responsible}; evidence and cost history retained`;
      break;
    }
    case "REVEAL_VACANCY":
    case "VACANCY_ACTION": {
      const u = s.units.find((u) => u.id === id && u.status === "VACANT");
      if (!u)
        throw new AppError(
          404,
          "DEMO_RESOURCE_NOT_FOUND",
          "Select a vacant unit",
        );
      if (action.kind === "VACANCY_ACTION")
        u.vacancyAction = "Viewing assigned";
      event =
        action.kind === "REVEAL_VACANCY"
          ? "vacancy.exposure.identified"
          : "vacancy.action.assigned";
      outcome = `${u.code}: ${u.vacantDays} vacant days; exposure estimate KES ${((u.vacancyExposureMinor ?? 0) / 100).toFixed(2)}. ${u.vacancyAction}. Occupancy is not guaranteed.`;
      break;
    }
    case "ESCALATE_TASK":
    case "COMPLETE_TASK": {
      const t = s.staff.find((t) => t.id === id);
      if (!t)
        throw new AppError(404, "DEMO_RESOURCE_NOT_FOUND", "Task not found");
      if (t.status === "COMPLETED")
        throw new AppError(
          409,
          "INVALID_TRANSITION",
          "Task is already completed",
        );
      t.status = action.kind === "COMPLETE_TASK" ? "COMPLETED" : "ESCALATED";
      if (t.status === "COMPLETED") {
        t.evidence =
          "Simulated unit readiness inspection uploaded and verified";
        t.approvedBy = actor;
      }
      event =
        action.kind === "COMPLETE_TASK"
          ? "staff.task.completed"
          : "staff.task.escalated";
      outcome = `${t.responsible}: ${t.status}; assignment and deadline retained`;
      break;
    }
    case "SIMULATE_SECURITY": {
      if (s.plan !== "FORT_KNOX")
        throw new AppError(
          403,
          "FEATURE_NOT_ENTITLED",
          "Control supports complete operations; security simulation requires Fort Knox",
        );
      if (s.incidents.some((i) => i.status !== "RESOLVED"))
        throw new AppError(
          409,
          "INCIDENT_ALREADY_OPEN",
          "Resolve the current simulated incident first",
        );
      const iid = `demo-incident-${s.incidents.length + 1}`,
        e = evidence(
          iid,
          "Perimeter telemetry",
          "SIMULATED SECURITY EVENT: movement at Block B east gate, camera Entrance 02; fictional telemetry, no live camera.",
          shift(anchor, -1).slice(0, 10) + "T23:14:00.000Z",
        );
      s.evidence.push(e);
      s.incidents.push({
        id: iid,
        property: s.units[0].property,
        location: "Block B · east gate",
        camera: "Entrance 02 · simulated source",
        occurredAt: e.at,
        status: "OPEN",
        responsible: "Naomi · night supervisor",
        response: "SIMULATED IN-APP notification delivered to duty supervisor",
        evidenceIds: [e.id],
        source: "SIMULATED",
      });
      s.notifications.push({
        id: `demo-notification-${s.notifications.length + 1}`,
        channel: "SIMULATED IN-APP",
        recipient: "Naomi · night supervisor",
        message: "02:14 AM security event at east gate; response requested",
      });
      event = "security.incident.detected";
      outcome =
        "DEMO / SIMULATED SECURITY EVENT created with location, source and retained evidence";
      break;
    }
    case "INVESTIGATE_INCIDENT":
    case "ESCALATE_INCIDENT":
    case "RESOLVE_INCIDENT": {
      const i = incident();
      const allowed =
        action.kind === "INVESTIGATE_INCIDENT"
          ? ["OPEN"]
          : action.kind === "ESCALATE_INCIDENT"
            ? ["INVESTIGATING"]
            : ["INVESTIGATING", "ESCALATED"];
      if (!allowed.includes(i.status))
        throw new AppError(
          409,
          "INVALID_TRANSITION",
          "Incident is not ready for this response",
        );
      i.status =
        action.kind === "INVESTIGATE_INCIDENT"
          ? "INVESTIGATING"
          : action.kind === "ESCALATE_INCIDENT"
            ? "ESCALATED"
            : "RESOLVED";
      i.response =
        i.status === "RESOLVED"
          ? "Duty supervisor checked location; delivery vehicle identified; incident resolved with retained evidence"
          : `Response ${i.status.toLowerCase()} by ${i.responsible}`;
      event =
        i.status === "RESOLVED"
          ? "security.incident.resolved"
          : i.status === "ESCALATED"
            ? "security.response.escalated"
            : "security.incident.investigated";
      outcome = i.response;
      break;
    }
    case "READ_EVIDENCE": {
      const e = s.evidence.find((e) => e.id === id);
      if (!e)
        throw new AppError(
          404,
          "DEMO_RESOURCE_NOT_FOUND",
          "Evidence not found",
        );
      event = "evidence.retrieved";
      outcome = `${e.title}; SHA-256 ${e.sha256}; SIMULATED evidence retained`;
      break;
    }
    case "COMPLETE_DEMO": {
      if (
        !s.history.some((h) =>
          [
            "payment.reconciled",
            "maintenance.problem.resolved",
            "security.incident.resolved",
            "vacancy.action.assigned",
            "staff.task.completed",
          ].includes(h.action),
        )
      )
        throw new AppError(
          409,
          "VALUE_MOMENT_REQUIRED",
          "Complete a business action before finishing this demo",
        );
      event = "demo.completed";
      outcome = "Business outcome experienced; ready for guided pilot";
      break;
    }
    case "OFFER_PILOT": {
      if (!s.history.some((h) => h.action === "demo.completed"))
        throw new AppError(
          409,
          "DEMO_NOT_COMPLETED",
          "Finish a demonstrated outcome before offering the pilot",
        );
      event = "pilot.offered";
      outcome =
        "Everything shown used demonstration data. Prepare one real property next.";
      break;
    }
    default:
      throw new AppError(
        400,
        "UNKNOWN_DEMO_ACTION",
        "Unsupported demonstration action",
      );
  }
  s.history.push({
    at: s.clock,
    action: event,
    resourceId: id,
    actor,
    outcome,
  });
  if (s.history.length > 500)
    throw new AppError(
      409,
      "DEMO_HISTORY_FULL",
      "Reset this scenario to continue",
    );
  return { snapshot: s, event, outcome };
}
