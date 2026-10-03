import { StatusBadge } from '@/components/ui';
import type { Tenancy } from '@/lib/data/resource-types';
export function TenancyStatusBadge({status}:{status:Tenancy['status']}) { return <StatusBadge status={status} domain="tenancy" />; }
