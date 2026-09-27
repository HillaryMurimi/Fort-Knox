export const portfolio = {
  organization: "Acacia Property Holdings",
  properties: [
    { name: "Riverside Apartments", area: "Westlands", units: 24, occupied: 22 },
    { name: "Greenview Court", area: "Kilimani", units: 32, occupied: 29 },
    { name: "Horizon Residences", area: "Ruiru", units: 42, occupied: 38 },
    { name: "Cedar Heights", area: "Thika", units: 18, occupied: 18 },
    { name: "Ridgeway Apartments", area: "Kiambu Road", units: 28, occupied: 27 },
  ],
  expectedRent: 4_320_000,
  collectedRent: 4_011_500,
  expenses: 684_200,
  maintenanceSpend: 173_400,
  estimatedVacancyLoss: 312_000,
  healthScore: 87,
} as const;

export const portfolioTotals = {
  properties: portfolio.properties.length,
  units: portfolio.properties.reduce((sum, property) => sum + property.units, 0),
  occupied: portfolio.properties.reduce((sum, property) => sum + property.occupied, 0),
  vacant: portfolio.properties.reduce((sum, property) => sum + property.units - property.occupied, 0),
  outstanding: portfolio.expectedRent - portfolio.collectedRent,
  occupancyPercent: Math.round(portfolio.properties.reduce((sum, property) => sum + property.occupied, 0) / portfolio.properties.reduce((sum, property) => sum + property.units, 0) * 1000) / 10,
  collectionPercent: Math.round(portfolio.collectedRent / portfolio.expectedRent * 1000) / 10,
};

export const personas = {
  owner: { name: "David Mwangi", title: "Managing Director" },
  manager: { name: "Sarah Wanjiku", title: "Portfolio Manager" },
  caretaker: { name: "James Kamau", title: "Riverside Apartments" },
  tenant: { name: "Jane Wambui", title: "Riverside, Block B, Unit B-12" },
  contractor: { name: "Peter Otieno", title: "Otieno Plumbing Services" },
  admin: { name: "System Administrator", title: "Platform operations" },
} as const;

export type DemoRole = keyof typeof personas;
export const roleViews: Record<DemoRole, readonly string[]> = {
  owner: ["Five-property portfolio", "Collections", "Approvals", "Security", "Reports"],
  manager: ["Assigned properties", "Tenancies", "Maintenance", "Contractors", "Scoped reports"],
  caretaker: ["Riverside Apartments", "Assigned work", "Residents", "Site inspections"],
  tenant: ["Unit B-12", "Rent and receipts", "Report maintenance", "Documents"],
  contractor: ["Assigned plumbing job", "Submit quote", "Work evidence", "Invoice"],
  admin: ["Organizations", "Entitlements", "Platform audit", "Support"],
};

export type SceneKind = "opening" | "dashboard" | "queue" | "finance" | "vacancy" | "tenant" | "context" | "caretaker" | "contractor" | "approval" | "progress" | "evidence" | "passport" | "performance" | "roles" | "security" | "motion" | "incident" | "audit" | "intelligence" | "health" | "network" | "tiers" | "closing";
export type DemoScene = { id: string; title: string; subtitle: string; narration: string; kind: SceneKind; durationMs: number; role?: DemoRole | undefined };
export type DemoScenario = { id: string; title: string; category: "sales" | "finance" | "maintenance" | "security" | "intelligence" | "access" | "overview"; scenes: readonly DemoScene[] };

const scene = (id: SceneKind, title: string, subtitle: string, narration: string, durationMs = 5500, role?: DemoRole): DemoScene => ({ id, kind: id, title, subtitle, narration, durationMs, role });

