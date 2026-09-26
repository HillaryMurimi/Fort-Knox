"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import {
  Bell,
  Check,
  CircleDollarSign,
  CreditCard,
  Settings2,
  ShieldCheck,
  Wrench,
} from "lucide-react";
import {
  Alert,
  Badge,
  Button,
  Dialog,
  Input,
  Label,
  Select,
  Skeleton,
  TabsList,
  TabsTrigger,
  Textarea,
} from "@/components/ui";
import { PaymentDestinations } from "@/components/payments/payment-destinations";
import {
  useMaintenanceQuery,
  useApproveMaintenanceMutation,
  useCloseMaintenanceMutation,
  useVerifyMaintenanceMutation,
} from "@/hooks/queries/use-maintenance-queries";
import {
  useExpensesQuery,
  useExpenseActionMutation,
} from "@/hooks/queries/use-finance-queries";
import {
  useNotificationsQuery,
  useNotificationReadMutation,
} from "@/hooks/queries/use-operations-queries";
import {
  useBillingSubscriptionQuery,
  useBillingEntitlementsQuery,
} from "@/hooks/queries/use-billing-queries";
import { useUpdateOrganizationMutation } from "@/hooks/queries/use-organization-queries";
import type {
  Expense,
  MaintenanceRequest,
  NotificationRecord,
} from "@/lib/data/resource-types";
import type { Organization } from "@/types/organization";
import {
  landlordApprovalCounts,
  landlordMaintenanceAction,
} from "./landlord-workspace-model";

type ApprovalTab = "ALL" | "MAINTENANCE" | "EXPENSES";
type OwnerMaintenanceAction = NonNullable<
  ReturnType<typeof landlordMaintenanceAction>
>;

