import Link from "next/link";
import { Alert, Card } from "@/components/ui";

export function PlatformPreviewNotice() {
  return (
    <main className="space-y-5 p-5 lg:p-8">
      <h1 className="text-2xl font-semibold">Platform administration</h1>
      <Alert tone="warning" title="Real SUPER_ADMIN sign-in required">
        This is a development role preview. Organizations, billing, access
        controls, monitoring and platform analytics require the authenticated
        backend.
      </Alert>
      <Card className="space-y-3 p-5">
        <h2 className="font-semibold">Connect to your platform</h2>
        <ol className="list-decimal space-y-2 pl-5 text-sm">
          <li>Run the backend configured by NEXT_PUBLIC_API_URL.</li>
          <li>
            Set NEXT_PUBLIC_DEV_AUTH_BYPASS=false and
            NEXT_PUBLIC_DEV_DEMO_MODE=false in apps/frontend/.env.local.
          </li>
          <li>
            Restart the frontend, sign out of the development role preview and
            sign in through password, email OTP and SMS OTP.
          </li>
        </ol>
        <p className="text-sm text-muted-foreground">
          Platform records and controls are unavailable in local preview. No
          platform changes have been made.
        </p>
        <Link
          href="/dev/preview"
          className="inline-flex rounded-md border border-border px-3 py-2 text-sm font-medium focus-visible:outline focus-visible:outline-2"
        >
          Choose another development role
        </Link>
      </Card>
    </main>
  );
}