export const signatureScenes: readonly DemoScene[] = [
  scene("opening", "One portfolio. One operational picture.", "5 properties. 144 units. One place to see what matters.", "Acacia Property Holdings manages five properties and 144 homes."),
  scene("dashboard", "Everything that needs you.", "Occupancy, collections, open decisions and portfolio health resolve into one view.", "The owner sees the portfolio as one operation."),
  scene("queue", "Don't show me everything.", "Show me what needs me.", "The action queue surfaces decisions that cannot wait."),
  scene("finance", "Know exactly what's missing.", "Expected, collected and outstanding rent reconcile to the shilling.", "Four million three hundred twenty thousand shillings were expected. Three hundred eight thousand five hundred remain outstanding."),
  scene("vacancy", "Vacancy is money standing still.", "10 vacant homes represent KES 312,000 in estimated monthly rent.", "Every empty unit carries a visible opportunity cost."),
  scene("tenant", "A leak starts at home.", "Jane reports water below the kitchen sink from Unit B-12.", "Jane reports a leak from her own resident workspace.", 6000, "tenant"),
  scene("context", "Nobody asks which house.", "The request already carries the tenant, property, building and unit.", "The system knows Jane's tenancy and assigned unit."),
  scene("caretaker", "The right person sees the right job.", "James receives the Riverside request, triages it and assigns plumbing.", "The caretaker sees only his assigned property context.", 5500, "caretaker"),
  scene("contractor", "One assigned job. Nothing else.", "Peter submits a KES 27,500 quote for the leak.", "The contractor sees the assigned job, not the landlord's portfolio.", 5500, "contractor"),
  scene("approval", "An approval, not a phone call.", "KES 27,500 exceeds the KES 5,000 approval threshold.", "The owner reviews the evidence before approving the quote.", 6000, "owner"),
  scene("progress", "A repair with a beginning and an end.", "Work, evidence, invoice and independent verification follow the decision.", "The contractor works, uploads proof and submits an invoice. Staff verify completion."),
  scene("evidence", "The timeline knows.", "Every handoff leaves an accountable record.", "The operation has a durable history, not a chain of forwarded messages."),
  scene("passport", "Every unit has a memory.", "Tenancy, payments, repairs, inspections and documents stay in context.", "Unit B-12 retains its operational history."),
  scene("performance", "Stop guessing who performs.", "Compare response, completion, rework and spend by contractor.", "Contractor performance is based on recorded work."),
  scene("roles", "Everyone sees what they need.", "Nothing more.", "Each role has a different view and a backend-enforced scope."),
  scene("tiers", "Control. Then Fort Knox.", "Operations connect to security when the plan and permissions allow it.", "Fort Knox adds security and intelligence to the operational command center."),
  scene("security", "Security in property context.", "Simulated cameras show where an event belongs.", "Camera access is scoped and audited in the real product."),
  scene("motion", "03:12 AM. Motion detected.", "Greenview Court, rear entrance. An event becomes a decision.", "An overnight motion event is raised for review."),
  scene("incident", "From event to incident.", "SEC-281 moves through investigation, evidence and closure.", "A security event can become an accountable incident."),
  scene("audit", "Even watching cameras leaves a record.", "Actor, action, camera and time remain visible.", "Surveillance access itself is auditable."),
  scene("intelligence", "Signals, not another inbox.", "Patterns across maintenance, arrears and vacancies surface suggested actions.", "Intelligence turns operational history into priorities."),
  scene("health", "One number. The operation behind it.", "Property health combines collections, occupancy, maintenance and service.", "The score is backed by operational contributors."),
  scene("network", "Not ten disconnected systems.", "One operational history connects people, property, money and evidence.", "The command center connects everything that matters."),
  scene("closing", "You don't need to be everywhere.", "You just need to be connected to everything that matters.", "Property Command Center. Remote control for your bricks and mortar."),
];

const byKind = (kinds: readonly SceneKind[]) => kinds.map((kind) => signatureScenes.find((item) => item.kind === kind)!);
export const scenarios: readonly DemoScenario[] = [
  { id: "signature", title: "The Command Center", category: "sales", scenes: signatureScenes },
  { id: "rent", title: "Rent visibility", category: "finance", scenes: byKind(["opening", "finance", "queue", "closing"]) },
  { id: "vacancy", title: "Vacancy becomes money", category: "finance", scenes: byKind(["dashboard", "vacancy", "closing"]) },
  { id: "maintenance", title: "Leak to resolution", category: "maintenance", scenes: byKind(["tenant", "context", "caretaker", "contractor", "approval", "progress", "evidence", "closing"]) },
  { id: "approval", title: "Remote approval", category: "maintenance", scenes: byKind(["contractor", "approval", "progress", "closing"]) },
  { id: "security", title: "Fort Knox", category: "security", scenes: byKind(["tiers", "security", "motion", "incident", "audit", "closing"]) },
  { id: "roles", title: "Scoped access", category: "access", scenes: byKind(["roles", "caretaker", "tenant", "contractor", "closing"]) },
  { id: "passport", title: "Property passport", category: "overview", scenes: byKind(["passport", "evidence", "closing"]) },
  { id: "contractor", title: "Contractor accountability", category: "maintenance", scenes: byKind(["contractor", "performance", "evidence", "closing"]) },
  { id: "health", title: "Property health", category: "intelligence", scenes: byKind(["intelligence", "health", "closing"]) },
  { id: "intelligence", title: "Property intelligence", category: "intelligence", scenes: byKind(["queue", "intelligence", "health", "closing"]) },
  { id: "control-vs-fort-knox", title: "Control vs Fort Knox", category: "security", scenes: byKind(["dashboard", "tiers", "security", "audit", "closing"]) },
];

