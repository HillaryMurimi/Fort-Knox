import { StatusBadge } from '@/components/ui';
import { semanticDemoStatus } from '@/lib/data/sales-demo';
import type { StatusDomain } from '@/lib/status';
export function DemoStatus({status, domain = 'sales'}:{status:string; domain?:StatusDomain}) { return <StatusBadge status={status} domain={domain}>{semanticDemoStatus(status).label}</StatusBadge>; }
