import { AuthGuard } from '@/components/auth-guard';
import { DevRoleSwitcher } from '@/components/dev/dev-role-switcher';
import { RoutePresentation } from '@/components/route-presentation';

export default function TenantLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:z-[100] focus:bg-card focus:p-3"
      >
        Skip to content
      </a>
      <DevRoleSwitcher />
      <RoutePresentation>{children}</RoutePresentation>
    </AuthGuard>
  );
}
