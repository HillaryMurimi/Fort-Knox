import { RoutePresentation } from '@/components/route-presentation';
import { AuthGuard } from '../../components/auth-guard';
import { Shell } from '../../components/shell';

export default function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <AuthGuard>
      <Shell><RoutePresentation>{children}</RoutePresentation></Shell>
    </AuthGuard>
  );
}