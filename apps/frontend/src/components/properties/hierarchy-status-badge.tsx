import { StatusBadge } from '@/components/ui';
export function HierarchyStatusBadge({status}:{status:string}) { return <StatusBadge status={status} domain="entity" />; }