export function LandlordControlPanel({
  organizationId,
  organization,
  refreshOrganization,
}: {
  organizationId: string;
  organization: Organization | null;
  refreshOrganization: () => Promise<void>;
}) {
  const maintenance = useMaintenanceQuery(organizationId);
  const expenses = useExpensesQuery(organizationId);
  const notifications = useNotificationsQuery(organizationId, { limit: 30 });
  const subscription = useBillingSubscriptionQuery(organizationId);
  const entitlements = useBillingEntitlementsQuery(organizationId);
  const [tab, setTab] = useState<ApprovalTab>("ALL");
  const [maintenanceAction, setMaintenanceAction] = useState<{
    job: MaintenanceRequest;
    action: OwnerMaintenanceAction;
  } | null>(null);
  const [expenseAction, setExpenseAction] = useState<Expense | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const maintenanceItems = (maintenance.data ?? []).filter((item) =>
    landlordMaintenanceAction(item.status),
  );
  const expenseItems = (expenses.data ?? []).filter(
    (item) => item.status === "SUBMITTED",
  );
  const counts = landlordApprovalCounts(
    maintenance.data ?? [],
    expenses.data ?? [],
  );
  const unread = (notifications.data ?? []).filter(
    (item) => item.status !== "READ",
  ).length;

  return (
    <section id="owner-controls" className="space-y-6">
      <div className="flex flex-col gap-4 border-y border-border bg-card p-4 sm:rounded-md sm:border sm:p-5 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold">Owner controls</h2>
            <Badge tone={counts.total ? "orange" : "green"}>
              {counts.total ? `${counts.total} pending` : "Up to date"}
            </Badge>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Portfolio decisions, money routing, subscription, and resident
            contact settings.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setNotificationsOpen(true)}
          >
            <Bell size={14} /> Updates{" "}
            {unread > 0 && <Badge tone="red">{unread}</Badge>}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSettingsOpen(true)}
          >
            <Settings2 size={14} /> Resident contacts
          </Button>
          <Link href="/billing" className="btn-secondary">
            <CreditCard size={14} /> Billing
          </Link>
        </div>
      </div>
      {success && (
        <Alert tone="success" title="Owner action completed">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>{success}</span>
            <Button variant="ghost" size="sm" onClick={() => setSuccess(null)}>
              Dismiss
            </Button>
          </div>
        </Alert>
      )}

      <div className="grid gap-6 xl:grid-cols-[1.3fr_.7fr]">
        <div className="overflow-hidden border-y border-border bg-card sm:rounded-md sm:border">
          <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-sm font-semibold">Owner approval queue</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Financial and completion decisions requiring owner authority.
              </p>
            </div>
            <TabsList>
              {(
                [
                  ["ALL", `All ${counts.total}`],
                  ["MAINTENANCE", `Maintenance ${counts.maintenance}`],
                  ["EXPENSES", `Expenses ${counts.expenses}`],
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
          {maintenance.isLoading || expenses.isLoading ? (
            <ApprovalSkeleton />
          ) : counts.total === 0 ? (
            <div className="flex min-h-40 flex-col items-center justify-center p-6 text-center">
              <ShieldCheck size={20} className="text-muted-foreground" />
              <div className="mt-3 text-sm font-semibold">
                No owner approvals waiting
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                New approvals will appear here after scoped operational review.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {(tab === "ALL" || tab === "MAINTENANCE") &&
                maintenanceItems.map((job) => {
                  const action = landlordMaintenanceAction(job.status);
                  return (
                    action && (
                      <ApprovalRow
                        key={job._id}
                        icon={Wrench}
                        title={job.title}
                        detail={`${titleCase(job.status)} / ${job.quoteAmount != null ? money(job.quoteAmount) : "No quote amount"}`}
                        label={actionLabel(action)}
                        onClick={() => setMaintenanceAction({ job, action })}
                      />
                    )
                  );
                })}
              {(tab === "ALL" || tab === "EXPENSES") &&
                expenseItems.map((expense) => (
                  <ApprovalRow
                    key={expense._id}
                    icon={CircleDollarSign}
                    title={expense.description}
                    detail={`${expense.vendorName ?? "No vendor"} / ${money(expense.amount)}`}
                    label="Review expense"
                    onClick={() => setExpenseAction(expense)}
                  />
                ))}
            </div>
          )}
        </div>

        <div className="border-y border-border bg-card p-4 sm:rounded-md sm:border sm:p-5">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <CreditCard size={16} /> Subscription posture
          </div>
          {subscription.isLoading || entitlements.isLoading ? (
            <div className="mt-5">
              <Skeleton className="h-20 w-full" />
            </div>
          ) : (
            <>
              <div className="mt-5 flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs text-muted-foreground">
                    Current status
                  </div>
                  <div className="mt-1 text-lg font-semibold">
                    {subscription.data?.status
                      ? titleCase(subscription.data.status)
                      : "Not subscribed"}
                  </div>
                </div>
                <Badge
                  tone={
                    subscription.data?.status === "ACTIVE" ? "green" : "orange"
                  }
                >
                  {entitlements.data?.plan?.name ?? "No active plan"}
                </Badge>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
                <div className="rounded-md bg-muted p-3">
                  <div className="text-muted-foreground">Properties limit</div>
                  <div className="mt-1 font-semibold">
                    {entitlements.data?.plan?.entitlements.maxProperties ??
                      "--"}
                  </div>
                </div>
                <div className="rounded-md bg-muted p-3">
                  <div className="text-muted-foreground">Units limit</div>
                  <div className="mt-1 font-semibold">
                    {entitlements.data?.plan?.entitlements.maxUnits ?? "--"}
                  </div>
                </div>
              </div>
              <Link href="/billing" className="btn-secondary mt-4 w-full">
                Manage subscription
              </Link>
            </>
          )}
        </div>
      </div>

      <PaymentDestinations organizationId={organizationId} />
      <OwnerMaintenanceDialog
        value={maintenanceAction}
        organizationId={organizationId}
        onClose={() => setMaintenanceAction(null)}
        onDone={(message) => {
          setMaintenanceAction(null);
          setSuccess(message);
        }}
      />
      <OwnerExpenseDialog
        expense={expenseAction}
        organizationId={organizationId}
        onClose={() => setExpenseAction(null)}
        onDone={(message) => {
          setExpenseAction(null);
          setSuccess(message);
        }}
      />
      <OrganizationSettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        organizationId={organizationId}
        organization={organization}
        refreshOrganization={refreshOrganization}
        onDone={(message) => setSuccess(message)}
      />
      <OwnerNotificationsDialog
        open={notificationsOpen}
        onOpenChange={setNotificationsOpen}
        organizationId={organizationId}
        notifications={notifications.data ?? []}
      />
    </section>
  );
}

function OwnerMaintenanceDialog({
  value,
  organizationId,
  onClose,
  onDone,
}: {
  value: { job: MaintenanceRequest; action: OwnerMaintenanceAction } | null;
  organizationId: string;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const approve = useApproveMaintenanceMutation(organizationId);
  const verify = useVerifyMaintenanceMutation(organizationId);
  const close = useCloseMaintenanceMutation(organizationId);
  const mutation =
    value?.action === "APPROVE"
      ? approve
      : value?.action === "VERIFY"
        ? verify
        : close;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!value) return;
    const data = new FormData(event.currentTarget);
    try {
      if (value.action === "APPROVE")
        await approve.mutateAsync({
          id: value.job._id,
          input: {
            approvedAmount: Number(data.get("amount")),
            notes: String(data.get("notes")),
          },
        });
      else if (value.action === "VERIFY")
        await verify.mutateAsync({
          id: value.job._id,
          input: { notes: String(data.get("notes")) },
        });
      else
        await close.mutateAsync({
          id: value.job._id,
          notes: String(data.get("notes")),
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
      title={value ? actionLabel(value.action) : "Owner decision"}
      description={value?.job.title ?? "Review this maintenance decision."}
      className="max-w-lg"
    >
      <form onSubmit={(event) => void submit(event)} className="space-y-4">
        {value?.action === "APPROVE" && (
          <div>
            <Label htmlFor="owner-approved-amount">Approved amount (KES)</Label>
            <Input
              id="owner-approved-amount"
              name="amount"
              type="number"
              min="0"
              required
              defaultValue={value.job.quoteAmount ?? ""}
            />
          </div>
        )}
        <div>
          <Label htmlFor="owner-decision-note">Decision note</Label>
          <Textarea
            id="owner-decision-note"
            name="notes"
            required
            minLength={3}
            maxLength={5000}
            placeholder="Record the reason or verification result."
          />
        </div>
        {value?.action === "APPROVE" && (
          <Alert tone="warning" title="Financial authority">
            Approval authorizes work up to the recorded amount.
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
            <Check size={15} /> Confirm decision
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function OwnerExpenseDialog({
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
    const action = data.get("decision") as "approve" | "reject";
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
      title="Owner expense review"
      description={
        expense ? `${expense.description} / ${money(expense.amount)}` : ""
      }
      className="max-w-lg"
    >
      <form onSubmit={(event) => void submit(event)} className="space-y-4">
        <div>
          <Label htmlFor="owner-expense-decision">Decision</Label>
          <Select id="owner-expense-decision" name="decision">
            <option value="approve">Approve expense</option>
            <option value="reject">Reject expense</option>
          </Select>
        </div>
        <div>
          <Label htmlFor="owner-expense-note">Review note</Label>
          <Textarea
            id="owner-expense-note"
            name="notes"
            required
            minLength={3}
            maxLength={5000}
          />
        </div>
        {mutation.error && (
          <Alert tone="destructive">{mutation.error.message}</Alert>
        )}
        <div className="flex justify-end gap-2">
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

function OrganizationSettingsDialog({
  open,
  onOpenChange,
  organizationId,
  organization,
  refreshOrganization,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  organization: Organization | null;
  refreshOrganization: () => Promise<void>;
  onDone: (message: string) => void;
}) {
  const update = useUpdateOrganizationMutation(organizationId);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      await update.mutateAsync({
        settings: {
          managementPhone: String(data.get("managementPhone")),
          managementEmail: String(data.get("managementEmail")),
          emergencyPhone: String(data.get("emergencyPhone")),
          officeHours: String(data.get("officeHours")),
        },
      });
      await refreshOrganization();
      onOpenChange(false);
      onDone("Resident contact settings updated.");
    } catch {
      /* Rendered below. */
    }
  }
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Resident contact settings"
      description="These details appear in the tenant workspace for management and emergency contact."
      className="max-w-lg"
    >
      <form onSubmit={(event) => void submit(event)} className="space-y-4">
        <div>
          <Label htmlFor="management-phone">Management phone</Label>
          <Input
            id="management-phone"
            name="managementPhone"
            type="tel"
            required
            minLength={7}
            defaultValue={organization?.settings?.managementPhone ?? ""}
          />
        </div>
        <div>
          <Label htmlFor="management-email">Management email</Label>
          <Input
            id="management-email"
            name="managementEmail"
            type="email"
            required
            defaultValue={organization?.settings?.managementEmail ?? ""}
          />
        </div>
        <div>
          <Label htmlFor="emergency-phone">Emergency property line</Label>
          <Input
            id="emergency-phone"
            name="emergencyPhone"
            type="tel"
            required
            minLength={7}
            defaultValue={organization?.settings?.emergencyPhone ?? ""}
          />
        </div>
        <div>
          <Label htmlFor="office-hours">Office hours</Label>
          <Input
            id="office-hours"
            name="officeHours"
            required
            maxLength={160}
            defaultValue={organization?.settings?.officeHours ?? ""}
            placeholder="Mon-Fri 08:00-17:00"
          />
        </div>
        <Alert title="Resident-facing information">
          Only operational contact details belong here. Do not enter private
          credentials or personal financial data.
        </Alert>
        {update.error && (
          <Alert tone="destructive">{update.error.message}</Alert>
        )}
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button type="submit" loading={update.isPending}>
            Save contacts
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function OwnerNotificationsDialog({
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
      title="Owner updates"
      description={`${unread.length} unread portfolio update${unread.length === 1 ? "" : "s"}.`}
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
          <div className="py-10 text-center text-sm text-muted-foreground">
            No owner updates.
          </div>
        )}
      </div>
    </Dialog>
  );
}

function ApprovalRow({
  icon: Icon,
  title,
  detail,
  label,
  onClick,
}: {
  icon: typeof Wrench;
  title: string;
  detail: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-muted">
        <Icon size={16} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold">{title}</div>
        <div className="mt-1 truncate text-xs text-muted-foreground">
          {detail}
        </div>
      </div>
      <Button variant="outline" size="sm" onClick={onClick}>
        {label}
      </Button>
    </div>
  );
}
function ApprovalSkeleton() {
  return (
    <div className="space-y-4 p-5">
      {Array.from({ length: 3 }, (_, index) => (
        <div key={index} className="flex gap-3">
          <Skeleton className="h-9 w-9" />
          <div className="flex-1">
            <Skeleton className="h-3 w-1/3" />
            <Skeleton className="mt-2 h-3 w-2/3" />
          </div>
        </div>
      ))}
    </div>
  );
}
function actionLabel(action: OwnerMaintenanceAction) {
  return (
    {
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
