"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ClipboardCheck,
  FileText,
  History,
  Plus,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";
import { useOrganization } from "@/hooks/use-organization";
import {
  useAuditLogsQuery,
  useDomainEventsQuery,
} from "@/hooks/queries/use-audit-queries";
import {
  useCreateDocumentMutation,
  useCreateEvidenceMutation,
  useDocumentsQuery,
  useEvidenceQuery,
} from "@/hooks/queries/use-document-queries";
import type {
  CreateDocumentInput,
  CreateEvidenceInput,
} from "@/lib/data/documents";
import type { DocumentRecord, EvidenceRecord } from "@/lib/data/resource-types";
import {
  Badge,
  EmptyState,
  PageTitle,
  SectionHeader,
  Stat,
} from "@/components/ui";

type StorageProvider = NonNullable<CreateDocumentInput["storageProvider"]>;
type DocumentCategory = NonNullable<CreateDocumentInput["category"]>;
type DocumentVisibility = NonNullable<CreateDocumentInput["visibility"]>;

const categories: DocumentRecord["category"][] = [
  "LEASE",
  "INSPECTION",
  "MAINTENANCE",
  "INVOICE",
  "RECEIPT",
  "IDENTITY",
  "PROPERTY",
  "TENANCY",
  "MOVE_OUT",
  "INSURANCE",
  "LEGAL",
  "FINANCIAL",
  "OTHER",
];
const evidenceTypes: EvidenceRecord["evidenceType"][] = [
  "PHOTO",
  "VIDEO",
  "AUDIO",
  "DOCUMENT",
  "SCREENSHOT",
  "METER_READING",
  "SIGNATURE",
  "OTHER",
];
const relatedTypes: EvidenceRecord["relatedResourceType"][] = [
  "MAINTENANCE",
  "INSPECTION",
  "MOVE_OUT",
  "TENANCY",
  "EXPENSE",
  "PAYMENT",
  "ARREARS",
  "PROPERTY",
  "UNIT",
  "SECURITY_EVENT",
  "OTHER",
];

export default function DocumentsPage() {
  const { activeOrganizationId: org } = useOrganization();
  const documents = useDocumentsQuery(org);
  const evidence = useEvidenceQuery(org);
  const audit = useAuditLogsQuery(org, { limit: 100 });
  const events = useDomainEventsQuery(org, { limit: 100 });
  const createDocument = useCreateDocumentMutation(org);
  const createEvidence = useCreateEvidenceMutation(org);
  const [tab, setTab] = useState<"documents" | "evidence" | "audit" | "events">(
    "documents",
  );
  const [search, setSearch] = useState("");
  const [showDocument, setShowDocument] = useState(false);
  const [showEvidence, setShowEvidence] = useState(false);

  const filteredDocs = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (documents.data ?? []).filter(
      (d) =>
        !q ||
        `${d.title} ${d.category} ${d.fileName} ${d.tags.join(" ")}`
          .toLowerCase()
          .includes(q),
    );
  }, [documents.data, search]);
  const filteredEvidence = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (evidence.data ?? []).filter(
      (e) =>
        !q ||
        `${e.title ?? ""} ${e.evidenceType} ${e.source} ${e.relatedResourceType} ${e.relatedResourceId}`
          .toLowerCase()
          .includes(q),
    );
  }, [evidence.data, search]);

  if (!org)
    return (
      <EmptyState
        icon={FileText}
        title="Select an organization"
        description="Choose an organization to open the governed evidence workspace."
      />
    );

  return (
    <div>
      <PageTitle
        eyebrow="Governance"
        title="Documents, Evidence & Audit"
        description="One governed record for leases, inspections, maintenance evidence, financial documents, security evidence and every material action."
        action={
          <div className="flex gap-2">
            <button
              className="btn-secondary"
              onClick={() => setShowEvidence(true)}
            >
              <Plus size={15} /> Add evidence
            </button>
            <button
              className="btn-primary"
              onClick={() => setShowDocument(true)}
            >
              <Plus size={15} /> Register document
            </button>
          </div>
        }
      />
      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        <Stat
          label="Active documents"
          value={String(documents.data?.length ?? 0)}
          sub="Organization-scoped records"
          icon={FileText}
        />
        <Stat
          label="Evidence items"
          value={String(evidence.data?.length ?? 0)}
          sub="Traceable to source records"
          icon={ShieldCheck}
        />
        <Stat
          label="Audit entries"
          value={String(audit.data?.length ?? 0)}
          sub="Append-only activity"
          icon={History}
        />
        <Stat
          label="Domain events"
          value={String(events.data?.length ?? 0)}
          sub="Published system events"
          icon={ClipboardCheck}
        />
      </div>
      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <div className="relative flex-1">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <input
            className="input pl-9"
            placeholder="Search records, hashes, categories or resource IDs…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex rounded-xl bg-muted p-1 overflow-x-auto">
          {(["documents", "evidence", "audit", "events"] as const).map((x) => (
            <button
              key={x}
              onClick={() => setTab(x)}
              className={`px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap ${tab === x ? "bg-card shadow-sm text-foreground" : "text-muted-foreground"}`}
            >
              {x.charAt(0).toUpperCase() + x.slice(1)}
            </button>
          ))}
        </div>
      </div>
      {tab === "documents" && (
        <DocumentList rows={filteredDocs} loading={documents.isLoading} />
      )}
      {tab === "evidence" && (
        <EvidenceList rows={filteredEvidence} loading={evidence.isLoading} />
      )}
      {tab === "audit" && (
        <AuditList rows={audit.data ?? []} loading={audit.isLoading} />
      )}
      {tab === "events" && (
        <EventList rows={events.data ?? []} loading={events.isLoading} />
      )}
      {showDocument && (
        <DocumentForm
          busy={createDocument.isPending}
          onClose={() => setShowDocument(false)}
          onSubmit={async (v) => {
            await createDocument.mutateAsync(v);
            setShowDocument(false);
          }}
        />
      )}
      {showEvidence && (
        <EvidenceForm
          busy={createEvidence.isPending}
          onClose={() => setShowEvidence(false)}
          onSubmit={async (v) => {
            await createEvidence.mutateAsync(v);
            setShowEvidence(false);
          }}
        />
      )}
    </div>
  );
}

