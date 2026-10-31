"use client";
import {
  cloneElement,
  useId,
  useState,
  type FormEvent,
  type ReactElement,
} from "react";
import Link from "next/link";
import { SalesAgentControl } from "./sales-agent-control";
import { SalesCustomerIdentity } from "./sales-customer-identity";
import { SalesCustomerHistory } from "./sales-customer-history";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Alert, Button } from "@/components/ui";
import {
  successClient as client,
  type Meeting,
} from "@/lib/data/sales-success";

const inputClass =
  "mt-1 w-full rounded-lg border border-border bg-background p-2 text-sm";
const panelClass = "rounded-2xl border border-border bg-card p-5 space-y-4";
function Field({
  label,
  children,
}: {
  label: string;
  children: ReactElement<{ id?: string }>;
}) {
  const id = useId();
  return (
    <div className="text-sm font-medium">
      <label htmlFor={id} className="block">
        {label}
      </label>
      {cloneElement(children, { id })}
    </div>
  );
}
const value = (form: FormData, key: string) =>
  String(form.get(key) ?? "").trim();
const stamp = (date: string) =>
  new Date(date).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });

export function SalesSuccessWorkspace() {
  const auth = useAuth();
  const admin = auth.roles.includes("SUPER_ADMIN");
  const can = (permission: string) =>
    !auth.isDevMode &&
    (admin || auth.memberships.some((m) => m.permissions.includes(permission)));
  const [tab, setTab] = useState("Customers");
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState("");
  const [feedback, setFeedback] = useState("");
  const [pending, setPending] = useState(false);
  const queryClient = useQueryClient();
  const accessKey = [
    auth.user?._id,
    auth.memberships.map((m) => m.permissions.join(",")).join("|"),
  ].join(":");
  const customers = useQuery({
    queryKey: ["sales-success", accessKey, "customers", page, search],
    queryFn: () => client.list(page, search),
    enabled: can("sales.leads.read"),
  });
  const detail = useQuery({
    queryKey: ["sales-success", accessKey, "customer", selected],
    queryFn: () => client.view(selected),
    enabled: !!selected && can("sales.leads.read"),
  });
  const monitor = useQuery({
    queryKey: ["sales-success", accessKey, "monitor", selected],
    queryFn: () => client.monitor(selected),
    enabled: !!selected && can("sales.onboarding.read"),
  });
  async function act(work: () => Promise<unknown>, form?: HTMLFormElement) {
    setPending(true);
    setFeedback("");
    try {
      await work();
      form?.reset();
      await queryClient.invalidateQueries({ queryKey: ["sales-success"] });
      setFeedback("Saved.");
    } catch (error) {
      setFeedback(
        error instanceof Error
          ? error.message
          : "Unable to save. Please retry.",
      );
    } finally {
      setPending(false);
    }
  }
  if (auth.isLoading) return <p role="status">Loading sales workspace…</p>;
  if (!can("sales.leads.read") && !can("sales.agents.read"))
    return (
      <Alert>
        Access requires a real SUPER_ADMIN session or explicitly delegated sales
        permissions.
      </Alert>
    );
  const data =
    can("sales.leads.read") && !detail.error ? detail.data : undefined;
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Dapinni · customer operations
          </p>
          <h1 className="mt-2 text-3xl font-semibold">
            AI Sales &amp; Customer Success
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Customer context, meeting evidence and actual onboarding progress.
          </p>
        </div>
        <Link href="/sales-intelligence" className="btn-secondary">
          Conversion analytics
        </Link>
      </header>
      <nav aria-label="Sales workspace" className="flex flex-wrap gap-2">
        {["Customers", "AI Agents", ...(admin ? ["Permissions"] : [])].map(
          (t) => (
            <Button
              key={t}
              variant={tab === t ? "default" : "outline"}
              onClick={() => setTab(t)}
              aria-pressed={tab === t}
            >
              {t}
            </Button>
          ),
        )}
      </nav>
      {feedback && (
        <div role="status">
          <Alert>{feedback}</Alert>
        </div>
      )}
      {tab === "Customers" && (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(260px,1fr)_minmax(0,2fr)]">
          <aside className="space-y-5">
            <section className={panelClass}>
              <h2 className="text-lg font-semibold">Leads &amp; prospects</h2>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  setPage(1);
                  setSearch(value(new FormData(e.currentTarget), "search"));
                }}
              >
                <Field label="Search name or reference">
                  <input name="search" maxLength={120} className={inputClass} />
                </Field>
                <Button type="submit" variant="outline" className="mt-2">
                  Search
                </Button>
              </form>
              {customers.isLoading && <p role="status">Loading customers…</p>}
              {customers.error && (
                <Alert>
                  {customers.error.message}
                  <Button
                    variant="link"
                    onClick={() => void customers.refetch()}
                  >
                    Retry
                  </Button>
                </Alert>
              )}
              <ul className="space-y-2">
                {customers.data?.items.map((c) => (
                  <li key={c._id}>
                    <button
                      type="button"
                      onClick={() => setSelected(c._id)}
                      aria-pressed={selected === c._id}
                      className={`w-full rounded-xl border p-3 text-left focus-visible:outline focus-visible:outline-2 ${selected === c._id ? "border-primary bg-primary/5" : "border-border"}`}
                    >
                      <strong className="block">{c.name}</strong>
                      <span className="text-xs text-muted-foreground">
                        {c.leadStatus} · {c.units} estimated units
                      </span>
                      <span className="mt-1 block text-xs">{c.nextAction}</span>
                    </button>
                  </li>
                ))}
              </ul>
              {customers.data?.total === 0 && (
                <p className="text-sm text-muted-foreground">
                  No matching customers. Create a lead or review existing demo
                  requests.
                </p>
              )}
              <div className="flex items-center justify-between gap-2">
                <Button
                  variant="outline"
                  disabled={page <= 1}
                  onClick={() => setPage(page - 1)}
                >
                  Previous
                </Button>
                <span className="text-xs">
                  Page {page} · {customers.data?.total ?? 0}
                </span>
                <Button
                  variant="outline"
                  disabled={
                    !customers.data || page * 20 >= customers.data.total
                  }
                  onClick={() => setPage(page + 1)}
                >
                  Next
                </Button>
              </div>
            </section>
            {can("sales.leads.create") && (
              <details className={panelClass}>
                <summary className="cursor-pointer font-semibold">
                  Create lead
                </summary>
                <form
                  className="space-y-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = e.currentTarget;
                    const d = new FormData(f);
                    void act(async () => {
                      const result = await client.create({
                        name: value(d, "name"),
                        email: value(d, "email") || undefined,
                        phone: value(d, "phone") || undefined,
                        properties: Number(value(d, "properties")),
                        units: value(d, "units"),
                        challenge: value(d, "challenge"),
                        source: value(d, "source"),
                      });
                      setSelected(result.id);
                    }, f);
                  }}
                >
                  <Field label="Customer / company">
                    <input
                      name="name"
                      required
                      minLength={2}
                      maxLength={160}
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Email">
                    <input name="email" type="email" className={inputClass} />
                  </Field>
                  <Field label="Phone (international format)">
                    <input
                      name="phone"
                      type="tel"
                      placeholder="+254…"
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Estimated properties">
                    <input
                      name="properties"
                      type="number"
                      min={1}
                      max={100000}
                      defaultValue={1}
                      required
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Estimated units">
                    <input
                      name="units"
                      required
                      maxLength={40}
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Source">
                    <input
                      name="source"
                      required
                      maxLength={120}
                      defaultValue="Manual"
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Customer needs">
                    <textarea
                      name="challenge"
                      required
                      minLength={5}
                      maxLength={5000}
                      rows={4}
                      className={inputClass}
                    />
                  </Field>
                  <Button type="submit" disabled={pending}>
                    Create customer
                  </Button>
                </form>
              </details>
            )}
          </aside>
          <main className="min-w-0 space-y-5">
            {!selected && (
              <section className={panelClass}>
                <h2 className="text-xl font-semibold">Customer 360</h2>
                <p className="text-sm text-muted-foreground">
                  Select a customer to review their history, record a meeting or
                  inspect onboarding evidence.
                </p>
              </section>
            )}
            {detail.isLoading && <p role="status">Loading customer history…</p>}
            {detail.error && (
              <Alert>
                {detail.error.message}
                <Button variant="link" onClick={() => void detail.refetch()}>
                  Retry
                </Button>
              </Alert>
            )}
            {data && (
              <>
                <section className={panelClass}>
                  <h2 className="text-2xl font-semibold">
                    {data.customer.name}
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    {data.customer.reference} · {data.customer.leadStatus} ·{" "}
                    {data.customer.consent}
                  </p>
                  <p className="whitespace-pre-wrap text-sm">
                    {data.customer.challenge}
                  </p>
                  <p className="text-sm">
                    {data.customer.email} {data.customer.phone}
                  </p>
                  <p className="text-sm">
                    Next action: {data.customer.nextAction || "Not set"}
                  </p>
                  {can("sales.leads.update") && (
                    <form
                      key={data.customer.revision}
                      className="grid gap-3 sm:grid-cols-2"
                      onSubmit={(e) => {
                        e.preventDefault();
                        const d = new FormData(e.currentTarget);
                        void act(() =>
                          client.update(selected, {
                            revision: data.customer.revision,
                            leadStatus: value(d, "leadStatus"),
                            consent: value(d, "consent"),
                            nextAction: value(d, "nextAction"),
                          }),
                        );
                      }}
                    >
                      <Field label="Qualification">
                        <select
                          name="leadStatus"
                          defaultValue={data.customer.leadStatus}
                          className={inputClass}
                        >
                          {["New", "Qualified", "Disqualified", "Nurture"].map(
                            (s) => (
                              <option key={s}>{s}</option>
                            ),
                          )}
                        </select>
                      </Field>
                      <Field label="Communication consent">
                        <select
                          name="consent"
                          defaultValue={data.customer.consent}
                          className={inputClass}
                        >
                          {["UNKNOWN", "OPTED_IN", "OPTED_OUT"].map((s) => (
                            <option key={s}>{s}</option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Next action">
                        <input
                          name="nextAction"
                          defaultValue={data.customer.nextAction}
                          maxLength={500}
                          className={inputClass}
                        />
                      </Field>
                      <div className="self-end">
                        <Button disabled={pending} type="submit">
                          Save customer
                        </Button>
                      </div>
                    </form>
                  )}
                  {admin && (
                    <details>
                      <summary className="cursor-pointer text-sm font-semibold">
                        Link organization or assign representative
                      </summary>
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        {["organizationId", "userId"].map((key) => (
                          <form
                            key={key}
                            onSubmit={(e) => {
                              e.preventDefault();
                              const d = new FormData(e.currentTarget);
                              void act(() =>
                                key === "organizationId"
                                  ? client.link(selected, {
                                      organizationId: value(d, key),
                                      revision: data.customer.revision,
                                    })
                                  : client.assign(selected, {
                                      userId: value(d, key),
                                      revision: data.customer.revision,
                                    }),
                              );
                            }}
                          >
                            <Field
                              label={
                                key === "organizationId"
                                  ? "Existing organization ID"
                                  : "Active representative user ID"
                              }
                            >
                              <input
                                name={key}
                                required
                                pattern="[a-fA-F0-9]{24}"
                                className={inputClass}
                              />
                            </Field>
                            <Button
                              type="submit"
                              variant="outline"
                              disabled={pending}
                              className="mt-2"
                            >
                              {key === "organizationId"
                                ? "Link after identity review"
                                : "Assign customer"}
                            </Button>
                          </form>
                        ))}
                      </div>
                    </details>
                  )}
                </section>
                <SalesCustomerIdentity
                  id={data.customer.id}
                  revision={data.customer.revision}
                  organizationId={data.customer.organizationId}
                />
                {can("sales.onboarding.read") && (
                  <section className={panelClass}>
                    <h2 className="text-lg font-semibold">
                      Onboarding &amp; customer health
                    </h2>
                    {monitor.isLoading && (
                      <p role="status">Reading onboarding records…</p>
                    )}
                    {monitor.error && (
                      <Alert>
                        {monitor.error.message}
                        <Button
                          variant="link"
                          onClick={() => void monitor.refetch()}
                        >
                          Retry
                        </Button>
                      </Alert>
                    )}
                    {monitor.data && !monitor.data.linked && (
                      <p className="text-sm text-muted-foreground">
                        No organization linked. SUPER_ADMIN can link an existing
                        account after verifying the customer identity.
                      </p>
                    )}
                    {!monitor.error && monitor.data?.linked && (
                      <>
                        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                          {Object.entries({
                            Plan: monitor.data.selectedPlan ?? "Not selected",
                            Contract: monitor.data.contractStatus,
                            Payment: monitor.data.verifiedPayment
                              ? "Verified"
                              : "Not verified",
                            Subscription: monitor.data.subscriptionStatus,
                            Properties: monitor.data.properties,
                            Buildings: monitor.data.buildings,
                            Floors: monitor.data.floors,
                            Units: monitor.data.registeredUnits,
                            Completion:
                              monitor.data.completionPercent == null
                                ? "Expected units unknown"
                                : `${monitor.data.completionPercent}%`,
                          }).map(([k, v]) => (
                            <div key={k}>
                              <dt className="text-xs text-muted-foreground">
                                {k}
                              </dt>
                              <dd className="mt-1 font-semibold">{v}</dd>
                            </div>
                          ))}
                        </dl>
                        {monitor.data.assistance && (
                          <Alert>{monitor.data.assistance}</Alert>
                        )}
                        <p className="text-xs text-muted-foreground">
                          Rule-based health factors · stalled after 72 hours ·
                          messages require separate authorization
                        </p>
                        <ul className="grid gap-2 text-sm sm:grid-cols-2">
                          {monitor.data.health?.factors.map((f) => (
                            <li key={f.label}>
                              {f.achieved ? "✓" : "○"} {f.label}
                            </li>
                          ))}
                        </ul>
                        <details>
                          <summary className="cursor-pointer text-sm">
                            Application events (latest 100)
                          </summary>
                          <ul className="mt-3 space-y-2 text-xs">
                            {monitor.data.events?.map((event) => (
                              <li key={event.eventId}>
                                {event.name} · {stamp(event.occurredAt)}
                              </li>
                            ))}
                          </ul>
                        </details>
                      </>
                    )}
                  </section>
                )}
                {can("sales.meetings.read") && (
                  <section className={panelClass}>
                    <h2 className="text-lg font-semibold">Meetings</h2>
                    {!data.meetings.length && (
                      <p className="text-sm text-muted-foreground">
                        No meetings recorded.
                      </p>
                    )}
                    {data.meetings.map((m) => (
                      <MeetingCard
                        key={m._id}
                        meeting={m}
                        editable={can("sales.meetings.update")}
                        pending={pending}
                        save={(body) =>
                          act(() => client.outcome(selected, m._id, body))
                        }
                      />
                    ))}
                    <SalesCustomerHistory
                      id={data.customer.id}
                      kind="MEETINGS"
                      initialCursor={data.historyCursors?.meetings}
                    />
                    {can("sales.meetings.create") && (
                      <MeetingForm
                        pending={pending}
                        representativeId={String(auth.user?._id ?? "")}
                        submit={(body, form) =>
                          act(() => client.meeting(selected, body), form)
                        }
                      />
                    )}
                  </section>
                )}
                {can("sales.notes.read") && (
                  <section className={panelClass}>
                    <h2 className="text-lg font-semibold">Activity timeline</h2>
                    <p className="text-xs text-muted-foreground">
                      Latest 100 activities. Human notes are preserved as
                      separate entries.
                    </p>
                    <ol className="space-y-4">
                      {data.timeline.map((a) => (
                        <li
                          key={a._id}
                          className="border-l-2 border-border pl-4"
                        >
                          <p className="text-xs text-muted-foreground">
                            {a.kind.replaceAll(".", " ")} · {stamp(a.createdAt)}
                          </p>
                          {a.text && (
                            <p className="mt-2 whitespace-pre-wrap break-words text-sm">
                              {a.text}
                            </p>
                          )}
                        </li>
                      ))}
                    </ol>
                    <SalesCustomerHistory
                      id={data.customer.id}
                      kind="ACTIVITIES"
                      initialCursor={data.historyCursors?.activities}
                    />
                  </section>
                )}
                {can("sales.notes.create") && (
                  <form
                    className={panelClass}
                    onSubmit={(e) => {
                      e.preventDefault();
                      const f = e.currentTarget;
                      void act(
                        () =>
                          client.note(selected, value(new FormData(f), "text")),
                        f,
                      );
                    }}
                  >
                    <Field label="Add customer note">
                      <textarea
                        name="text"
                        required
                        maxLength={20000}
                        rows={6}
                        className={inputClass}
                      />
                    </Field>
                    <Button type="submit" disabled={pending}>
                      Save note to shared history
                    </Button>
                  </form>
                )}
              </>
            )}
          </main>
        </div>
      )}
      {tab === "AI Agents" && (
        <SalesAgentControl leadId={selected || undefined} />
      )}
      {tab === "Permissions" && admin && (
        <section className={panelClass}>
          <h2 className="text-lg font-semibold">
            Delegate assigned-customer access
          </h2>
          <p className="text-sm text-muted-foreground">
            Requires recent dual-channel step-up. The recipient needs an
            existing active organization-wide staff membership. An empty
            permission list revokes this sales role.
          </p>
          <PermissionForm
            pending={pending}
            submit={(body) => act(() => client.grant(body))}
          />
        </section>
      )}
    </div>
  );
}
function MeetingForm({
  pending,
  representativeId,
  submit,
}: {
  pending: boolean;
  representativeId: string;
  submit: (body: unknown, form: HTMLFormElement) => Promise<void>;
}) {
  function schedule(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = e.currentTarget,
      d = new FormData(f);
    void submit(
      {
        representativeId: value(d, "representativeId"),
        startsAt: new Date(value(d, "startsAt")).toISOString(),
        endsAt: new Date(value(d, "endsAt")).toISOString(),
        type: value(d, "type"),
        description: value(d, "description"),
      },
      f,
    );
  }
  return (
    <details>
      <summary className="cursor-pointer font-semibold">
        Schedule meeting
      </summary>
      <form className="mt-4 space-y-3" onSubmit={schedule}>
        <p className="text-xs text-muted-foreground">
          Times use your device time zone. Calendar invitations are not sent.
        </p>
        <Field label="Representative user ID">
          <input
            name="representativeId"
            defaultValue={representativeId}
            required
            pattern="[a-fA-F0-9]{24}"
            className={inputClass}
          />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Starts">
            <input
              type="datetime-local"
              name="startsAt"
              required
              className={inputClass}
            />
          </Field>
          <Field label="Ends">
            <input
              type="datetime-local"
              name="endsAt"
              required
              className={inputClass}
            />
          </Field>
        </div>
        <Field label="Meeting type">
          <select name="type" className={inputClass}>
            {["DEMO", "CALL", "ONBOARDING", "REVIEW"].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </Field>
        <Field label="Description and customer requirements">
          <textarea
            name="description"
            rows={6}
            maxLength={20000}
            className={inputClass}
          />
        </Field>
        <Button disabled={pending} type="submit">
          Schedule internal meeting
        </Button>
      </form>
    </details>
  );
}
function MeetingCard({
  meeting: m,
  editable,
  pending,
  save,
}: {
  meeting: Meeting;
  editable: boolean;
  pending: boolean;
  save: (body: unknown) => Promise<void>;
}) {
  return (
    <article className="space-y-3 rounded-xl border border-border p-4">
      <p className="font-medium">
        {m.type} · {m.status.replaceAll("_", " ")}
      </p>
      <p className="text-sm">
        {stamp(m.startsAt)} – {stamp(m.endsAt)}
      </p>
      {m.description && (
        <p className="whitespace-pre-wrap break-words text-sm">
          {m.description}
        </p>
      )}
      {m.outcome && <p className="whitespace-pre-wrap text-sm">{m.outcome}</p>}
      {editable && m.status === "SCHEDULED" && (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            const d = new FormData(e.currentTarget);
            void save({
              revision: m.revision,
              status: value(d, "status"),
              outcome: value(d, "outcome"),
            });
          }}
        >
          <Field label="Meeting status">
            <select name="status" className={inputClass}>
              {[
                "COMPLETED",
                "CANCELLED",
                "RESCHEDULED",
                "NO_SHOW",
                "NOT_HELD",
              ].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </Field>
          <Field label="Outcome, objections and promised actions">
            <textarea
              name="outcome"
              required
              minLength={2}
              maxLength={5000}
              rows={5}
              className={inputClass}
            />
          </Field>
          <Button variant="outline" disabled={pending} type="submit">
            Record outcome
          </Button>
        </form>
      )}
    </article>
  );
}
const delegatedPermissions = [
  "sales.leads.read",
  "sales.leads.create",
  "sales.leads.update",
  "sales.meetings.read",
  "sales.meetings.create",
  "sales.meetings.update",
  "sales.notes.read",
  "sales.notes.create",
  "sales.onboarding.read",
  "sales.agents.read",
  "sales.agents.execute",
];
function PermissionForm({
  pending,
  submit,
}: {
  pending: boolean;
  submit: (body: unknown) => Promise<void>;
}) {
  return (
    <form
      className="max-w-2xl space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const d = new FormData(e.currentTarget);
        void submit({
          organizationId: value(d, "organizationId"),
          userId: value(d, "userId"),
          permissions: d.getAll("permissions"),
        });
      }}
    >
      <Field label="Staff membership organization ID">
        <input
          name="organizationId"
          pattern="[a-fA-F0-9]{24}"
          required
          className={inputClass}
        />
      </Field>
      <Field label="Staff user ID">
        <input
          name="userId"
          pattern="[a-fA-F0-9]{24}"
          required
          className={inputClass}
        />
      </Field>
      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="mb-3 text-sm font-semibold">
          Explicit permissions
        </legend>
        {delegatedPermissions.map((p) => (
          <label key={p} className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="permissions" value={p} />
            {p}
          </label>
        ))}
      </fieldset>
      <Button type="submit" disabled={pending}>
        Replace delegated permissions
      </Button>
    </form>
  );
}
