import { CheckCircle2, Clock3, CircleAlert, Activity } from "lucide-react";
import { semanticDemoStatus } from "@/lib/data/sales-demo";
export function DemoStatus({ status }: { status: string }) {
  const { label, tone } = semanticDemoStatus(status),
    Icon =
      tone === "success"
        ? CheckCircle2
        : tone === "danger"
          ? CircleAlert
          : tone === "active"
            ? Activity
            : Clock3;
  const colors = {
    success:
      "border-emerald-600/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300",
    danger: "border-red-600/40 bg-red-500/10 text-red-800 dark:text-red-300",
    active:
      "border-blue-600/40 bg-blue-500/10 text-blue-800 dark:text-blue-300",
    attention:
      "border-amber-600/40 bg-amber-500/10 text-amber-800 dark:text-amber-300",
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${colors[tone as keyof typeof colors]}`}
    >
      <Icon size={13} aria-hidden="true" />
      {label}
    </span>
  );
}