function DocumentList({
  rows,
  loading,
}: {
  rows: DocumentRecord[];
  loading: boolean;
}) {
  return (
    <section className="card overflow-hidden">
      <SectionHeader
        title="Document register"
        action={<Badge tone="blue">Versioned · governed</Badge>}
      />
      {loading ? (
        <div className="p-8 text-sm text-muted-foreground">Loading documents…</div>
      ) : rows.length ? (
        <div className="divide-y divide-border">
          {rows.map((d) => (
            <div
              key={d._id}
              className="px-5 py-4 flex flex-wrap items-center gap-4"
            >
              <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
                <FileText size={18} />
              </div>
              <div className="min-w-0 flex-1">
                <Link
                  href={`/documents/${d._id}`}
                  className="font-medium text-sm hover:underline"
                >
                  {d.title}
                </Link>
                <div className="text-xs text-muted-foreground mt-1">
                  {d.category} · {d.fileName} · v{d.version} ·{" "}
                  {formatBytes(d.sizeBytes)}
                </div>
                <div className="text-[11px] text-muted-foreground mt-1 break-all">
                  SHA-256 {d.sha256}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge
                  tone={
                    d.status === "ACTIVE"
                      ? "green"
                      : d.status === "QUARANTINED"
                        ? "red"
                        : "neutral"
                  }
                >
                  {d.status}
                </Badge>
                <Badge
                  tone={
                    d.visibility === "PRIVATE"
                      ? "orange"
                      : d.visibility === "TENANT"
                        ? "blue"
                        : "neutral"
                  }
                >
                  {d.visibility}
                </Badge>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={FileText}
          title="No documents"
          description="Register leases, inspection reports, invoices, receipts and other governed records."
        />
      )}
    </section>
  );
}
function EvidenceList({
  rows,
  loading,
}: {
  rows: EvidenceRecord[];
  loading: boolean;
}) {
  return (
    <section className="card overflow-hidden">
      <SectionHeader
        title="Evidence register"
        action={<Badge tone="green">Traceable chain</Badge>}
      />
      {loading ? (
        <div className="p-8 text-sm text-muted-foreground">Loading evidence…</div>
      ) : rows.length ? (
        <div className="divide-y divide-border">
          {rows.map((e) => (
            <div
              key={e._id}
              className="px-5 py-4 flex flex-wrap items-center gap-4"
            >
              <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
                <ShieldCheck size={18} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm">
                  {e.title ?? e.evidenceType.replaceAll("_", " ")}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {e.evidenceType} · {e.source} ·{" "}
                  {new Date(e.capturedAt).toLocaleString()}
                </div>
                <div className="text-[11px] text-muted-foreground mt-1">
                  Linked to {e.relatedResourceType} · {e.relatedResourceId}
                </div>
              </div>
              {e.documentId && <Badge tone="blue">Document linked</Badge>}
              <Badge tone="neutral">
                {e.unitId ? "Unit scoped" : "Org scoped"}
              </Badge>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={ShieldCheck}
          title="No evidence"
          description="Attach photos, clips, signatures, meter readings and other evidence to operational records."
        />
      )}
    </section>
  );
}
function AuditList({
  rows,
  loading,
}: {
  rows: import("@/lib/data/resource-types").AuditLogRecord[];
  loading: boolean;
}) {
  return (
    <section className="card overflow-hidden">
      <SectionHeader
        title="Immutable audit history"
        action={<Badge tone="orange">Append-only</Badge>}
      />
      {loading ? (
        <div className="p-8 text-sm text-muted-foreground">Loading audit history…</div>
      ) : rows.length ? (
        <div className="divide-y divide-border">
          {rows.map((x) => (
            <div key={x._id} className="px-5 py-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-sm">{x.action}</span>
                <Badge tone="neutral">{x.resourceType}</Badge>
                {x.resourceId && (
                  <span className="text-[11px] text-muted-foreground break-all">
                    {x.resourceId}
                  </span>
                )}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {new Date(x.occurredAt).toLocaleString()} · actor{" "}
                {x.actorUserId ?? "system"}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={History}
          title="No audit entries"
          description="Material changes will appear here through the backend append-only audit ledger."
        />
      )}
    </section>
  );
}
function EventList({
  rows,
  loading,
}: {
  rows: import("@/lib/data/resource-types").DomainEventRecord[];
  loading: boolean;
}) {
  return (
    <section className="card overflow-hidden">
      <SectionHeader
        title="Domain event ledger"
        action={<Badge tone="blue">System events</Badge>}
      />
      {loading ? (
        <div className="p-8 text-sm text-muted-foreground">Loading domain events…</div>
      ) : rows.length ? (
        <div className="divide-y divide-border">
          {rows.map((x) => (
            <div key={x.eventId} className="px-5 py-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-sm">{x.name}</span>
                <Badge tone="neutral">{x.aggregateType}</Badge>
                <span className="text-[11px] text-muted-foreground">v{x.version}</span>
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {new Date(x.occurredAt).toLocaleString()} · {x.aggregateId}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={ClipboardCheck}
          title="No domain events"
          description="Published domain events will provide the bridge into notifications, jobs and intelligence."
        />
      )}
    </section>
  );
}

function DocumentForm({
  busy,
  onClose,
  onSubmit,
}: {
  busy: boolean;
  onClose: () => void;
  onSubmit: (v: CreateDocumentInput) => Promise<void>;
}) {
  const [v, setV] = useState<CreateDocumentInput>({
    title: "",
    category: "LEASE",
    fileName: "",
    mimeType: "application/pdf",
    sizeBytes: 0,
    storageProvider: "S3",
    storageKey: "",
    sha256: "",
    visibility: "STAFF",
    tags: [],
  });

  return (
    <Modal title="Register governed document" busy={busy} onClose={onClose}>
      <form
        id="evidence-form"
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          void onSubmit(v);
        }}
      >
        <input
          className="input"
          required
          placeholder="Document title"
          value={v.title}
          onChange={(e) =>
            setV((current) => ({
              ...current,
              title: e.target.value,
            }))
          }
        />

        <select
          className="input"
          value={v.category}
          onChange={(e) =>
            setV((current) => ({
              ...current,
              category: e.target.value as DocumentCategory,
            }))
          }
        >
          {categories.map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>

        <div className="grid sm:grid-cols-2 gap-3">
          <input
            className="input"
            required
            placeholder="File name"
            value={v.fileName}
            onChange={(e) =>
              setV((current) => ({
                ...current,
                fileName: e.target.value,
              }))
            }
          />

          <input
            className="input"
            required
            placeholder="MIME type"
            value={v.mimeType}
            onChange={(e) =>
              setV((current) => ({
                ...current,
                mimeType: e.target.value,
              }))
            }
          />
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <input
            className="input"
            type="number"
            min="0"
            required
            placeholder="Size in bytes"
            value={v.sizeBytes}
            onChange={(e) =>
              setV((current) => ({
                ...current,
                sizeBytes: Number(e.target.value),
              }))
            }
          />

          <input
            className="input"
            required
            minLength={64}
            maxLength={64}
            placeholder="SHA-256 hash"
            value={v.sha256}
            onChange={(e) =>
              setV((current) => ({
                ...current,
                sha256: e.target.value,
              }))
            }
          />
        </div>

        <input
          className="input"
          required
          placeholder="Storage key"
          value={v.storageKey}
          onChange={(e) =>
            setV((current) => ({
              ...current,
              storageKey: e.target.value,
            }))
          }
        />

        <div className="grid sm:grid-cols-2 gap-3">
          <select
            className="input"
            value={v.storageProvider}
            onChange={(e) =>
              setV((current) => ({
                ...current,
                storageProvider: e.target.value as StorageProvider,
              }))
            }
          >
            <option>S3</option>
            <option>CLOUDINARY</option>
            <option>LOCAL</option>
            <option>OTHER</option>
          </select>

          <select
            className="input"
            value={v.visibility}
            onChange={(e) =>
              setV((current) => ({
                ...current,
                visibility: e.target.value as DocumentVisibility,
              }))
            }
          >
            <option>STAFF</option>
            <option>TENANT</option>
            <option>PRIVATE</option>
          </select>
        </div>

        <input
          className="input"
          placeholder="Property ID (optional)"
          value={v.propertyId ?? ""}
          onChange={(e) =>
            setV((current) => ({
              ...current,
              ...(e.target.value ? { propertyId: e.target.value } : {}),
            }))
          }
        />

        <input
          className="input"
          placeholder="Unit ID (optional)"
          value={v.unitId ?? ""}
          onChange={(e) =>
            setV((current) => ({
              ...current,
              ...(e.target.value ? { unitId: e.target.value } : {}),
            }))
          }
        />

        <textarea
          className="input min-h-24"
          placeholder="Description"
          value={v.description ?? ""}
          onChange={(e) =>
            setV((current) => ({
              ...current,
              ...(e.target.value ? { description: e.target.value } : {}),
            }))
          }
        />
      </form>
    </Modal>
  );
}

function EvidenceForm({
  busy,
  onClose,
  onSubmit,
}: {
  busy: boolean;
  onClose: () => void;
  onSubmit: (v: CreateEvidenceInput) => Promise<void>;
}) {
  const [v, setV] = useState<CreateEvidenceInput>({
    evidenceType: "PHOTO",
    source: "WEB",
    capturedAt: new Date().toISOString(),
    relatedResourceType: "INSPECTION",
    relatedResourceId: "",
    title: "",
  });
  return (
    <Modal title="Register evidence" busy={busy} onClose={onClose}>
      <form
        id="evidence-form"
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          void onSubmit(v);
        }}
      >
        <input
          className="input"
          placeholder="Title"
          value={v.title ?? ""}
          onChange={(e) =>
            setV((current) => ({
              ...current,
              title: e.target.value,
            }))
          }
        />
        <div className="grid sm:grid-cols-2 gap-3">
          <select
            className="input"
            value={v.evidenceType}
            onChange={(e) =>
              setV({
                ...v,
                evidenceType: e.target
                  .value as CreateEvidenceInput["evidenceType"],
              })
            }
          >
            {evidenceTypes.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
          <select
            className="input"
            value={v.source}
            onChange={(e) =>
              setV({
                ...v,
                source: e.target.value as CreateEvidenceInput["source"],
              })
            }
          >
            <option>WEB</option>
            <option>MOBILE</option>
            <option>CCTV</option>
            <option>SYSTEM</option>
            <option>API</option>
            <option>OTHER</option>
          </select>
        </div>
        <select
          className="input"
          value={v.relatedResourceType}
          onChange={(e) =>
            setV({
              ...v,
              relatedResourceType: e.target
                .value as CreateEvidenceInput["relatedResourceType"],
            })
          }
        >
          {relatedTypes.map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
        <input
          className="input"
          required
          placeholder="Related resource ID"
          value={v.relatedResourceId}
          onChange={(e) => setV({ ...v, relatedResourceId: e.target.value })}
        />
        <input
          className="input"
          type="datetime-local"
          value={toLocal(v.capturedAt)}
          onChange={(e) =>
            setV({ ...v, capturedAt: new Date(e.target.value).toISOString() })
          }
        />
        <input
          className="input"
          placeholder="Document ID (optional)"
          value={v.documentId ?? ""}
          onChange={(e) =>
            setV((current) => ({
              ...current,
              ...(e.target.value ? { documentId: e.target.value } : {}),
            }))
          }
        />
        <input
          className="input"
          placeholder="Property ID (optional)"
          value={v.propertyId ?? ""}
          onChange={(e) =>
            setV((current) => ({
              ...current,
              ...(e.target.value ? { propertyId: e.target.value } : {}),
            }))
          }
        />
        <input
          className="input"
          placeholder="Unit ID (optional)"
          value={v.unitId ?? ""}
          onChange={(e) =>
            setV((current) => ({
              ...current,
              ...(e.target.value ? { unitId: e.target.value } : {}),
            }))
          }
        />
      </form>
    </Modal>
  );
}
function Modal({
  title,
  children,
  onClose,
  busy,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  busy: boolean;
}) {
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.currentTarget === e.target) onClose();
      }}
    >
      <div className="modal-panel max-w-xl w-full">
        <div className="flex justify-between items-center mb-5">
          <h2 className="font-semibold">{title}</h2>
          <button type="button" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        {children}
        <button
          className="btn-primary w-full mt-5"
          disabled={busy}
          form="evidence-form"
        >
          {busy ? "Saving…" : "Save record"}
        </button>
      </div>
    </div>
  );
}
function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 ** 2).toFixed(1)} MB`;
}
function toLocal(value: string) {
  const d = new Date(value);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}