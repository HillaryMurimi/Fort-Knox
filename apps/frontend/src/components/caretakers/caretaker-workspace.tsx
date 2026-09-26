"use client";

import { useRef, useState, type ChangeEvent, type FormEvent } from "react";
import {
  AlertTriangle,
  Bell,
  Building2,
  Camera,
  Check,
  CheckCircle2,
  ClipboardCheck,
  FileCheck2,
  ImagePlus,
  Package,
  Plus,
  RefreshCw,
  Shield,
  ShieldAlert,
  Trash2,
  Users,
  Video,
  Wrench,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
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
import {
  useBuildingsQuery,
  useUnitsQuery,
} from "@/hooks/queries/use-hierarchy-queries";
import {
  useTenanciesQuery,
  useTenantsQuery,
} from "@/hooks/queries/use-tenant-queries";
import { useContractorsQuery } from "@/hooks/queries/use-contractor-queries";
import {
  useAddMaintenanceEvidenceMutation,
  useAssignMaintenanceMutation,
  useCloseMaintenanceMutation,
  useCreateMaintenanceMutation,
  useMaintenanceQuery,
  useProgressMaintenanceMutation,
  useQuoteMaintenanceMutation,
  useTriageMaintenanceMutation,
  useVerifyMaintenanceMutation,
} from "@/hooks/queries/use-maintenance-queries";
import {
  useCompleteInspectionMutation,
  useCreateInspectionMutation,
  useInspectionsQuery,
} from "@/hooks/queries/use-inspection-queries";
import {
  useCreateIncidentMutation,
  useIncidentsQuery,
  useSecurityEventsQuery,
  useSecuritySummaryQuery,
  useUpdateIncidentMutation,
} from "@/hooks/queries/use-security-queries";
import {
  useNotificationReadMutation,
  useNotificationsQuery,
} from "@/hooks/queries/use-operations-queries";
import {
  useCreateInventoryMutation,
  useInventoryDueQuery,
  useInventoryQuery,
  useUpdateInventoryMutation,
} from "@/hooks/queries/use-inventory-queries";
import { validateMaintenanceMedia } from "@/components/tenants/maintenance-media";
import type {
  Contractor,
  Incident,
  Inspection,
  InventoryItem,
  MaintenanceRequest,
  NotificationRecord,
  Unit,
} from "@/lib/data/resource-types";
import {
  caretakerAttentionCounts,
  caretakerMaintenanceAction,
  incidentNextStatuses,
  type CaretakerMaintenanceAction,
} from "./caretaker-workspace-model";

type QueueTab = "ALL" | "MAINTENANCE" | "INSPECTIONS" | "INCIDENTS";

export function CaretakerWorkspace() {
  const { user } = useAuth();
  const { activeOrganizationId: org, activeOrganization } = useOrganization();
  const buildings = useBuildingsQuery(org);
  const units = useUnitsQuery(org);
  const tenants = useTenantsQuery(org);
  const tenancies = useTenanciesQuery(org);
  const maintenance = useMaintenanceQuery(org);
  const contractors = useContractorsQuery(org);
  const inspections = useInspectionsQuery(org);
  const incidents = useIncidentsQuery(org, { limit: 30 });
  const security = useSecuritySummaryQuery(org);
  const securityEvents = useSecurityEventsQuery(org, { limit: 8 });
  const notifications = useNotificationsQuery(org, { limit: 30 });
  const inventory = useInventoryQuery(org);
  const inventoryDue = useInventoryDueQuery(org);
  const [tab, setTab] = useState<QueueTab>("ALL");
  const [issueOpen, setIssueOpen] = useState(false);
  const [maintenanceAction, setMaintenanceAction] = useState<{
    job: MaintenanceRequest;
    action: CaretakerMaintenanceAction;
  } | null>(null);
  const [inspectionAction, setInspectionAction] = useState<
    Inspection | "CREATE" | null
  >(null);
  const [incidentAction, setIncidentAction] = useState<
    Incident | "CREATE" | null
  >(null);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [inventoryAction, setInventoryAction] = useState<
    InventoryItem | "CREATE" | null
  >(null);
  const [success, setSuccess] = useState<string | null>(null);
  const unread = (notifications.data ?? []).filter(
    (item) => item.status !== "READ",
  ).length;
  const counts = caretakerAttentionCounts({
    maintenance: maintenance.data ?? [],
    inspections: inspections.data ?? [],
    incidents: incidents.data ?? [],
    unreadNotifications: unread,
  });
  const maintenanceItems = (maintenance.data ?? []).filter((item) =>
    caretakerMaintenanceAction(item.status),
  );
  const inspectionItems = (inspections.data ?? []).filter((item) =>
    ["DRAFT", "IN_PROGRESS"].includes(item.status),
  );
  const incidentItems = (incidents.data ?? []).filter(
    (item) => incidentNextStatuses(item.status).length > 0,
  );
  const activeContractors = (contractors.data ?? []).filter(
    (item) => item.status === "ACTIVE",
  );
  const activeTenancies = (tenancies.data ?? []).filter(
    (item) => item.status === "ACTIVE",
  );
  const queries = [
    buildings,
    units,
    tenants,
    tenancies,
    maintenance,
    contractors,
    inspections,
    incidents,
    security,
    securityEvents,
    notifications,
    inventory,
    inventoryDue,
  ];
  const error = queries.find((query) => query.isError)?.error;

  if (!org)
    return (
      <EmptyState
        icon={Building2}
        title="Workspace unavailable"
        description="Select an assigned organization to open on-site operations."
      />
    );

  async function refresh() {
    await Promise.all(queries.map((query) => query.refetch()));
  }

  return (
    <div className="space-y-6 pb-10">
      <PageTitle
        eyebrow={activeOrganization?.name ?? "Assigned site operations"}
        title={`Good day, ${user?.firstName?.trim() || "Caretaker"}`}
        description="Handle today’s building work, inspections, resident needs, and safety handoffs."
        action={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setNotificationsOpen(true)}
            >
              <Bell size={15} /> Updates{" "}
              {unread > 0 && <Badge tone="red">{unread}</Badge>}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void refresh()}
              disabled={queries.some((query) => query.isFetching)}
            >
              <RefreshCw size={15} /> Refresh
            </Button>
            <Button size="sm" onClick={() => setIssueOpen(true)}>
              <Plus size={15} /> Report issue
            </Button>
          </div>
        }
      />

      {error && (
        <Alert
          tone="destructive"
          title="Some site information could not be loaded"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>
              {error instanceof Error
                ? error.message
                : "Retry the assigned-site data."}
            </span>
            <Button variant="outline" size="sm" onClick={() => void refresh()}>
              Retry
            </Button>
          </div>
        </Alert>
      )}
      {success && (
        <Alert tone="success" title="Site record updated">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>{success}</span>
            <Button variant="ghost" size="sm" onClick={() => setSuccess(null)}>
              Dismiss
            </Button>
          </div>
        </Alert>
      )}

      <section className="grid grid-cols-2 gap-3 xl:grid-cols-5">
        <Stat
          label="Assigned buildings"
          value={String(buildings.data?.length ?? 0)}
          sub={`${units.data?.length ?? 0} units in scope`}
          icon={Building2}
        />
        <Stat
          label="Occupied homes"
          value={String(
            (units.data ?? []).filter((item) => item.status === "OCCUPIED")
              .length,
          )}
          sub={`${activeTenancies.length} active tenancies`}
          icon={Users}
        />
        <Stat
          label="Maintenance actions"
          value={String(counts.maintenance)}
          sub={`${(maintenance.data ?? []).filter((item) => item.priority === "EMERGENCY").length} emergency`}
          icon={Wrench}
        />
        <Stat
          label="Inspections due"
          value={String(counts.inspections)}
          sub={`${inspections.data?.length ?? 0} total records`}
          icon={ClipboardCheck}
        />
        <Stat
          label="Open incidents"
          value={String(counts.incidents)}
          sub={`${security.data?.totalOpenEvents ?? 0} security signals`}
          icon={ShieldAlert}
        />
      </section>

      <section
        id="activity"
        className="overflow-hidden border-y border-border bg-card sm:rounded-md sm:border"
      >
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold">Today’s action queue</h2>
              <Badge tone={counts.total ? "orange" : "green"}>
                {counts.total ? `${counts.total} ready` : "Clear"}
              </Badge>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Only work inside your assigned building and unit scope appears
              here.
            </p>
          </div>
          <TabsList>
            {(
              [
                ["ALL", `All ${counts.total}`],
                ["MAINTENANCE", `Repairs ${counts.maintenance}`],
                ["INSPECTIONS", `Checks ${counts.inspections}`],
                ["INCIDENTS", `Incidents ${counts.incidents}`],
              ] as const
            ).map(([value, label]) => (
              <TabsTrigger
                key={value}
                active={tab === value}
                onClick={() => setTab(value)}
              >
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        {queries.some((query) => query.isLoading) ? (
          <RowsSkeleton />
        ) : counts.total === 0 ? (
          <EmptyState
            className="m-5"
            icon={CheckCircle2}
            title="Site queue is clear"
            description="New repairs, inspections, and incidents will appear here."
          />
        ) : (
          <div className="divide-y divide-border">
            {(tab === "ALL" || tab === "MAINTENANCE") &&
              maintenanceItems.map((job) => {
                const action = caretakerMaintenanceAction(job.status);
                return (
                  action && (
                    <QueueRow
                      key={job._id}
                      icon={Wrench}
                      title={job.title}
                      detail={`${unitLabel(units.data, job.unitId)} / ${titleCase(job.priority)} / ${titleCase(job.status)}`}
                      tone={
                        job.priority === "EMERGENCY"
                          ? "red"
                          : job.priority === "HIGH"
                            ? "orange"
                            : "blue"
                      }
                      action={actionLabel(action)}
                      onClick={() => setMaintenanceAction({ job, action })}
                    />
                  )
                );
              })}
            {(tab === "ALL" || tab === "INSPECTIONS") &&
              inspectionItems.map((item) => (
                <QueueRow
                  key={item._id}
                  icon={ClipboardCheck}
                  title={`${titleCase(item.type)} inspection`}
                  detail={`${unitLabel(units.data, item.unitId)} / ${titleCase(item.status)}`}
                  tone="orange"
                  action="Complete check"
                  onClick={() => setInspectionAction(item)}
                />
              ))}
            {(tab === "ALL" || tab === "INCIDENTS") &&
              incidentItems.map((item) => (
                <QueueRow
                  key={item._id}
                  icon={ShieldAlert}
                  title={item.title}
                  detail={`${item.incidentNumber} / ${titleCase(item.status)}`}
                  tone={
                    item.severity === "CRITICAL" || item.severity === "HIGH"
                      ? "red"
                      : "orange"
                  }
                  action="Update incident"
                  onClick={() => setIncidentAction(item)}
                />
              ))}
          </div>
        )}
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_.9fr]">
        <section
          id="buildings"
          className="border-y border-border bg-card p-4 sm:rounded-md sm:border sm:p-5"
        >
          <SectionTitle
            icon={Building2}
            title="Assigned buildings"
            description="Live unit condition across your building scope."
          />
          {buildings.isLoading ? (
            <RowsSkeleton />
          ) : buildings.data?.length ? (
            <div className="mt-4 divide-y divide-border">
              {buildings.data.map((building) => {
                const buildingUnits = (units.data ?? []).filter(
                  (unit) => unit.buildingId === building._id,
                );
                return (
                  <div key={building._id} className="py-4 first:pt-0 last:pb-0">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold">
                          {building.name}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {building.code} / {buildingUnits.length} units
                        </div>
                      </div>
                      <Badge
                        tone={
                          building.status === "ACTIVE" ? "green" : "neutral"
                        }
                      >
                        {titleCase(building.status)}
                      </Badge>
                    </div>
                    <div className="mt-3 grid grid-cols-4 gap-2 text-center text-xs">
                      <Mini
                        label="Occupied"
                        value={
                          buildingUnits.filter(
                            (unit) => unit.status === "OCCUPIED",
                          ).length
                        }
                      />
                      <Mini
                        label="Vacant"
                        value={
                          buildingUnits.filter(
                            (unit) => unit.status === "VACANT",
                          ).length
                        }
                      />
                      <Mini
                        label="Reserved"
                        value={
                          buildingUnits.filter(
                            (unit) => unit.status === "RESERVED",
                          ).length
                        }
                      />
                      <Mini
                        label="Repair"
                        value={
                          buildingUnits.filter(
                            (unit) => unit.status === "MAINTENANCE",
                          ).length
                        }
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <CompactEmpty icon={Building2} title="No assigned buildings" />
          )}
        </section>

        <section
          id="tenants"
          className="border-y border-border bg-card p-4 sm:rounded-md sm:border sm:p-5"
        >
          <SectionTitle
            icon={Users}
            title="Resident directory"
            description="Unit-level occupancy without unrestricted financial details."
          />
          <div className="mt-4 divide-y divide-border">
            {activeTenancies.slice(0, 8).map((tenancy) => (
              <div
                key={tenancy._id}
                className="flex items-center gap-3 py-3 first:pt-0"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-md border border-border bg-muted">
                  <Users size={16} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold">
                    {unitLabel(units.data, tenancy.unitId)}
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    Lease {tenancy.leaseNumber} / Active resident
                  </div>
                </div>
                <Badge tone="green">Occupied</Badge>
              </div>
            ))}
            {!activeTenancies.length && (
              <CompactEmpty icon={Users} title="No active residents in scope" />
            )}
          </div>
        </section>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <section
          id="security"
          className="border-y border-border bg-card p-4 sm:rounded-md sm:border sm:p-5"
        >
          <SectionTitle
            icon={Shield}
            title="Security watch"
            description={`${security.data?.totalOpenEvents ?? 0} open signals / ${security.data?.deniedAccessEvents24h ?? 0} denied entries today`}
            action={
              <Button size="sm" onClick={() => setIncidentAction("CREATE")}>
                <Plus size={14} /> Report incident
              </Button>
            }
          />
          <div className="mt-4 divide-y divide-border">
            {(securityEvents.data ?? [])
              .filter(
                (item) => !["RESOLVED", "DISMISSED"].includes(item.status),
              )
              .slice(0, 6)
              .map((item) => (
                <div
                  key={item._id}
                  className="flex items-center gap-3 py-3 first:pt-0"
                >
                  <AlertTriangle
                    size={16}
                    className={
                      item.severity === "CRITICAL" || item.severity === "HIGH"
                        ? "text-destructive"
                        : "text-muted-foreground"
                    }
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold">
                      {titleCase(item.type)}
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {item.description ?? titleCase(item.source)}
                    </div>
                  </div>
                  <Badge
                    tone={
                      item.severity === "CRITICAL" || item.severity === "HIGH"
                        ? "red"
                        : "orange"
                    }
                  >
                    {titleCase(item.severity)}
                  </Badge>
                </div>
              ))}
            {!(securityEvents.data ?? []).some(
              (item) => !["RESOLVED", "DISMISSED"].includes(item.status),
            ) && (
              <CompactEmpty icon={Shield} title="No open security signals" />
            )}
          </div>
        </section>

        <section
          id="contractors"
          className="border-y border-border bg-card p-4 sm:rounded-md sm:border sm:p-5"
        >
          <SectionTitle
            icon={Users}
            title="Contractor contacts"
            description="Active providers available for scoped assignment."
          />
          <div className="mt-4 divide-y divide-border">
            {activeContractors.slice(0, 6).map((item) => (
              <div
                key={item._id}
                className="flex items-center gap-3 py-3 first:pt-0"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-md border border-border bg-muted">
                  <Wrench size={16} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">
                    {item.name}
                  </div>
                  <div className="mt-0.5 truncate text-xs text-muted-foreground">
                    {item.trade} /{" "}
                    {item.phone ?? item.email ?? "Contact through manager"}
                  </div>
                </div>
                <Badge tone="green">{item.rating.toFixed(1)}</Badge>
              </div>
            ))}
            {!activeContractors.length && (
              <CompactEmpty icon={Users} title="No active contractors" />
            )}
          </div>
        </section>
      </div>

      <section
        id="inspections"
        className="overflow-hidden border-y border-border bg-card sm:rounded-md sm:border"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4 sm:p-5">
          <SectionTitle
            icon={ClipboardCheck}
            title="Inspection register"
            description="Create and complete auditable unit checks."
          />
          <Button size="sm" onClick={() => setInspectionAction("CREATE")}>
            <Plus size={14} /> New inspection
          </Button>
        </div>
        <div className="divide-y divide-border">
          {(inspections.data ?? []).slice(0, 8).map((item) => (
            <div
              key={item._id}
              className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:px-5"
            >
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold">
                  {titleCase(item.type)} inspection
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {unitLabel(units.data, item.unitId)} /{" "}
                  {formatDate(item.createdAt)}
                </div>
              </div>
              <Badge tone={item.status === "COMPLETED" ? "green" : "orange"}>
                {titleCase(item.status)}
              </Badge>
              {["DRAFT", "IN_PROGRESS"].includes(item.status) && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setInspectionAction(item)}
                >
                  Complete
                </Button>
              )}
            </div>
          ))}
          {!inspections.data?.length && (
            <EmptyState
              className="m-5"
              icon={ClipboardCheck}
              title="No inspections recorded"
              description="Start a routine, safety, maintenance, inventory, move-in, or move-out check."
            />
          )}
        </div>
      </section>

      <section
        id="inventory"
        className="overflow-hidden border-y border-border bg-card sm:rounded-md sm:border"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4 sm:p-5">
          <SectionTitle
            icon={Package}
            title="Site inventory"
            description={`${inventoryDue.data?.length ?? 0} assets currently due for service.`}
          />
          <Button size="sm" onClick={() => setInventoryAction("CREATE")}>
            <Plus size={14} /> Register asset
          </Button>
        </div>
        <div className="grid gap-px bg-border sm:grid-cols-2 xl:grid-cols-3">
          {(inventory.data ?? []).map((item) => (
            <button
              key={item._id}
              type="button"
              onClick={() => setInventoryAction(item)}
              className="bg-card p-4 text-left transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-md border border-border bg-muted">
                  <Package size={16} />
                </div>
                <Badge
                  tone={
                    item.status === "ACTIVE"
                      ? "green"
                      : item.status === "UNDER_REPAIR"
                        ? "orange"
                        : "red"
                  }
                >
                  {titleCase(item.status)}
                </Badge>
              </div>
              <div className="mt-3 text-sm font-semibold">{item.name}</div>
              <div className="mt-1 text-xs text-muted-foreground">
                {item.assetTag} / {unitLabel(units.data, item.unitId)}
              </div>
              <div className="mt-3 flex items-center justify-between gap-2 text-xs">
                <span>{titleCase(item.condition)}</span>
                <span
                  className={
                    inventoryDue.data?.some(
                      (dueItem) => dueItem._id === item._id,
                    )
                      ? "font-semibold text-destructive"
                      : "text-muted-foreground"
                  }
                >
                  {item.nextServiceDueAt
                    ? `Service ${formatDate(item.nextServiceDueAt)}`
                    : "No service date"}
                </span>
              </div>
            </button>
          ))}
          {!inventory.data?.length && (
            <div className="col-span-full bg-card">
              <EmptyState
                className="m-5"
                icon={Package}
                title="No site assets registered"
                description="Register pumps, meters, appliances, safety equipment, and other maintained assets."
              />
            </div>
          )}
        </div>
      </section>

      <IssueDialog
        open={issueOpen}
        onOpenChange={setIssueOpen}
        organizationId={org}
        units={units.data ?? []}
        onDone={(message) => setSuccess(message)}
      />
      <MaintenanceDialog
        value={maintenanceAction}
        organizationId={org}
        contractors={activeContractors}
        onClose={() => setMaintenanceAction(null)}
        onDone={(message) => {
          setMaintenanceAction(null);
          setSuccess(message);
        }}
      />
      <InspectionDialog
        value={inspectionAction}
        organizationId={org}
        units={units.data ?? []}
        onClose={() => setInspectionAction(null)}
        onDone={(message) => {
          setInspectionAction(null);
          setSuccess(message);
        }}
      />
      <IncidentDialog
        value={incidentAction}
        organizationId={org}
        units={units.data ?? []}
        onClose={() => setIncidentAction(null)}
        onDone={(message) => {
          setIncidentAction(null);
          setSuccess(message);
        }}
      />
      <NotificationsDialog
        open={notificationsOpen}
        onOpenChange={setNotificationsOpen}
        organizationId={org}
        notifications={notifications.data ?? []}
      />
      <InventoryDialog
        value={inventoryAction}
        organizationId={org}
        units={units.data ?? []}
        onClose={() => setInventoryAction(null)}
        onDone={(message) => {
          setInventoryAction(null);
          setSuccess(message);
        }}
      />
    </div>
  );
}

function IssueDialog({
  open,
  onOpenChange,
  organizationId,
  units,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  units: Unit[];
  onDone: (message: string) => void;
}) {
  const create = useCreateMaintenanceMutation(organizationId);
  const upload = useAddMaintenanceEvidenceMutation(organizationId);
  const [files, setFiles] = useState<File[]>([]);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [createdRequestId, setCreatedRequestId] = useState<string | null>(null);
  function closeDialog() {
    setFiles([]);
    setMediaError(null);
    setCreatedRequestId(null);
    onOpenChange(false);
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      let requestId = createdRequestId;
      if (!requestId) {
        const request = await create.mutateAsync({
          unitId: String(data.get("unitId")),
          title: String(data.get("title")),
          description: String(data.get("description")),
          category: data.get("category") as MaintenanceRequest["category"],
          priority: data.get("priority") as MaintenanceRequest["priority"],
          evidenceIds: [],
        });
        requestId = request._id;
        setCreatedRequestId(requestId);
      }
      if (files.length) await upload.mutateAsync({ id: requestId, files });
      closeDialog();
      onDone(
        files.length
          ? "Issue reported with site evidence."
          : "Issue reported to the maintenance queue.",
      );
    } catch {
      /* Rendered below. */
    }
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) =>
        nextOpen ? onOpenChange(true) : closeDialog()
      }
      title="Report a site issue"
      description="Create a scoped maintenance record from the building."
      className="max-w-2xl"
    >
      <form onSubmit={(event) => void submit(event)} className="space-y-4">
        <div>
          <Label htmlFor="caretaker-issue-unit">Unit</Label>
          <Select
            id="caretaker-issue-unit"
            name="unitId"
            required
            defaultValue=""
          >
            <option value="" disabled>
              Select unit
            </option>
            {units.map((unit) => (
              <option key={unit._id} value={unit._id}>
                {unit.code} / {unit.name}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="caretaker-issue-title">Issue</Label>
          <Input
            id="caretaker-issue-title"
            name="title"
            required
            minLength={3}
            maxLength={180}
            placeholder="e.g. Corridor light is out"
          />
        </div>
        <div>
          <Label htmlFor="caretaker-issue-description">
            What did you observe?
          </Label>
          <Textarea
            id="caretaker-issue-description"
            name="description"
            required
            minLength={3}
            maxLength={10000}
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Category</Label>
            <Select name="category" defaultValue="OTHER">
              {[
                "PLUMBING",
                "ELECTRICAL",
                "STRUCTURAL",
                "SECURITY",
                "CLEANING",
                "APPLIANCE",
                "HVAC",
                "PEST_CONTROL",
                "OTHER",
              ].map((item) => (
                <option key={item}>{item}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Priority</Label>
            <Select name="priority" defaultValue="MEDIUM">
              {["LOW", "MEDIUM", "HIGH", "EMERGENCY"].map((item) => (
                <option key={item}>{item}</option>
              ))}
            </Select>
          </div>
        </div>
        <MediaPicker
          files={files}
          onFiles={setFiles}
          error={mediaError}
          onError={setMediaError}
        />
        {(create.error || upload.error) && (
          <Alert tone="destructive">
            {create.error?.message ?? upload.error?.message}
          </Alert>
        )}
        <DialogActions
          onClose={closeDialog}
          loading={create.isPending || upload.isPending}
          label="Report issue"
        />
      </form>
    </Dialog>
  );
}

function MaintenanceDialog({
  value,
  organizationId,
  contractors,
  onClose,
  onDone,
}: {
  value: { job: MaintenanceRequest; action: CaretakerMaintenanceAction } | null;
  organizationId: string;
  contractors: Contractor[];
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const triage = useTriageMaintenanceMutation(organizationId);
  const assign = useAssignMaintenanceMutation(organizationId);
  const quote = useQuoteMaintenanceMutation(organizationId);
  const progress = useProgressMaintenanceMutation(organizationId);
  const verify = useVerifyMaintenanceMutation(organizationId);
  const close = useCloseMaintenanceMutation(organizationId);
  const upload = useAddMaintenanceEvidenceMutation(organizationId);
  const [files, setFiles] = useState<File[]>([]);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [evidenceUploadedFor, setEvidenceUploadedFor] = useState<string | null>(
    null,
  );
  function closeDialog() {
    setFiles([]);
    setMediaError(null);
    setEvidenceUploadedFor(null);
    onClose();
  }
  const mutation =
    value?.action === "TRIAGE"
      ? triage
      : value?.action === "ASSIGN"
        ? assign
        : value?.action === "QUOTE"
          ? quote
          : value?.action === "VERIFY"
            ? verify
            : value?.action === "CLOSE"
              ? close
              : progress;
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
            notes: String(data.get("notes")),
          },
        });
      else if (value.action === "ASSIGN")
        await assign.mutateAsync({
          id: value.job._id,
          input: { contractorId: String(data.get("contractorId")) },
        });
      else if (value.action === "QUOTE")
        await quote.mutateAsync({
          id: value.job._id,
          input: {
            quoteAmount: Number(data.get("amount")),
            notes: String(data.get("notes")),
            evidenceIds: [],
          },
        });
      else if (value.action === "START" || value.action === "COMPLETE") {
        if (files.length && evidenceUploadedFor !== value.job._id) {
          await upload.mutateAsync({ id: value.job._id, files });
          setEvidenceUploadedFor(value.job._id);
        }
        await progress.mutateAsync({
          id: value.job._id,
          input: {
            status: value.action === "START" ? "IN_PROGRESS" : "COMPLETED",
            ...(data.get("amount")
              ? { actualAmount: Number(data.get("amount")) }
              : {}),
            resolutionNotes: String(data.get("notes")),
            evidenceIds: [],
          },
        });
      } else if (value.action === "VERIFY")
        await verify.mutateAsync({
          id: value.job._id,
          input: { notes: String(data.get("notes")) },
        });
      else
        await close.mutateAsync({
          id: value.job._id,
          notes: String(data.get("notes")),
        });
      setFiles([]);
      setEvidenceUploadedFor(null);
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
      onOpenChange={(open) => !open && closeDialog()}
      title={value ? actionLabel(value.action) : "Maintenance action"}
      description={
        value
          ? `${value.job.title} / ${titleCase(value.job.status)}`
          : "Review site work."
      }
      className="max-w-xl"
    >
      <form onSubmit={(event) => void submit(event)} className="space-y-4">
        {value?.action === "TRIAGE" && (
          <div>
            <Label>Priority</Label>
            <Select name="priority" defaultValue={value.job.priority}>
              {["LOW", "MEDIUM", "HIGH", "EMERGENCY"].map((item) => (
                <option key={item}>{item}</option>
              ))}
            </Select>
          </div>
        )}
        {value?.action === "ASSIGN" && (
          <div>
            <Label>Active contractor</Label>
            <Select name="contractorId" required defaultValue="">
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
        {value?.action === "QUOTE" && (
          <div>
            <Label>Quoted amount (KES)</Label>
            <Input name="amount" type="number" min="0" step="1" required />
          </div>
        )}
        {value?.action === "COMPLETE" && (
          <div>
            <Label>Actual amount (KES)</Label>
            <Input
              name="amount"
              type="number"
              min="0"
              step="1"
              max={value.job.approvedAmount}
            />
          </div>
        )}
        {value?.action !== "ASSIGN" && (
          <div>
            <Label>Site note</Label>
            <Textarea
              name="notes"
              required
              minLength={3}
              maxLength={5000}
              placeholder="Record observations, instructions, or completion details."
            />
          </div>
        )}
        {(value?.action === "START" || value?.action === "COMPLETE") && (
          <MediaPicker
            files={files}
            onFiles={setFiles}
            error={mediaError}
            onError={setMediaError}
          />
        )}
        {value?.action === "QUOTE" && (
          <Alert tone="warning" title="Approval boundary">
            Quotes above policy limits remain pending until an authorized
            manager or owner approves them.
          </Alert>
        )}
        {(mutation.error || upload.error) && (
          <Alert tone="destructive">
            {mutation.error?.message ?? upload.error?.message}
          </Alert>
        )}
        <DialogActions
          onClose={closeDialog}
          loading={mutation.isPending || upload.isPending}
          label="Confirm action"
        />
      </form>
    </Dialog>
  );
}

function InspectionDialog({
  value,
  organizationId,
  units,
  onClose,
  onDone,
}: {
  value: Inspection | "CREATE" | null;
  organizationId: string;
  units: Unit[];
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const create = useCreateInspectionMutation(organizationId);
  const complete = useCompleteInspectionMutation(organizationId);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      if (value === "CREATE")
        await create.mutateAsync({
          unitId: String(data.get("unitId")),
          type: data.get("type") as Inspection["type"],
          notes: String(data.get("notes")),
          checklist: [],
          meterReadings: [],
          evidenceIds: [],
        });
      else if (value)
        await complete.mutateAsync({
          id: value._id,
          input: {
            overallCondition: data.get("condition") as NonNullable<
              Inspection["overallCondition"]
            >,
            notes: String(data.get("notes")),
            evidenceIds: value.evidenceIds,
          },
        });
      onDone(
        value === "CREATE"
          ? "Inspection created for site completion."
          : "Inspection completed and recorded.",
      );
    } catch {
      /* Rendered below. */
    }
  }
  const mutation = value === "CREATE" ? create : complete;
  return (
    <Dialog
      open={Boolean(value)}
      onOpenChange={(open) => !open && onClose()}
      title={value === "CREATE" ? "New unit inspection" : "Complete inspection"}
      description="Inspection results become part of the auditable property record."
      className="max-w-lg"
    >
      <form onSubmit={(event) => void submit(event)} className="space-y-4">
        {value === "CREATE" && (
          <>
            <div>
              <Label>Unit</Label>
              <Select name="unitId" required defaultValue="">
                <option value="" disabled>
                  Select unit
                </option>
                {units.map((unit) => (
                  <option key={unit._id} value={unit._id}>
                    {unit.code} / {unit.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Inspection type</Label>
              <Select name="type" defaultValue="ROUTINE">
                {[
                  "ROUTINE",
                  "SAFETY",
                  "MAINTENANCE",
                  "INVENTORY",
                  "MOVE_IN",
                  "MOVE_OUT",
                ].map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </Select>
            </div>
          </>
        )}
        {value !== "CREATE" && (
          <div>
            <Label>Overall condition</Label>
            <Select
              name="condition"
              required
              defaultValue={value?.overallCondition ?? "GOOD"}
            >
              {["EXCELLENT", "GOOD", "FAIR", "POOR", "DAMAGED"].map((item) => (
                <option key={item}>{item}</option>
              ))}
            </Select>
          </div>
        )}
        <div>
          <Label>Inspection notes</Label>
          <Textarea name="notes" required minLength={3} maxLength={10000} />
        </div>
        {mutation.error && (
          <Alert tone="destructive">{mutation.error.message}</Alert>
        )}
        <DialogActions
          onClose={onClose}
          loading={mutation.isPending}
          label={
            value === "CREATE" ? "Create inspection" : "Complete inspection"
          }
        />
      </form>
    </Dialog>
  );
}

function IncidentDialog({
  value,
  organizationId,
  units,
  onClose,
  onDone,
}: {
  value: Incident | "CREATE" | null;
  organizationId: string;
  units: Unit[];
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const create = useCreateIncidentMutation(organizationId);
  const update = useUpdateIncidentMutation(organizationId);
  const selectedUnit = units[0];
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      if (value === "CREATE") {
        const unit =
          units.find((item) => item._id === String(data.get("unitId"))) ??
          selectedUnit;
        if (!unit) throw new Error("No assigned unit is available.");
        await create.mutateAsync({
          propertyId: unit.propertyId,
          buildingId: unit.buildingId,
          floorId: unit.floorId,
          unitId: unit._id,
          title: String(data.get("title")),
          description: String(data.get("notes")),
          category: data.get("category") as Incident["category"],
          severity: data.get("severity") as Incident["severity"],
          reportedAt: new Date().toISOString(),
          sourceEventIds: [],
          evidenceIds: [],
          documentIds: [],
        });
      } else if (value)
        await update.mutateAsync({
          id: value._id,
          input: {
            status: data.get("status") as Exclude<Incident["status"], "OPEN">,
            notes: String(data.get("notes")),
          },
        });
      onDone(
        value === "CREATE"
          ? "Incident reported for response."
          : "Incident status updated.",
      );
    } catch {
      /* Rendered below. */
    }
  }
  const mutation = value === "CREATE" ? create : update;
  return (
    <Dialog
      open={Boolean(value)}
      onOpenChange={(open) => !open && onClose()}
      title={
        value === "CREATE"
          ? "Report safety or security incident"
          : "Update incident"
      }
      description={
        value !== "CREATE" && value
          ? `${value.incidentNumber} / ${value.title}`
          : "Create an auditable incident in your assigned scope."
      }
      className="max-w-lg"
    >
      <form onSubmit={(event) => void submit(event)} className="space-y-4">
        {value === "CREATE" ? (
          <>
            <div>
              <Label>Location</Label>
              <Select name="unitId" required defaultValue="">
                <option value="" disabled>
                  Select unit or nearest location
                </option>
                {units.map((unit) => (
                  <option key={unit._id} value={unit._id}>
                    {unit.code} / {unit.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Incident title</Label>
              <Input name="title" required minLength={3} maxLength={180} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Category</Label>
                <Select name="category" defaultValue="SAFETY">
                  {[
                    "SECURITY",
                    "THEFT",
                    "TRESPASS",
                    "VANDALISM",
                    "FIRE",
                    "SAFETY",
                    "ASSAULT",
                    "ACCESS_CONTROL",
                    "OTHER",
                  ].map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>Severity</Label>
                <Select name="severity" defaultValue="MEDIUM">
                  {["LOW", "MEDIUM", "HIGH", "CRITICAL"].map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </Select>
              </div>
            </div>
          </>
        ) : (
          value && (
            <div>
              <Label>Next status</Label>
              <Select name="status" required>
                {incidentNextStatuses(value.status).map((status) => (
                  <option key={status}>{status}</option>
                ))}
              </Select>
            </div>
          )
        )}
        <div>
          <Label>
            {value === "CREATE" ? "What happened?" : "Response note"}
          </Label>
          <Textarea name="notes" required minLength={3} maxLength={10000} />
        </div>
        {value === "CREATE" && (
          <Alert tone="warning" title="Emergency response">
            For immediate danger, contact emergency services first, then record
            the incident here.
          </Alert>
        )}
        {mutation.error && (
          <Alert tone="destructive">{mutation.error.message}</Alert>
        )}
        <DialogActions
          onClose={onClose}
          loading={mutation.isPending}
          label={value === "CREATE" ? "Report incident" : "Update incident"}
        />
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
      title="Site updates"
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
      <div className="max-h-[56vh] divide-y divide-border overflow-y-auto border-y border-border">
        {notifications.map((item) => (
          <div key={item._id} className="flex gap-3 py-4">
            <Bell size={16} className="mt-1 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold">{item.title}</div>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                {item.body}
              </p>
            </div>
            {item.status !== "READ" && (
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Mark ${item.title} read`}
                onClick={() => read.mutate(item._id)}
              >
                <Check size={14} />
              </Button>
            )}
          </div>
        ))}
        {!notifications.length && (
          <div className="py-10 text-center text-sm text-muted-foreground">
            No site updates.
          </div>
        )}
      </div>
    </Dialog>
  );
}

function InventoryDialog({
  value,
  organizationId,
  units,
  onClose,
  onDone,
}: {
  value: InventoryItem | "CREATE" | null;
  organizationId: string;
  units: Unit[];
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const create = useCreateInventoryMutation(organizationId);
  const update = useUpdateInventoryMutation(organizationId);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      if (value === "CREATE")
        await create.mutateAsync({
          unitId: String(data.get("unitId")),
          assetTag: String(data.get("assetTag")),
          name: String(data.get("name")),
          category: String(data.get("category")),
          condition: data.get("condition") as Exclude<
            InventoryItem["condition"],
            "DISPOSED"
          >,
          ...(data.get("serialNumber")
            ? { serialNumber: String(data.get("serialNumber")) }
            : {}),
          ...(data.get("interval")
            ? { maintenanceIntervalDays: Number(data.get("interval")) }
            : {}),
          notes: String(data.get("notes")),
          evidenceIds: [],
        });
      else if (value)
        await update.mutateAsync({
          id: value._id,
          input: {
            status: data.get("status") as InventoryItem["status"],
            condition: data.get("condition") as InventoryItem["condition"],
            ...(data.get("serviced")
              ? {
                  lastServicedAt: new Date(
                    String(data.get("serviced")),
                  ).toISOString(),
                }
              : {}),
            notes: String(data.get("notes")),
          },
        });
      onDone(
        value === "CREATE"
          ? "Site asset registered."
          : "Asset condition and service record updated.",
      );
    } catch {
      /* Rendered below. */
    }
  }
  const mutation = value === "CREATE" ? create : update;
  return (
    <Dialog
      open={Boolean(value)}
      onOpenChange={(open) => !open && onClose()}
      title={value === "CREATE" ? "Register site asset" : "Update site asset"}
      description={
        value !== "CREATE" && value
          ? `${value.assetTag} / ${value.name}`
          : "Track maintainable equipment inside an assigned unit."
      }
      className="max-w-lg"
    >
      <form onSubmit={(event) => void submit(event)} className="space-y-4">
        {value === "CREATE" ? (
          <>
            <div>
              <Label>Unit</Label>
              <Select name="unitId" required defaultValue="">
                <option value="" disabled>
                  Select unit
                </option>
                {units.map((unit) => (
                  <option key={unit._id} value={unit._id}>
                    {unit.code} / {unit.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Asset tag</Label>
                <Input
                  name="assetTag"
                  required
                  maxLength={80}
                  placeholder="PUMP-001"
                />
              </div>
              <div>
                <Label>Category</Label>
                <Input
                  name="category"
                  required
                  minLength={2}
                  maxLength={100}
                  placeholder="Water system"
                />
              </div>
            </div>
            <div>
              <Label>Asset name</Label>
              <Input name="name" required minLength={2} maxLength={180} />
            </div>
            <div>
              <Label>Serial number</Label>
              <Input name="serialNumber" maxLength={160} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Condition</Label>
                <Select name="condition" defaultValue="GOOD">
                  {["NEW", "GOOD", "FAIR", "POOR", "DAMAGED"].map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>Service interval (days)</Label>
                <Input name="interval" type="number" min="1" />
              </div>
            </div>
          </>
        ) : (
          value && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Status</Label>
                  <Select name="status" defaultValue={value.status}>
                    {["ACTIVE", "MISSING", "UNDER_REPAIR", "DISPOSED"].map(
                      (item) => (
                        <option key={item}>{item}</option>
                      ),
                    )}
                  </Select>
                </div>
                <div>
                  <Label>Condition</Label>
                  <Select name="condition" defaultValue={value.condition}>
                    {["NEW", "GOOD", "FAIR", "POOR", "DAMAGED", "DISPOSED"].map(
                      (item) => (
                        <option key={item}>{item}</option>
                      ),
                    )}
                  </Select>
                </div>
              </div>
              <div>
                <Label>Last serviced</Label>
                <Input
                  name="serviced"
                  type="date"
                  defaultValue={value.lastServicedAt?.slice(0, 10)}
                />
              </div>
            </>
          )
        )}
        <div>
          <Label>Asset notes</Label>
          <Textarea
            name="notes"
            maxLength={5000}
            defaultValue={value !== "CREATE" && value ? value.notes : ""}
          />
        </div>
        {mutation.error && (
          <Alert tone="destructive">{mutation.error.message}</Alert>
        )}
        <DialogActions
          onClose={onClose}
          loading={mutation.isPending}
          label={value === "CREATE" ? "Register asset" : "Save asset"}
        />
      </form>
    </Dialog>
  );
}

function MediaPicker({
  files,
  onFiles,
  error,
  onError,
}: {
  files: File[];
  onFiles: (files: File[]) => void;
  error: string | null;
  onError: (value: string | null) => void;
}) {
  const photo = useRef<HTMLInputElement>(null);
  const video = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);
  function add(event: ChangeEvent<HTMLInputElement>) {
    const incoming = Array.from(event.target.files ?? []);
    event.target.value = "";
    const validation = validateMaintenanceMedia(incoming, files.length);
    if (validation) {
      onError(validation);
      return;
    }
    onError(null);
    onFiles([...files, ...incoming]);
  }
  return (
    <fieldset>
      <legend className="field-label">
        Photo or video evidence{" "}
        <span className="font-normal text-muted-foreground">(up to 5)</span>
      </legend>
      <input
        ref={photo}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        onChange={add}
      />
      <input
        ref={video}
        type="file"
        accept="video/*"
        capture="environment"
        className="sr-only"
        onChange={add}
      />
      <input
        ref={gallery}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif,video/mp4,video/webm,video/quicktime"
        multiple
        className="sr-only"
        onChange={add}
      />
      <div className="grid grid-cols-3 gap-2">
        <MediaButton
          icon={Camera}
          label="Photo"
          onClick={() => photo.current?.click()}
        />
        <MediaButton
          icon={Video}
          label="Video"
          onClick={() => video.current?.click()}
        />
        <MediaButton
          icon={ImagePlus}
          label="Files"
          onClick={() => gallery.current?.click()}
        />
      </div>
      {files.length > 0 && (
        <div className="mt-3 divide-y divide-border rounded-md border border-border">
          {files.map((file, index) => (
            <div
              key={`${file.name}-${file.lastModified}-${index}`}
              className="flex items-center gap-3 p-3"
            >
              <FileCheck2 size={16} />
              <div className="min-w-0 flex-1 truncate text-sm">{file.name}</div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Remove ${file.name}`}
                onClick={() =>
                  onFiles(files.filter((_, itemIndex) => itemIndex !== index))
                }
              >
                <Trash2 size={14} />
              </Button>
            </div>
          ))}
        </div>
      )}
      {error && (
        <Alert tone="destructive" className="mt-3">
          {error}
        </Alert>
      )}
    </fieldset>
  );
}
function MediaButton({
  icon: Icon,
  label,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      className="h-16 flex-col gap-1"
      onClick={onClick}
    >
      <Icon size={16} />
      <span className="text-xs">{label}</span>
    </Button>
  );
}
function DialogActions({
  onClose,
  loading,
  label,
}: {
  onClose: () => void;
  loading: boolean;
  label: string;
}) {
  return (
    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <Button type="button" variant="outline" onClick={onClose}>
        Cancel
      </Button>
      <Button type="submit" loading={loading}>
        <Check size={15} /> {label}
      </Button>
    </div>
  );
}
function QueueRow({
  icon: Icon,
  title,
  detail,
  tone,
  action,
  onClick,
}: {
  icon: LucideIcon;
  title: string;
  detail: string;
  tone: "red" | "orange" | "blue";
  action: string;
  onClick: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:px-5">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-border bg-muted">
        <Icon size={17} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold">{title}</div>
        <div className="mt-1 truncate text-xs text-muted-foreground">
          {detail}
        </div>
      </div>
      <Badge tone={tone}>Action</Badge>
      <Button variant="outline" size="sm" onClick={onClick}>
        {action}
      </Button>
    </div>
  );
}
function SectionTitle({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Icon size={16} /> {title}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      </div>
      {action}
    </div>
  );
}
function Mini({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md bg-muted p-2">
      <div className="font-semibold">{value}</div>
      <div className="mt-0.5 text-[10px] text-muted-foreground">{label}</div>
    </div>
  );
}
function CompactEmpty({
  icon: Icon,
  title,
}: {
  icon: LucideIcon;
  title: string;
}) {
  return (
    <div className="flex min-h-32 flex-col items-center justify-center text-center text-muted-foreground">
      <Icon size={20} />
      <div className="mt-2 text-sm">{title}</div>
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
function actionLabel(action: CaretakerMaintenanceAction) {
  return (
    {
      TRIAGE: "Triage",
      ASSIGN: "Assign contractor",
      QUOTE: "Record quote",
      START: "Start work",
      COMPLETE: "Complete work",
      VERIFY: "Verify repair",
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
function unitLabel(units: Unit[] | undefined, id: string) {
  const unit = units?.find((item) => item._id === id);
  return unit ? `${unit.code} / ${unit.name}` : `Unit ${id.slice(-6)}`;
}
function formatDate(value?: string) {
  return value
    ? new Intl.DateTimeFormat("en-KE", {
        day: "numeric",
        month: "short",
        year: "numeric",
      }).format(new Date(value))
    : "Date pending";
}
