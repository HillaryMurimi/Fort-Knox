"use client";

import Link from "next/link";
import { WorkspaceScene } from "@/components/workspaces/workspace-scene";
import { useState, type FormEvent } from "react";
import {
  AlertTriangle,
  ArrowUpRight,
  Bell,
  Building2,
  Check,
  CheckCircle2,
  CircleDollarSign,
  ClipboardCheck,
  FileText,
  KeyRound,
  RefreshCw,
  Shield,
  ShieldCheck,
  UserCheck,
  Users,
  Wallet,
  Wrench,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { StatusBadge,
  Alert,
  Badge,
  Button,
  Dialog,
  EmptyState,
  Input,
  Label,
  PageTitle,
  Select,
  Skeleton,
  Stat,
  TabsList,
  TabsTrigger,
  Textarea,
} from "@/components/ui";
import { useAuth } from "@/hooks/use-auth";
import { useOrganization } from "@/hooks/use-organization";
import { useCommandCenterQuery } from "@/hooks/queries/use-command-center-queries";
import {
  useMaintenanceQuery,
  useApproveMaintenanceMutation,
  useAssignMaintenanceMutation,
  useCloseMaintenanceMutation,
  useTriageMaintenanceMutation,
  useVerifyMaintenanceMutation,
} from "@/hooks/queries/use-maintenance-queries";
import {
  useArrearsQuery,
  useExpensesQuery,
  useExpenseActionMutation,
  useUpdateArrearsMutation,
} from "@/hooks/queries/use-finance-queries";
import {
  useTenanciesQuery,
  useTenantsQuery,
  useActivateTenancyMutation,
} from "@/hooks/queries/use-tenant-queries";
import { useContractorsQuery } from "@/hooks/queries/use-contractor-queries";
import {
  useNotificationsQuery,
  useNotificationReadMutation,
} from "@/hooks/queries/use-operations-queries";
import {
  useSecurityEventsQuery,
  useSecuritySummaryQuery,
  useUpdateSecurityEventMutation,
} from "@/hooks/queries/use-security-queries";
import {
  useInspectionsQuery,
  useCompleteInspectionMutation,
  useCreateInspectionMutation,
} from "@/hooks/queries/use-inspection-queries";
import { useUnitsQuery } from "@/hooks/queries/use-hierarchy-queries";
import type {
  ArrearsCase,
  Expense,
  Inspection,
  MaintenanceRequest,
  NotificationRecord,
  Tenancy,
  Unit,
} from "@/lib/data/resource-types";
import {
  maintenanceManagerAction,
  managerAttentionCounts,
  occupancyRate,
  type ManagerQueue,
} from "./manager-workspace-model";

type MaintenanceAction = NonNullable<
  ReturnType<typeof maintenanceManagerAction>
>;

export function ManagerWorkspace() {
  const { user } = useAuth();
  const { activeOrganizationId: org, activeOrganization } = useOrganization();
  const command = useCommandCenterQuery(org);
  const maintenance = useMaintenanceQuery(org);
  const expenses = useExpensesQuery(org);
  const arrears = useArrearsQuery(org);
  const tenancies = useTenanciesQuery(org);
  const tenants = useTenantsQuery(org);
  const contractors = useContractorsQuery(org);
  const notifications = useNotificationsQuery(org, { limit: 30 });
  const security = useSecuritySummaryQuery(org);
  const events = useSecurityEventsQuery(org, { limit: 8 });
  const inspections = useInspectionsQuery(org);
  const units = useUnitsQuery(org);
  const activate = useActivateTenancyMutation(org);
  const eventUpdate = useUpdateSecurityEventMutation(org);
  const [queue, setQueue] = useState<ManagerQueue>("ALL");
  const [maintenanceAction, setMaintenanceAction] = useState<{
    job: MaintenanceRequest;
    action: MaintenanceAction;
  } | null>(null);
  const [expenseAction, setExpenseAction] = useState<Expense | null>(null);
  const [arrearsAction, setArrearsAction] = useState<ArrearsCase | null>(null);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [inspectionAction, setInspectionAction] = useState<
    Inspection | "CREATE" | null
  >(null);
  const [success, setSuccess] = useState<string | null>(null);

  const maintenanceItems = (maintenance.data ?? []).filter((item) =>
    maintenanceManagerAction(item.status),
  );
  const expenseItems = (expenses.data ?? []).filter(
    (item) => item.status === "SUBMITTED",
  );
  const arrearsItems = (arrears.data ?? []).filter(
    (item) => !["RESOLVED", "WRITTEN_OFF"].includes(item.status),
  );
  const tenancyItems = (tenancies.data ?? []).filter((item) =>
    ["DRAFT", "PENDING"].includes(item.status),
  );
  const counts = managerAttentionCounts({
    maintenance: maintenance.data ?? [],
    expenses: expenses.data ?? [],
    arrears: arrears.data ?? [],
    tenancies: tenancies.data ?? [],
  });
  const portfolio = command.data?.portfolio;
  const unread = (notifications.data ?? []).filter(
    (item) => item.status !== "READ",
  ).length;
  const activeContractors = (contractors.data ?? []).filter(
    (item) => item.status === "ACTIVE",
  );
  const allQueries = [
    command,
    maintenance,
    expenses,
    arrears,
    tenancies,
    tenants,
    contractors,
    notifications,
    security,
    events,
    inspections,
    units,
  ];
  const primaryError = allQueries.find((query) => query.isError)?.error;

  async function refresh() {
    await Promise.all(allQueries.map((query) => query.refetch()));
  }
  async function activateTenancy(item: Tenancy) {
    try {
      await activate.mutateAsync(item._id);
      setSuccess(`Tenancy ${item.leaseNumber} is active.`);
    } catch {
      /* Rendered below. */
    }
  }
  async function acknowledgeEvent(id: string) {
    try {
      await eventUpdate.mutateAsync({ id, input: { status: "ACKNOWLEDGED" } });
      setSuccess("Security event acknowledged.");
    } catch {
      /* Rendered below. */
    }
  }

  if (!org)
    return (
      <EmptyState
        icon={Building2}
        title="No organization selected"
        description="Select an assigned organization to open the manager workspace."
      />
    );

  return (
    <div className="space-y-6 pb-10">
      <PageTitle
        eyebrow="Assigned portfolio"
        title={`Welcome, ${user?.firstName ?? "Manager"}`}
        description={`${activeOrganization?.name ?? "Property operations"} / live operational scope`}
        action={
          <>
            <Button variant="outline" onClick={() => void refresh()}>
              <RefreshCw size={15} /> Refresh
            </Button>
            <Button
              variant="outline"
              onClick={() => setNotificationsOpen(true)}
            >
              <Bell size={15} /> Updates{" "}
              {unread > 0 && <Badge tone="red">{unread}</Badge>}
            </Button>
          </>
        }
      />
      <WorkspaceScene role="manager" />
      {success && (
        <Alert tone="success" title="Action completed">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>{success}</span>
            <Button variant="ghost" size="sm" onClick={() => setSuccess(null)}>
              Dismiss
            </Button>
          </div>
        </Alert>
      )}
      {(primaryError || activate.error || eventUpdate.error) && (
        <Alert
          tone="destructive"
          title="Some manager data could not be updated"
        >
          {primaryError instanceof Error
            ? primaryError.message
            : (activate.error?.message ?? eventUpdate.error?.message)}
        </Alert>
      )}

      <section id="portfolio" className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Stat
          label="Portfolio health"
          value={portfolio ? `${portfolio.healthScore}/100` : "--"}
          sub={portfolio ? titleCase(portfolio.grade) : "Loading live score"}
          icon={ShieldCheck}
        />
        <Stat
          label="Occupancy"
          value={`${portfolio ? occupancyRate(portfolio.units, portfolio.occupiedUnits) : 0}%`}
          sub={
            portfolio
              ? `${portfolio.occupiedUnits} of ${portfolio.units} units occupied`
              : "Loading units"
          }
          icon={Building2}
        />
        <Stat
          label="Collection rate"
          value={`${portfolio?.collectionRate?.toFixed(1) ?? "0.0"}%`}
          sub={
            portfolio
              ? `${money(portfolio.outstandingRent)} outstanding`
              : "Loading collections"
          }
          icon={Wallet}
        />
        <Stat
          label="Needs attention"
          value={String(counts.total)}
          sub="Approvals and follow-up"
          icon={ClipboardCheck}
        />
      </section>

      <section
        id="approvals"
        className="overflow-hidden border-y border-border bg-card sm:rounded-md sm:border"
      >
        <div className="flex flex-col gap-3 border-b border-border p-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-sm font-semibold">Manager attention queue</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Authorized decisions waiting across your assigned portfolio.
            </p>
          </div>
          <TabsList>
            {(
              [
                ["ALL", `All ${counts.total}`],
                ["MAINTENANCE", `Maintenance ${counts.maintenance}`],
                ["FINANCE", `Finance ${counts.finance}`],
                ["TENANCIES", `Tenancies ${counts.tenancies}`],
              ] as const
            ).map(([value, label]) => (
              <TabsTrigger
                key={value}
                active={queue === value}
                onClick={() => setQueue(value)}
              >
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        {maintenance.isLoading ||
        expenses.isLoading ||
        arrears.isLoading ||
        tenancies.isLoading ? (
          <RowsSkeleton />
        ) : counts.total === 0 ? (
          <EmptyState
            className="m-5"
            icon={CheckCircle2}
            title="Queue is clear"
            description="There are no scoped approvals or follow-up actions waiting."
          />
        ) : (
          <div className="divide-y divide-border">
            {(queue === "ALL" || queue === "MAINTENANCE") &&
              maintenanceItems.map((job) => {
                const action = maintenanceManagerAction(job.status);
                return (
                  action && (
                    <QueueRow
                      key={job._id}
                      icon={Wrench}
                      title={job.title}
                      meta={`${titleCase(job.priority)} / ${titleCase(job.status)} / #${shortId(job._id)}`}
                      badge={actionLabel(action)}
                      tone={
                        job.priority === "EMERGENCY"
                          ? "red"
                          : job.status === "APPROVAL_REQUIRED"
                            ? "orange"
                            : "blue"
                      }
                      onAction={() => setMaintenanceAction({ job, action })}
                    />
                  )
                );
              })}
            {(queue === "ALL" || queue === "FINANCE") &&
              expenseItems.map((item) => (
                <QueueRow
                  key={item._id}
                  icon={CircleDollarSign}
                  title={item.description}
                  meta={`${titleCase(item.category)} / ${money(item.amount)} / ${item.vendorName ?? "No vendor"}`}
                  badge="Review expense"
                  tone="orange"
                  onAction={() => setExpenseAction(item)}
                />
              ))}
            {(queue === "ALL" || queue === "FINANCE") &&
              arrearsItems
                .slice(0, 8)
                .map((item) => (
                  <QueueRow
                    key={item._id}
                    icon={AlertTriangle}
                    title={`${money(item.amountOutstanding)} outstanding`}
                    meta={`${titleCase(item.status)} / Tenant #${shortId(item.tenantId)}`}
                    badge="Follow up"
                    tone={item.status === "ESCALATED" ? "red" : "orange"}
                    onAction={() => setArrearsAction(item)}
                  />
                ))}
            {(queue === "ALL" || queue === "TENANCIES") &&
              tenancyItems.map((item) => (
                <QueueRow
                  key={item._id}
                  icon={KeyRound}
                  title={item.leaseNumber}
                  meta={`${titleCase(item.status)} / Tenant #${shortId(item.tenantId)} / Unit #${shortId(item.unitId)}`}
                  badge="Activate"
                  tone="blue"
                  busy={activate.isPending && activate.variables === item._id}
                  onAction={() => void activateTenancy(item)}
                />
              ))}
          </div>
        )}
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.35fr_.85fr]">
        <section className="border-y border-border bg-card p-4 sm:rounded-md sm:border sm:p-5">
          <SectionTitle
            title="Property health"
            description="Performance across the properties currently in your scope."
            action={
              <Link
                href="/properties"
                className="text-xs font-semibold text-primary hover:underline"
              >
                Open portfolio
              </Link>
            }
          />
          {command.isLoading ? (
            <RowsSkeleton />
          ) : command.data?.properties.length ? (
            <div className="divide-y divide-border">
              {command.data.properties.map((item) => (
                <Link
                  key={item.property._id}
                  href={`/properties/${item.property._id}`}
                  className="grid gap-3 py-4 transition hover:bg-muted/40 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-2"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-semibold">
                        {item.property.name}
                      </h3>
                      <StatusBadge status={item.health.grade} domain="monitoring">
                        {titleCase(item.health.grade)}
                      </StatusBadge>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className={`h-full ${item.health.score >= 80 ? "bg-[var(--status-success-text)]" : item.health.score >= 65 ? "bg-[var(--status-attention-text)]" : "bg-[var(--status-blocked-text)]"}`}
                        style={{
                          width: `${Math.max(0, Math.min(100, item.health.score))}%`,
                        }}
                      />
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span>
                        {item.metrics.occupiedUnits}/{item.metrics.units}{" "}
                        occupied
                      </span>
                      <span>{item.metrics.maintenanceOpen} maintenance</span>
                      <span>
                        {money(item.metrics.outstandingRent)} outstanding
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xl font-semibold">
                      {item.health.score}
                    </span>
                    <ArrowUpRight size={15} className="text-muted-foreground" />
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <CompactEmpty icon={Building2} title="No scoped properties" />
          )}
        </section>

        <section
          id="contractors"
          className="border-y border-border bg-card p-4 sm:rounded-md sm:border sm:p-5"
        >
          <SectionTitle
            title="Contractor capacity"
            description={`${activeContractors.length} active contractor${activeContractors.length === 1 ? "" : "s"} available.`}
            action={
              <Link
                href="/maintenance"
                className="text-xs font-semibold text-primary hover:underline"
              >
                Manage
              </Link>
            }
          />
          {contractors.isLoading ? (
            <RowsSkeleton />
          ) : activeContractors.length ? (
            <div className="divide-y divide-border">
              {activeContractors.slice(0, 5).map((item) => (
                <div key={item._id} className="flex items-center gap-3 py-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-muted">
                    <Users size={16} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">
                      {item.name}
                    </div>
                    <div className="mt-0.5 truncate text-xs text-muted-foreground">
                      {item.trade}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold">
                      {item.rating.toFixed(1)}
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      rating
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <CompactEmpty icon={Users} title="No active contractors" />
          )}
        </section>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <section
          id="security"
          className="border-y border-border bg-card p-4 sm:rounded-md sm:border sm:p-5"
        >
          <SectionTitle
            title="Security exceptions"
            description={`${security.data?.totalOpenEvents ?? 0} open events / ${security.data?.offlineCameras ?? 0} cameras offline`}
            action={
              <Link
                href="/security"
                className="text-xs font-semibold text-primary hover:underline"
              >
                Security center
              </Link>
            }
          />
          {events.isLoading ? (
            <RowsSkeleton />
          ) : (events.data ?? []).filter(
              (item) => !["RESOLVED", "DISMISSED"].includes(item.status),
            ).length ? (
            <div className="divide-y divide-border">
              {(events.data ?? [])
                .filter(
                  (item) => !["RESOLVED", "DISMISSED"].includes(item.status),
                )
                .slice(0, 5)
                .map((item) => (
                  <div
                    key={item._id}
                    className="flex flex-wrap items-center gap-3 py-3"
                  >
                    <Shield
                      size={16}
                      className={
                        item.severity === "CRITICAL" || item.severity === "HIGH"
                          ? "text-[#b42318]"
                          : "text-muted-foreground"
                      }
                    />
                    <div className="min-w-[180px] flex-1">
                      <div className="text-sm font-semibold">
                        {titleCase(item.type)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        <StatusBadge status={item.severity} domain="predictive" /> /{" "}
                        {formatDate(item.detectedAt)}
                      </div>
                    </div>
                    <StatusBadge status={item.status} domain="alert">
                      {titleCase(item.status)}
                    </StatusBadge>
                    {item.status === "OPEN" && (
                      <Button
                        variant="outline"
                        size="sm"
                        loading={
                          eventUpdate.isPending &&
                          eventUpdate.variables?.id === item._id
                        }
                        onClick={() => void acknowledgeEvent(item._id)}
                      >
                        <Check size={14} /> Acknowledge
                      </Button>
                    )}
                  </div>
                ))}
            </div>
          ) : (
            <CompactEmpty
              icon={ShieldCheck}
              title="No open security exceptions"
            />
          )}
        </section>

        <section
          id="team"
          className="border-y border-border bg-card p-4 sm:rounded-md sm:border sm:p-5"
        >
          <SectionTitle
            title="Operations directory"
            description="Fast paths into the manager's scoped modules."
          />
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {(
              [
                ["/properties", "Properties", Building2],
                ["/tenants", "Tenants", Users],
                ["/maintenance", "Maintenance", Wrench],
                ["/finance", "Finance", Wallet],
                ["/documents", "Documents", FileText],
                ["/security", "Security", Shield],
              ] as Array<[string, string, LucideIcon]>
            ).map(([href, label, Icon]) => (
              <Link
                key={href}
                href={href}
                className="flex min-h-24 flex-col justify-between rounded-md border border-border p-3 transition hover:border-[var(--border-strong)] hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Icon size={18} />
                <span className="text-sm font-semibold">{label}</span>
              </Link>
            ))}
          </div>
          <div className="mt-4 rounded-md border border-border bg-muted p-4">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <UserCheck size={16} /> Tenant operations
            </div>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {
                (tenants.data ?? []).filter((item) => item.status === "ACTIVE")
                  .length
              }{" "}
              active tenant profiles and{" "}
              {
                (tenancies.data ?? []).filter(
                  (item) => item.status === "ACTIVE",
                ).length
              }{" "}
              active tenancies in scope.
            </p>
          </div>
        </section>
      </div>

      <section
        id="inspections"
        className="overflow-hidden border-y border-border bg-card sm:rounded-md sm:border"
      >
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border p-4 sm:p-5">
          <div>
            <h2 className="text-sm font-semibold">Inspection register</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Create scoped unit inspections and record an auditable completion
              result.
            </p>
          </div>
          <Button size="sm" onClick={() => setInspectionAction("CREATE")}>
            <ClipboardCheck size={15} /> New inspection
          </Button>
        </div>
        {inspections.isLoading ? (
          <RowsSkeleton />
        ) : inspections.data?.length ? (
          <div className="divide-y divide-border">
            {inspections.data.slice(0, 8).map((item) => (
              <div
                key={item._id}
                className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:px-5"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-md border border-border bg-muted">
                  <ClipboardCheck size={17} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold">
                    {titleCase(item.type)} inspection
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    Unit #{shortId(item.unitId)} / {formatDate(item.createdAt)}
                  </div>
                </div>
                <StatusBadge status={item.status} domain="general">
                  {titleCase(item.status)}
                </StatusBadge>
                {["DRAFT", "IN_PROGRESS"].includes(item.status) && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setInspectionAction(item)}
                  >
                    Complete <ArrowUpRight size={14} />
                  </Button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            className="m-5"
            icon={ClipboardCheck}
            title="No inspections recorded"
            description="Create the first routine, safety, move-in, move-out, maintenance, or inventory inspection."
          />
        )}
      </section>

      <MaintenanceActionDialog
        value={maintenanceAction}
        contractors={activeContractors}
        organizationId={org}
        onClose={() => setMaintenanceAction(null)}
        onDone={(message) => {
          setMaintenanceAction(null);
          setSuccess(message);
        }}
      />
      <ExpenseReviewDialog
        expense={expenseAction}
        organizationId={org}
        onClose={() => setExpenseAction(null)}
        onDone={(message) => {
          setExpenseAction(null);
          setSuccess(message);
        }}
      />
      <ArrearsDialog
        arrears={arrearsAction}
        organizationId={org}
        onClose={() => setArrearsAction(null)}
        onDone={(message) => {
          setArrearsAction(null);
          setSuccess(message);
        }}
      />
      <InspectionDialog
        value={inspectionAction}
        units={units.data ?? []}
        organizationId={org}
        onClose={() => setInspectionAction(null)}
        onDone={(message) => {
          setInspectionAction(null);
          setSuccess(message);
        }}
      />
      <NotificationsDialog
        open={notificationsOpen}
        onOpenChange={setNotificationsOpen}
        organizationId={org}
        notifications={notifications.data ?? []}
      />
    </div>
  );
}

function MaintenanceActionDialog({
  value,
  contractors,
  organizationId,
  onClose,
  onDone,
}: {
  value: { job: MaintenanceRequest; action: MaintenanceAction } | null;
  contractors: Array<{ _id: string; name: string; trade: string }>;
  organizationId: string;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const triage = useTriageMaintenanceMutation(organizationId);
  const assign = useAssignMaintenanceMutation(organizationId);
  const approve = useApproveMaintenanceMutation(organizationId);
  const verify = useVerifyMaintenanceMutation(organizationId);
  const close = useCloseMaintenanceMutation(organizationId);
  const mutation =
    value?.action === "TRIAGE"
      ? triage
      : value?.action === "ASSIGN"
        ? assign
        : value?.action === "APPROVE"
          ? approve
          : value?.action === "VERIFY"
            ? verify
            : close;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!value) return;
    const data = new FormData(event.currentTarget);
    try {
      if (value.action === "TRIAGE")
        await triage.mutateAsync({
          id: value.job._id,
          input: {
            priority: data.get("priority") as MaintenanceRequest["priority"],
            notes: String(data.get("notes") ?? ""),
          },
        });
      else if (value.action === "ASSIGN")
        await assign.mutateAsync({
          id: value.job._id,
          input: { contractorId: String(data.get("contractorId")) },
        });
      else if (value.action === "APPROVE")
        await approve.mutateAsync({
          id: value.job._id,
          input: {
            approvedAmount: Number(data.get("amount")),
            notes: String(data.get("notes") ?? ""),
          },
        });
      else if (value.action === "VERIFY")
        await verify.mutateAsync({
          id: value.job._id,
          input: { notes: String(data.get("notes") ?? "") },
        });
      else
        await close.mutateAsync({
          id: value.job._id,
          notes: String(data.get("notes") ?? ""),
        });
      onDone(
        `${value.job.title}: ${actionLabel(value.action).toLowerCase()} completed.`,
      );
    } catch {
      /* Rendered below. */
    }
  }
  return (
    <Dialog
      open={Boolean(value)}
      onOpenChange={(open) => !open && onClose()}
      title={value ? actionLabel(value.action) : "Maintenance action"}
      description={
        value ? `${value.job.title} / ${titleCase(value.job.status)}` : ""
      }
      className="max-w-lg"
    >
      <form onSubmit={(event) => void submit(event)} className="space-y-4">
        {value?.action === "TRIAGE" && (
          <div>
            <Label htmlFor="manager-priority">Priority</Label>
            <Select
              id="manager-priority"
              name="priority"
              defaultValue={value.job.priority}
            >
              {["LOW", "MEDIUM", "HIGH", "EMERGENCY"].map((item) => (
                <option key={item}>{item}</option>
              ))}
            </Select>
          </div>
        )}
        {value?.action === "ASSIGN" && (
          <div>
            <Label htmlFor="manager-contractor">Active contractor</Label>
            <Select
              id="manager-contractor"
              name="contractorId"
              required
              defaultValue=""
            >
              <option value="" disabled>
                Select contractor
              </option>
              {contractors.map((item) => (
                <option key={item._id} value={item._id}>
                  {item.name} / {item.trade}
                </option>
              ))}
            </Select>
          </div>
        )}
        {value?.action === "APPROVE" && (
          <div>
            <Label htmlFor="manager-approved-amount">
              Approved amount (KES)
            </Label>
            <Input
              id="manager-approved-amount"
              name="amount"
              type="number"
              min="0"
              step="1"
              required
              defaultValue={value.job.quoteAmount ?? ""}
            />
          </div>
        )}
        {value?.action !== "ASSIGN" && (
          <div>
            <Label htmlFor="manager-action-notes">Decision note</Label>
            <Textarea
              id="manager-action-notes"
              name="notes"
              required
              minLength={3}
              maxLength={5000}
              placeholder="Record the reason, inspection result, or instruction."
            />
          </div>
        )}
        {value?.action === "APPROVE" && (
          <Alert tone="warning" title="Financial approval">
            This authorizes the contractor to proceed within the approved
            amount.
          </Alert>
        )}
        {value?.action === "VERIFY" && (
          <Alert title="Independent verification">
            Confirm the repair and submitted evidence before verifying
            completion.
          </Alert>
        )}
        {mutation.error && (
          <Alert tone="destructive">{mutation.error.message}</Alert>
        )}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={mutation.isPending}>
            <Check size={15} /> Confirm
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function ExpenseReviewDialog({
  expense,
  organizationId,
  onClose,
  onDone,
}: {
  expense: Expense | null;
  organizationId: string;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const mutation = useExpenseActionMutation(organizationId);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!expense) return;
    const data = new FormData(event.currentTarget);
    const action = String(data.get("decision")) as "approve" | "reject";
    try {
      await mutation.mutateAsync({
        id: expense._id,
        action,
        notes: String(data.get("notes")),
      });
      onDone(`Expense ${action === "approve" ? "approved" : "rejected"}.`);
    } catch {
      /* Rendered below. */
    }
  }
  return (
    <Dialog
      open={Boolean(expense)}
      onOpenChange={(open) => !open && onClose()}
      title="Review expense"
      description={
        expense ? `${expense.description} / ${money(expense.amount)}` : ""
      }
      className="max-w-lg"
    >
      <form onSubmit={(event) => void submit(event)} className="space-y-4">
        <div>
          <Label htmlFor="expense-decision">Decision</Label>
          <Select id="expense-decision" name="decision" defaultValue="approve">
            <option value="approve">Approve expense</option>
            <option value="reject">Reject expense</option>
          </Select>
        </div>
        <div>
          <Label htmlFor="expense-note">Review note</Label>
          <Textarea
            id="expense-note"
            name="notes"
            required
            minLength={3}
            maxLength={5000}
            placeholder="Record the supporting reason for this decision."
          />
        </div>
        <Alert title="Audit trail">
          The decision and authenticated manager are retained in the financial
          workflow.
        </Alert>
        {mutation.error && (
          <Alert tone="destructive">{mutation.error.message}</Alert>
        )}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={mutation.isPending}>
            Submit decision
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function ArrearsDialog({
  arrears,
  organizationId,
  onClose,
  onDone,
}: {
  arrears: ArrearsCase | null;
  organizationId: string;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const mutation = useUpdateArrearsMutation(organizationId);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!arrears) return;
    const data = new FormData(event.currentTarget);
    const status = data.get("status") as
      "CONTACTED" | "PROMISED" | "ESCALATED" | "RESOLVED";
    const promiseDate = String(data.get("promiseDate") ?? "");
    try {
      await mutation.mutateAsync({
        id: arrears._id,
        input: {
          status,
          ...(promiseDate ? { promiseDate } : {}),
          notes: String(data.get("notes")),
        },
      });
      onDone(`Arrears case updated to ${titleCase(status)}.`);
    } catch {
      /* Rendered below. */
    }
  }
  return (
    <Dialog
      open={Boolean(arrears)}
      onOpenChange={(open) => !open && onClose()}
      title="Arrears follow-up"
      description={
        arrears ? `${money(arrears.amountOutstanding)} outstanding` : ""
      }
      className="max-w-lg"
    >
      <form onSubmit={(event) => void submit(event)} className="space-y-4">
        <div>
          <Label htmlFor="arrears-status">Follow-up outcome</Label>
          <Select id="arrears-status" name="status" defaultValue="CONTACTED">
            <option value="CONTACTED">Tenant contacted</option>
            <option value="PROMISED">Payment promised</option>
            <option value="ESCALATED">Escalate case</option>
            <option value="RESOLVED">Resolve case</option>
          </Select>
        </div>
        <div>
          <Label htmlFor="promise-date">
            Promise date{" "}
            <span className="font-normal text-muted-foreground">
              (when applicable)
            </span>
          </Label>
          <Input id="promise-date" name="promiseDate" type="date" />
        </div>
        <div>
          <Label htmlFor="arrears-note">Case note</Label>
          <Textarea
            id="arrears-note"
            name="notes"
            required
            minLength={3}
            maxLength={5000}
            placeholder="Record the contact outcome or escalation reason."
          />
        </div>
        {mutation.error && (
          <Alert tone="destructive">{mutation.error.message}</Alert>
        )}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={mutation.isPending}>
            Update case
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function InspectionDialog({
  value,
  units,
  organizationId,
  onClose,
  onDone,
}: {
  value: Inspection | "CREATE" | null;
  units: Unit[];
  organizationId: string;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const create = useCreateInspectionMutation(organizationId);
  const complete = useCompleteInspectionMutation(organizationId);
  const isCreate = value === "CREATE";
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!value) return;
    const data = new FormData(event.currentTarget);
    try {
      if (isCreate)
        await create.mutateAsync({
          unitId: String(data.get("unitId")),
          type: data.get("type") as Inspection["type"],
          notes: String(data.get("notes")),
          checklist: [],
          meterReadings: [],
          evidenceIds: [],
        });
      else
        await complete.mutateAsync({
          id: value._id,
          input: {
            overallCondition: data.get(
              "condition",
            ) as Inspection["overallCondition"],
            notes: String(data.get("notes")),
            evidenceIds: [],
          },
        });
      onDone(
        isCreate
          ? "Inspection created in draft."
          : "Inspection completed and recorded.",
      );
    } catch {
      /* Rendered below. */
    }
  }
  const mutation = isCreate ? create : complete;
  return (
    <Dialog
      open={Boolean(value)}
      onOpenChange={(open) => !open && onClose()}
      title={isCreate ? "New unit inspection" : "Complete inspection"}
      description={
        typeof value === "object" && value
          ? `${titleCase(value.type)} / Unit #${shortId(value.unitId)}`
          : "Start an auditable inspection in your assigned portfolio."
      }
      className="max-w-lg"
    >
      <form onSubmit={(event) => void submit(event)} className="space-y-4">
        {isCreate ? (
          <>
            <div>
              <Label htmlFor="inspection-unit">Unit</Label>
              <Select
                id="inspection-unit"
                name="unitId"
                required
                defaultValue=""
              >
                <option value="" disabled>
                  Select scoped unit
                </option>
                {units.map((item) => (
                  <option key={item._id} value={item._id}>
                    {item.name} / {item.code}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="inspection-type">Inspection type</Label>
              <Select id="inspection-type" name="type" defaultValue="ROUTINE">
                {[
                  "ROUTINE",
                  "SAFETY",
                  "MOVE_IN",
                  "MOVE_OUT",
                  "MAINTENANCE",
                  "INVENTORY",
                ].map((item) => (
                  <option key={item} value={item}>
                    {titleCase(item)}
                  </option>
                ))}
              </Select>
            </div>
          </>
        ) : (
          <div>
            <Label htmlFor="inspection-condition">Overall condition</Label>
            <Select
              id="inspection-condition"
              name="condition"
              defaultValue="GOOD"
            >
              {["EXCELLENT", "GOOD", "FAIR", "POOR", "DAMAGED"].map((item) => (
                <option key={item} value={item}>
                  {titleCase(item)}
                </option>
              ))}
            </Select>
          </div>
        )}
        <div>
          <Label htmlFor="inspection-notes">Inspection notes</Label>
          <Textarea
            id="inspection-notes"
            name="notes"
            required
            minLength={5}
            maxLength={10000}
            placeholder="Record observed condition, defects, readings, and required follow-up."
          />
        </div>
        <Alert title="Inspection record">
          The backend binds this record to the selected unit and your
          authenticated identity.
        </Alert>
        {mutation.error && (
          <Alert tone="destructive">{mutation.error.message}</Alert>
        )}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={mutation.isPending}>
            {isCreate ? "Create inspection" : "Complete inspection"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function NotificationsDialog({
  open,
  onOpenChange,
  organizationId,
  notifications,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  notifications: NotificationRecord[];
}) {
  const read = useNotificationReadMutation(organizationId);
  const unread = notifications.filter((item) => item.status !== "READ");
  async function markAll() {
    for (const item of unread) await read.mutateAsync(item._id);
  }
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Manager updates"
      description={`${unread.length} unread update${unread.length === 1 ? "" : "s"}.`}
      className="max-w-2xl"
    >
      <div className="mb-4 flex justify-end">
        <Button
          variant="outline"
          size="sm"
          disabled={!unread.length}
          loading={read.isPending}
          onClick={() => void markAll()}
        >
          <Check size={14} /> Mark all read
        </Button>
      </div>
      {read.error && (
        <Alert tone="destructive" className="mb-3">
          {read.error.message}
        </Alert>
      )}
      <div className="max-h-[56vh] divide-y divide-border overflow-y-auto border-y border-border">
        {notifications.length ? (
          notifications.map((item) => (
            <div key={item._id} className="flex gap-3 py-4">
              <div
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${item.status !== "READ" ? "bg-[#eff8ff] text-[#175cd3]" : "bg-muted text-muted-foreground"}`}
              >
                <Bell size={16} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold">{item.title}</div>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  {item.body}
                </p>
                <div className="mt-1 text-xs text-muted-foreground">
                  {formatDate(item.createdAt ?? item.sentAt)}
                </div>
              </div>
              {item.status !== "READ" && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  aria-label={`Mark ${item.title} read`}
                  onClick={() => read.mutate(item._id)}
                >
                  <Check size={14} />
                </Button>
              )}
            </div>
          ))
        ) : (
          <CompactEmpty icon={Bell} title="No manager updates" />
        )}
      </div>
      <div className="mt-5 flex justify-end">
        <Button variant="outline" onClick={() => onOpenChange(false)}>
          Close
        </Button>
      </div>
    </Dialog>
  );
}

function QueueRow({
  icon: Icon,
  title,
  meta,
  badge,
  tone,
  onAction,
  busy = false,
}: {
  icon: typeof Wrench;
  title: string;
  meta: string;
  badge: string;
  tone: "neutral" | "green" | "orange" | "red" | "blue";
  onAction: () => void;
  busy?: boolean;
}) {
  return (
    <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:px-5">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-border bg-muted">
        <Icon size={17} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold">{title}</div>
        <div className="mt-1 truncate text-xs text-muted-foreground">
          {meta}
        </div>
      </div>
      <Badge tone={tone}>{badge}</Badge>
      <Button variant="outline" size="sm" loading={busy} onClick={onAction}>
        Review <ArrowUpRight size={14} />
      </Button>
    </div>
  );
}
function SectionTitle({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="text-sm font-semibold">{title}</h2>
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      </div>
      {action}
    </div>
  );
}
function CompactEmpty({
  icon: Icon,
  title,
}: {
  icon: typeof Bell;
  title: string;
}) {
  return (
    <div className="flex min-h-32 flex-col items-center justify-center py-8 text-center">
      <Icon size={20} className="text-muted-foreground" />
      <div className="mt-3 text-sm font-semibold">{title}</div>
    </div>
  );
}
function RowsSkeleton() {
  return (
    <div className="space-y-4 p-5">
      {Array.from({ length: 3 }, (_, index) => (
        <div key={index} className="flex gap-3">
          <Skeleton className="h-10 w-10" />
          <div className="flex-1">
            <Skeleton className="h-3 w-1/3" />
            <Skeleton className="mt-2 h-3 w-2/3" />
          </div>
        </div>
      ))}
    </div>
  );
}
function actionLabel(action: MaintenanceAction) {
  return (
    {
      TRIAGE: "Triage request",
      ASSIGN: "Assign contractor",
      APPROVE: "Approve quote",
      VERIFY: "Verify completion",
      CLOSE: "Close request",
    } as const
  )[action];
}

function titleCase(value: string) {
  return value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/(^|\s)\S/g, (character) => character.toUpperCase());
}
function money(value: number) {
  return new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
    maximumFractionDigits: 0,
  }).format(value);
}
function shortId(value: string) {
  return value.length > 8 ? value.slice(-8).toUpperCase() : value.toUpperCase();
}
function formatDate(value?: string) {
  if (!value) return "Not recorded";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Not recorded"
    : new Intl.DateTimeFormat("en-KE", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }).format(date);
}
