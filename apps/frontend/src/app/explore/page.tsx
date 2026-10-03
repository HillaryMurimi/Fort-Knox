'use client';

import { useState } from 'react';
import Link from 'next/link';
import { BRAND } from '@/lib/brand';
import { ArrowLeft, ArrowRight, Banknote, Building2, Camera, ClipboardCheck, Gauge, ShieldCheck, Wrench } from 'lucide-react';
import { AuthGuard } from '@/components/auth-guard';
import { useAuth } from '@/hooks/use-auth';

const stops = [
  { title: 'Portfolio pulse', copy: 'See occupancy, collections, pending decisions and property health across your portfolio.', href: '/dashboard', icon: Gauge, signal: 'Portfolio overview' },
  { title: 'Every property in context', copy: 'Move from a portfolio view into buildings, floors and unit histories without losing the thread.', href: '/properties', icon: Building2, signal: 'Properties and units' },
  { title: 'Collections you can trace', copy: 'Follow charges, payments, arrears and settlement status back to their source.', href: '/finance', icon: Banknote, signal: 'Financial control' },
  { title: 'Accountable maintenance', copy: 'Track requests from triage through assignment, approval, evidence and verification.', href: '/maintenance', icon: Wrench, signal: 'Maintenance workflow' },
  { title: 'Security with an audit trail', copy: 'Open approved cameras and incidents in the context of their building and access policy.', href: '/security', icon: Camera, signal: 'Security operations' },
  { title: 'Decisions, then action', copy: 'Keep approvals, activity and your next operational action in one place.', href: '/operations', icon: ClipboardCheck, signal: 'Action queue' },
] as const;

function Tour() {
  const { roles } = useAuth();
  const [index, setIndex] = useState(0);
  const stop = stops[index] ?? stops[0]!;
  const Icon = stop.icon;
  if (!roles.includes('LANDLORD')) return <main className="flex min-h-screen items-center justify-center bg-[#101923] px-4 text-white"><div><h1 className="text-xl font-semibold">Owner tour</h1><p className="mt-2 text-sm text-[#9abdc8]">This tour is available to organization owners.</p><Link href="/dashboard" className="mt-4 inline-block text-[#5ce1e7]">Open your workspace</Link></div></main>;
  return <main className="min-h-screen bg-[#0b1620] px-4 py-5 text-[#effbfd] sm:px-8">
    <div className="mx-auto max-w-6xl"><div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#294756] pb-5"><div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center bg-[#20ced4] font-bold text-[#09202a]" aria-hidden="true">{BRAND.mark}</span><div><strong className="block text-lg">{BRAND.name}</strong><span className="text-xs text-[#8db8c4]">{BRAND.descriptor}</span></div></div><Link href="/dashboard" className="text-sm text-[#9fc9d3] hover:text-white">Skip tour <ArrowRight size={15} className="inline"/></Link></div>
      <div className="grid gap-8 py-10 lg:grid-cols-[minmax(0,1fr)_minmax(280px,370px)] lg:items-center lg:gap-12 lg:py-20">
        <div className="min-w-0"><p className="text-xs font-semibold uppercase text-[#54dae2]">Your command center / {String(index + 1).padStart(2, '0')} of {String(stops.length).padStart(2, '0')}</p><h1 className="mt-4 text-3xl font-semibold sm:text-5xl">{stop.title}</h1><p className="mt-5 max-w-2xl text-base leading-7 text-[#a4c2cb]">{stop.copy}</p><div className="mt-8 flex flex-wrap gap-3"><button type="button" onClick={() => setIndex(Math.max(index - 1, 0))} disabled={index === 0} className="inline-flex h-10 items-center gap-2 border border-[#446c7a] px-4 text-sm disabled:opacity-40"><ArrowLeft size={16}/> Back</button>{index < stops.length - 1 ? <button type="button" onClick={() => setIndex(index + 1)} className="inline-flex h-10 items-center gap-2 bg-[#24c8d3] px-5 text-sm font-semibold text-[#081923]">Next stop <ArrowRight size={16}/></button> : <Link href="/dashboard" className="inline-flex h-10 items-center gap-2 bg-[#24c8d3] px-5 text-sm font-semibold text-[#081923]">Enter Command Center <ArrowRight size={16}/></Link>}<Link href={stop.href} className="inline-flex h-10 items-center gap-2 px-3 text-sm text-[#73e0e5]">Open this screen <ArrowRight size={15}/></Link></div><div className="mt-10 flex gap-2" aria-label="Tour progress">{stops.map((item, position) => <button key={item.title} type="button" aria-label={`Go to ${item.title}`} aria-current={position === index ? 'step' : undefined} onClick={() => setIndex(position)} className={`h-2 w-9 transition-colors ${position === index ? 'bg-[#24c8d3]' : 'bg-[#315260] hover:bg-[#5ba2aa]'}`}/>)}</div></div>
        <div className="relative min-h-[300px] overflow-hidden border border-[#315665] bg-[#10242d] p-5 sm:min-h-[380px] sm:p-7"><div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'linear-gradient(#47c8ce 1px,transparent 1px),linear-gradient(90deg,#47c8ce 1px,transparent 1px)', backgroundSize: '28px 28px' }}/><div className="relative flex items-center justify-between border-b border-[#315665] pb-4 text-xs"><span>COMMAND / {stop.signal.toUpperCase()}</span><ShieldCheck size={17} className="text-[#62dbad]"/></div><div className="relative mt-8 grid h-24 w-24 place-items-center border border-[#4ed7dd] bg-[#16434a] text-[#62dfe5]"><Icon size={44} strokeWidth={1.4}/></div><div className="relative mt-7 space-y-3">{stops.map((item, position) => <button key={item.title} type="button" onClick={() => setIndex(position)} className={`flex w-full items-center justify-between border-b border-[#284550] py-2 text-left text-sm ${position === index ? 'text-[#6de2e8]' : 'text-[#8faeb9]'}`}><span>{item.signal}</span><span>{position === index ? '●' : String(position + 1).padStart(2, '0')}</span></button>)}</div></div>
      </div>
    </div>
  </main>;
}

export default function ExplorePage() { return <AuthGuard><Tour /></AuthGuard>; }