type CampaignSeed = { id: string; hook: string; scenarioId: string; cta: string; kinds: readonly SceneKind[] };
const campaignSeeds: readonly CampaignSeed[] = [
  { id: "last-to-know", hook: "You own the building. Why are you the last to know?", scenarioId: "signature", cta: "Stop managing through messages.", kinds: ["queue", "dashboard"] },
  { id: "caretaker-database", hook: "Your caretaker shouldn't be your database.", scenarioId: "maintenance", cta: "See the operation, not just the update.", kinds: ["caretaker", "evidence"] },
  { id: "which-house", hook: "Which house? Your system should already know.", scenarioId: "maintenance", cta: "Every request starts with context.", kinds: ["tenant", "context"] },
  { id: "repair-approval", hook: "Would you approve KES 27,500 from a message?", scenarioId: "approval", cta: "Approve with evidence.", kinds: ["contractor", "approval"] },
  { id: "vacancy-loss", hook: "10 vacant units. KES 312,000 standing still.", scenarioId: "vacancy", cta: "Know what vacancy costs.", kinds: ["vacancy", "dashboard"] },
  { id: "cctv-audit", hook: "Who watched your cameras at 3:12 AM?", scenarioId: "security", cta: "Watch the watchers.", kinds: ["motion", "audit"] },
  { id: "repair-proof", hook: "A repair happened six months ago. Can you prove it?", scenarioId: "maintenance", cta: "The timeline knows.", kinds: ["passport", "evidence"] },
  { id: "no-spreadsheets", hook: "Your properties don't need more spreadsheets.", scenarioId: "signature", cta: "They need a command center.", kinds: ["opening", "dashboard"] },
  { id: "arrears-five", hook: "Five tenants. 71% of your arrears.", scenarioId: "rent", cta: "See the concentration.", kinds: ["finance", "intelligence"] },
  { id: "caretaker-scope", hook: "Don't give your caretaker your entire business.", scenarioId: "roles", cta: "Give them exactly what they need.", kinds: ["roles", "caretaker"] },
  { id: "building-data", hook: "Your buildings produce signals. Are you using them?", scenarioId: "intelligence", cta: "Turn signals into action.", kinds: ["intelligence", "health"] },
  { id: "last-night", hook: "What happened at your property last night?", scenarioId: "security", cta: "Know, investigate, record.", kinds: ["motion", "incident"] },
  { id: "stop-chasing", hook: "Property owners shouldn't chase information.", scenarioId: "signature", cta: "Let decisions find you.", kinds: ["queue", "dashboard"] },
  { id: "has-tenant-paid", hook: "Stop asking: Has the tenant paid?", scenarioId: "rent", cta: "See the ledger.", kinds: ["finance", "queue"] },
  { id: "unit-memory", hook: "Every unit should have a memory.", scenarioId: "passport", cta: "Keep the history together.", kinds: ["passport", "evidence"] },
  { id: "verify-operation", hook: "Trust your people. Verify your operation.", scenarioId: "maintenance", cta: "Every handoff recorded.", kinds: ["progress", "evidence"] },
  { id: "scale", hook: "Managing 20 units is not managing 200.", scenarioId: "signature", cta: "Build an operation that scales.", kinds: ["opening", "network"] },
  { id: "healthy-property", hook: "What does a healthy property look like?", scenarioId: "health", cta: "See the operation behind the score.", kinds: ["intelligence", "health"] },
  { id: "different-views", hook: "Your team sees their work. You see everything.", scenarioId: "roles", cta: "One system, scoped views.", kinds: ["roles", "dashboard"] },
  { id: "connected", hook: "You don't need to be everywhere.", scenarioId: "signature", cta: "Be connected to everything that matters.", kinds: ["network", "closing"] },
];

export type SocialCampaign = { id: string; hook: string; scenarioId: string; cta: string; scenes: readonly DemoScene[]; platforms: readonly string[] };
export const socialCampaigns: readonly SocialCampaign[] = campaignSeeds.map((seed) => ({ ...seed, scenes: [scene("opening", seed.hook, "ACACIA PROPERTY HOLDINGS / FICTIONAL DEMO", seed.hook, 1800), ...byKind(seed.kinds).map((item) => ({ ...item, durationMs: 4000 })), scene("closing", seed.cta, "Property Command Center", seed.cta, 1700)], platforms: ["TikTok", "Instagram Reels", "YouTube Shorts", "LinkedIn"] }));

export const money = (amount: number) => `KES ${Math.round(amount).toLocaleString("en-KE")}`;
