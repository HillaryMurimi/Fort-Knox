'use client';

import { useState } from 'react';
import { Badge, Button, EmptyState, PageTitle, SearchField } from './ui';
import * as I from './icons';

export type Row = {
  name: string;
  meta: string;
  status: string;
  statusTone: 'green' | 'orange' | 'red' | 'blue' | 'neutral';
  value: string;
  extra: string;
};

export function ListPage({ eyebrow, title, description, primary, rows, emptyIcon = I.FileText }: { eyebrow: string; title: string; description: string; primary: string; rows: Row[]; emptyIcon?: React.ElementType }) {
  const [query, setQuery] = useState('');
  const filtered = rows.filter((row) => `${row.name} ${row.meta} ${row.status}`.toLowerCase().includes(query.toLowerCase()));

  return <>
    <PageTitle eyebrow={eyebrow} title={title} description={description} action={<Button><I.Plus size={15} />{primary}</Button>} />
    <div className="card overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-[var(--border)] p-3 sm:flex-row sm:items-center sm:p-4">
        <SearchField className="w-full sm:max-w-md sm:flex-1" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search records..." />
        <Button variant="outline"><I.SlidersHorizontal size={15} />Filter</Button>
      </div>
      {filtered.length ? <div className="divide-y divide-[var(--border)]">{filtered.map((row, index) => <div key={`${row.name}-${index}`} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-4 py-4 transition-colors hover:bg-[var(--muted)] sm:grid-cols-[auto_minmax(0,1fr)_auto_8rem_auto] sm:gap-4 sm:px-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--muted)]"><I.Building2 size={16} /></div>
        <div className="min-w-0"><div className="truncate text-sm font-medium">{row.name}</div><div className="mt-1 truncate text-xs text-[var(--muted-foreground)]">{row.meta}</div></div>
        <Badge tone={row.statusTone}>{row.status}</Badge>
        <div className="col-start-2 text-left sm:col-auto sm:text-right"><div className="text-sm font-semibold">{row.value}</div><div className="text-[11px] text-muted-foreground">{row.extra}</div></div>
        <Button variant="ghost" size="icon" className="col-start-3 h-8 w-8 sm:col-auto" aria-label={`Open actions for ${row.name}`}><I.MoreHorizontal size={17} /></Button>
      </div>)}</div> : <EmptyState className="border-0 shadow-none" icon={emptyIcon} title="Nothing found" description="Try another search or create a new record." />}
    </div>
  </>;
}
