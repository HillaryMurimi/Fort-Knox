"use client";
import { useEffect, useRef } from "react";
import {
  CheckCircle2,
  Circle,
  CircleAlert,
  CircleX,
  MinusCircle,
  ArrowRight,
} from "lucide-react";
import {
  pipelineSemantic,
  statusLabel,
  type StatusDomain,
  type WorkflowStage,
} from "@/lib/status";
import Link from "next/link";
import { cn } from "@/lib/utils";

const positions = {
  completed: "Completed",
  current: "Current stage",
  upcoming: "Upcoming",
  blocked: "Blocked",
  failed: "Failed",
  skipped: "Skipped / cancelled",
};
const icons = {
  completed: CheckCircle2,
  current: ArrowRight,
  upcoming: Circle,
  blocked: CircleAlert,
  failed: CircleX,
  skipped: MinusCircle,
};
export function WorkflowPipeline({
  stages,
  domain = "general",
  label = "Workflow progress",
  className,
}: {
  stages: readonly WorkflowStage[];
  domain?: StatusDomain;
  label?: string;
  className?: string;
}) {
  const rail = useRef<HTMLOListElement>(null);
  const currentKey = stages.find((stage) =>
    ["current", "blocked", "failed"].includes(stage.position),
  )?.key;
  useEffect(() => {
    const node = rail.current,
      current = node?.querySelector<HTMLElement>('[aria-current="step"]');
    if (node && current && node.scrollWidth > node.clientWidth)
      node.scrollLeft =
        current.offsetLeft -
        node.offsetLeft -
        (node.clientWidth - current.clientWidth) / 2;
  }, [currentKey]);
  return (
    <ol
      ref={rail}
      tabIndex={0}
      aria-label={label}
      className={cn("workflow-pipeline", className)}
    >
      {stages.map((stage) => {
        const semantic = pipelineSemantic(stage, domain);
        const Icon =
          stage.position === "current" && semantic === "inactive"
            ? MinusCircle
            : stage.position === "current" && semantic === "failed"
              ? CircleX
              : stage.position === "current" && semantic === "blocked"
                ? CircleAlert
                : icons[stage.position];
        const isCurrent = ["current", "blocked", "failed"].includes(
          stage.position,
        );
        return (
          <li
            key={stage.key}
            data-position={stage.position}
            data-semantic={pipelineSemantic(stage, domain)}
            aria-current={isCurrent ? "step" : undefined}
            className={cn(
              "workflow-stage status-surface",
              `status-${pipelineSemantic(stage, domain)}`,
            )}
          >
            <div className="workflow-stage-heading">
              <Icon size={14} aria-hidden="true" />
              <span>{stage.label}</span>
            </div>
            <span className="workflow-stage-position">
              {stage.detail ?? positions[stage.position]}
              {isCurrent && stage.status
                ? ` · ${statusLabel(stage.status)}`
                : ""}
            </span>
            {stage.href && (
              <Link className="btn-secondary mt-3" href={stage.href}>
                Continue <ArrowRight size={14} aria-hidden="true" />
              </Link>
            )}
          </li>
        );
      })}
    </ol>
  );
}
