import { AuthGuard } from '@/components/auth-guard';
import { Shell } from '@/components/shell';
import { RoutePresentation } from '@/components/route-presentation';
export function WorkspaceLayout({ children }: { children: React.ReactNode }) { return <AuthGuard><Shell><RoutePresentation>{children}</RoutePresentation></Shell></AuthGuard>; }
