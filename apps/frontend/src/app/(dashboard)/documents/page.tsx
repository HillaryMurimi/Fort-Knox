'use client';
import { StatusBadge } from '@/components/ui';

import Link from 'next/link';

import {
  ChevronRight,
  FileCheck2,
  FileText,
  FolderOpen,
  Search,
  Upload,
} from 'lucide-react';

const demoDocuments = [
  {
    id: 'demo-document-001',
    name: 'Dapini Heights Lease Agreement',
    type: 'Lease',
    property: 'Dapini Heights',
    status: 'Verified',
    updated: 'Today',
  },
  {
    id: 'demo-document-002',
    name: 'Property Insurance Certificate',
    type: 'Insurance',
    property: 'Westlands Residences',
    status: 'Verified',
    updated: 'Yesterday',
  },
  {
    id: 'demo-document-003',
    name: 'Riverside Court Inspection Report',
    type: 'Inspection',
    property: 'Riverside Court',
    status: 'Review Required',
    updated: '2 days ago',
  },
];

export default function DocumentsPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
            <Link
              href="/dashboard"
              className="hover:text-foreground"
            >
              Command Center
            </Link>

            <ChevronRight size={13} />

            <span className="text-foreground">
              Documents & Evidence
            </span>
          </div>

          <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            Documents & Evidence
          </h1>

          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Keep leases, inspections, certificates and
            operational evidence connected to the assets
            they belong to.
          </p>
        </div>

        <button
          type="button"
          className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[#101828] px-4 text-sm font-medium text-white shadow-sm transition hover:bg-[#1d2939]"
        >
          <Upload size={16} />
          Upload Document
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <DocumentMetric
          icon={FileText}
          label="Total Documents"
          value="247"
        />

        <DocumentMetric
          icon={FolderOpen}
          label="Property Files"
          value="184"
        />

        <DocumentMetric
          icon={FileCheck2}
          label="Verified"
          value="231"
        />

        <DocumentMetric
          icon={FileText}
          label="Needs Review"
          value="16"
          attention
        />
      </div>

      <div className="rounded-2xl border border-border bg-card shadow-sm">
        <div className="flex flex-col gap-4 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-foreground">
              Evidence Ledger
            </h2>

            <p className="mt-0.5 text-xs text-muted-foreground">
              Documents connected to your portfolio
            </p>
          </div>

          <div className="flex h-9 w-full items-center gap-2 rounded-xl border border-border bg-muted px-3 sm:w-64">
            <Search
              size={15}
              className="text-muted-foreground"
            />

            <input
              className="w-full border-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground focus:ring-0"
              placeholder="Search documents..."
            />
          </div>
        </div>

        <div className="divide-y divide-border">
          {demoDocuments.map(
            (document) => (
              <Link
                key={document.id}
                href={`/documents/${document.id}`}
                className="group flex flex-col gap-4 p-4 transition hover:bg-muted sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                    <FileText size={17} />
                  </div>

                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-foreground">
                      {document.name}
                    </div>

                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {document.type} ·{' '}
                      {document.property}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-5 sm:justify-end">
                  <StatusBadge status={document.status} domain="document" />

                  <span className="text-xs text-muted-foreground">
                    {document.updated}
                  </span>

                  <ChevronRight
                    size={16}
                    className="text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-foreground"
                  />
                </div>
              </Link>
            ),
          )}
        </div>
      </div>
    </div>
  );
}

function DocumentMetric({
  icon: Icon,
  label,
  value,
  attention = false,
}: {
  icon: typeof FileText;
  label: string;
  value: string;
  attention?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-muted text-muted-foreground">
          <Icon size={17} />
        </div>

        {attention && (
          <span className="h-2 w-2 rounded-full bg-amber-500" />
        )}
      </div>

      <div className="mt-3 text-xs font-medium text-muted-foreground">
        {label}
      </div>

      <div className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
        {value}
      </div>
    </div>
  );
}