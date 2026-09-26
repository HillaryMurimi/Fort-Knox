import { Badge } from '@/components/ui';
import type { Tenancy } from '@/lib/data/resource-types';
export function TenancyStatusBadge({ status }: { status: Tenancy['status'] }) { const tone=status==='ACTIVE'?'green':status==='TERMINATED'||status==='MOVED_OUT'?'red':status==='NOTICE'?'orange':status==='PENDING'?'blue':'neutral'; return <Badge tone={tone}>{status.replaceAll('_',' ')}</Badge>; }
