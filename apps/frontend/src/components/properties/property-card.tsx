'use client';
import Link from 'next/link';
import type { Property } from '@/lib/data/resource-types';
import { Badge } from '@/components/ui';
import { Building2, ChevronRight, MapPin } from 'lucide-react';

export function PropertyCard({ property }: { property: Property }) {
  return <Link href={`/properties/${property._id}`} className="card block p-5 hover:border-[#cfd4dc] hover:shadow-md transition-all group">
    <div className="flex items-start justify-between gap-4">
      <div className="flex gap-3 min-w-0"><div className="w-11 h-11 rounded-xl bg-muted flex items-center justify-center shrink-0"><Building2 size={20} className="text-muted-foreground" /></div><div className="min-w-0"><div className="font-semibold truncate">{property.name}</div><div className="text-xs text-muted-foreground mt-1">{property.code}</div></div></div>
      <Badge tone={property.status === 'ACTIVE' ? 'green' : property.status === 'INACTIVE' ? 'orange' : 'neutral'}>{property.status}</Badge>
    </div>
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-5"><MapPin size={13} />{property.address.city}, {property.address.country}</div>
    <div className="grid grid-cols-2 gap-3 mt-5 pt-4 border-t border-border"><div><div className="text-[11px] text-muted-foreground">Units</div><div className="font-semibold mt-1">{property.totalUnits ?? '—'}</div></div><div><div className="text-[11px] text-muted-foreground">Type</div><div className="font-medium text-sm mt-1">{property.propertyType.replaceAll('_', ' ')}</div></div></div>
    <div className="mt-5 flex items-center justify-end text-xs font-semibold text-muted-foreground group-hover:text-[#d97745]">Open property <ChevronRight size={15} /></div>
  </Link>;
}
