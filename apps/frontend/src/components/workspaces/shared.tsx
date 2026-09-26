'use client';
import Link from 'next/link';
import { Activity, ArrowUpRight, AlertCircle, FileText } from 'lucide-react';
import { Badge, Dialog, EmptyState, SectionHeader } from '@/components/ui';
import { label } from '@/lib/presentation';
import { useState } from 'react';
export function Status({ value }: { value: unknown }) { const text = typeof value === 'string' ? value : 'UNKNOWN'; const tone = ['ACTIVE','CLOSED','VERIFIED','COMPLETED','PAID','SUCCEEDED'].includes(text) ? 'green' : ['HIGH','EMERGENCY','FAILED','SUSPENDED'].includes(text) ? 'red' : ['PENDING','APPROVAL_REQUIRED','QUOTED','DEGRADED'].includes(text) ? 'orange' : 'neutral'; return <Badge tone={tone}>{label(text)}</Badge>; }
export function Section({ id, title, description, children, action }: { id: string; title: string; description?: string; children: React.ReactNode; action?: React.ReactNode }) { return <section id={id} className="card scroll-mt-24 p-5 sm:p-6"><SectionHeader title={title} {...(description !== undefined ? { description } : {})} {...(action !== undefined ? { action } : {})}/>{children}</section>; }
export function QueryState({ query, empty, children }: { query: { isLoading: boolean; isError: boolean; error: unknown; refetch: () => unknown }; empty?: boolean; children: React.ReactNode }) {
 if (query.isLoading) return <div role="status" className="animate-pulse space-y-3 py-5"><div className="h-4 w-2/3 rounded bg-muted"/><div className="h-4 w-1/2 rounded bg-muted"/><span className="sr-only">Loading records</span></div>;
 if (query.isError) return <div role="alert" className="rounded-lg border border-border p-4"><AlertCircle size={18}/><p className="mt-2 text-sm">{query.error instanceof Error ? query.error.message : 'Unable to load these records.'}</p><button className="btn-secondary mt-3" onClick={() => void query.refetch()}>Retry</button></div>;
 if (empty) return <EmptyState icon={Activity} title="Nothing to show yet" description="Records will appear here when available."/>;
 return <>{children}</>;
}
export function DetailPairs({ items }: { items: Array<[string, React.ReactNode]> }) { return <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">{items.map(([name,value]) => <div key={name}><dt className="text-xs text-muted-foreground">{name}</dt><dd className="mt-1 text-sm font-medium break-words">{value}</dd></div>)}</dl>; }
export function PreviewAction({ title, children, demo = false }: { title: string; children?: React.ReactNode; demo?: boolean }) {
 const [open,setOpen] = useState(false);
 return <><button className="btn-secondary" onClick={() => setOpen(true)}>{title}</button><Dialog open={open} onOpenChange={setOpen} title={title} description={demo ? 'Demo preview ? no external action or saved record.' : 'Integration required ? this action is not connected.'}>{children ?? <p className="text-sm text-muted-foreground">This workflow needs an authorized service connection before it can be submitted.</p>}</Dialog></>;
}
export function QuickLink({ href, children }: { href: string; children: React.ReactNode }) { return <Link href={href} className="btn-secondary">{children}<ArrowUpRight size={14}/></Link>; }
export function MissingIntegration({ title, children, demo }: { title: string; children: React.ReactNode; demo: boolean }) { return <div className="rounded-lg border border-dashed border-border bg-muted/40 p-4"><div className="mb-2 flex items-center gap-2 text-sm font-medium"><FileText size={15}/>{title}<Badge tone="orange">{demo ? 'Demo' : 'Not connected'}</Badge></div>{children}</div>; }
