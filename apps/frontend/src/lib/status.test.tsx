import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { renderToStaticMarkup } from "react-dom/server";
import { Badge, StatusBadge, StatusSelect, Alert } from "@/components/ui";
import { WorkflowPipeline } from "@/components/workflow-pipeline";
import {
  statusSemantic,
  statusGroups,
  statusDomains,
  statusLabel,
  orderedWorkflow,
  lifecycleWorkflow,
  maintenanceWorkflow,
  pipelineSemantic,
  type StatusDomain,
  type WorkflowStage,
} from "./status";

describe("domain-aware status semantics", () => {
  it.each([
    ["CHANNEL", "auth", "pending"],
    ["PAYMENT_FAILED", "onboarding", "failed"],
    ["CHECKOUT_PREPARATION_FAILED", "onboarding", "failed"],
    ["PAYMENT_RECONCILIATION_REQUIRED", "onboarding", "review"],
    ["RENEWAL_REQUIRES_ATTENTION", "onboarding", "attention"],
    ["ACTIVE", "subscription", "success"],
    ["ACTIVE", "integration", "success"],
    ["ACTIVE", "alert", "attention"],
    ["ACTIVE", "payment", "processing"],
    ["ACTIVE", "incident", "attention"],
    ["OPEN", "rent", "pending"],
    ["OPEN", "incident", "attention"],
    ["OPEN", "period", "success"],
    ["PENDING", "approval", "review"],
    ["PENDING", "payment", "pending"],
    ["NEW", "inventory", "success"],
    ["NEW", "maintenance", "pending"],
    ["ARCHIVED", "entity", "archived"],
    ["MOVED_OUT", "tenancy", "archived"],
    ["TERMINATED", "tenancy", "inactive"],
    ["SUSPENDED", "entity", "paused"],
    ["QUOTED", "maintenance", "review"],
    ["RECONCILED", "sales", "completed"],
    ["OFFLINE", "integration", "blocked"],
    ["MISSING", "integration", "neutral"],
    ["MISSING", "inventory", "blocked"],
    ["DEGRADED", "monitoring", "attention"],
    ["DISABLED", "serving", "inactive"],
    ["ACTIVE", "serving", "processing"],
    ["SUBMISSION_UNKNOWN", "refund", "attention"],
    ["Review Required", "document", "review"],
    ["PARTIALLY_PAID", "rent", "attention"],
  ])("%s in %s maps to %s", (value, domain, semantic) =>
    expect(statusSemantic(value, domain as StatusDomain)).toBe(semantic),
  );
  it("keeps unknown and missing states neutral without losing their label", () => {
    expect(statusSemantic("NEW_VENDOR_STATE")).toBe("neutral");
    expect(statusLabel("NEW_VENDOR_STATE")).toBe("NEW VENDOR STATE");
    expect(statusLabel(undefined)).toBe("UNKNOWN");
    expect(statusSemantic(undefined)).toBe("neutral");
  });
  it("preserves the shared Badge API and native filter values", () => {
    expect(
      renderToStaticMarkup(<Badge tone="green">Append-only evidence</Badge>),
    ).toContain("status-success");
    const html = renderToStaticMarkup(
      <StatusSelect
        domain="approval"
        value="PENDING"
        onChange={() => {}}
        aria-label="Approval status"
      >
        <option value="PENDING">Pending</option>
        <option value="APPROVED">Approved</option>
      </StatusSelect>,
    );
    expect(html).toContain('data-semantic="review"');
    expect(html).toContain('value="PENDING" selected');
    expect(html).toContain('aria-label="Approval status"');
  });
  it("renders readable labels and decorative icons with explicit domain metadata", () => {
    const html = renderToStaticMarkup(
      <StatusBadge status="APPROVAL_REQUIRED" domain="maintenance" />,
    );
    expect(html).toContain("APPROVAL REQUIRED");
    expect(html).toContain('data-semantic="review"');
    expect(html).toContain('aria-hidden="true"');
    expect(html).not.toContain('role="alert"');
  });
  it("covers persisted backend lifecycle enums without editing contracts", () => {
    const known = new Set<string>(Object.values(statusGroups).flat());
    ["NEW", "PARTIALLY_PAID", "SHADOW", "OFF"].forEach((value) =>
      known.add(value),
    );
    for (const values of Object.values(statusDomains))
      Object.keys(values).forEach((value) => known.add(value));
    const directory = resolve(process.cwd(), "../backend/src/database/models"),
      unknown: string[] = [];
    let count = 0;
    for (const file of readdirSync(directory).filter((file) =>
      file.endsWith(".ts"),
    )) {
      const source = ts.createSourceFile(
        file,
        readFileSync(resolve(directory, file), "utf8"),
        ts.ScriptTarget.Latest,
        true,
      );
      function walk(node: ts.Node) {
        if (
          ts.isPropertyAssignment(node) &&
          /^(status|state|stage|condition|overallCondition|grade|mode|decision|severity|renewalState|deliveryStatus|labelStatus|driftStatus|performanceStatus|overallStatus|recommendation)$/.test(
            node.name.getText(source),
          ) &&
          ts.isObjectLiteralExpression(node.initializer)
        ) {
          const entry = node.initializer.properties.find(
            (entry) =>
              ts.isPropertyAssignment(entry) &&
              entry.name.getText(source) === "enum",
          );
          if (
            entry &&
            ts.isPropertyAssignment(entry) &&
            ts.isArrayLiteralExpression(entry.initializer)
          )
            for (const value of entry.initializer.elements) {
              if (ts.isStringLiteral(value)) {
                count++;
                if (!known.has(value.text))
                  unknown.push(file + ": " + value.text);
              }
            }
        }
        ts.forEachChild(node, walk);
      }
      walk(source);
    }
    expect(count).toBeGreaterThan(200);
    expect(unknown).toEqual([]);
  });
});
describe("workflow progression", () => {
  it.each([
    [{ status: "NEW", approvalRequired: false }, "upcoming"],
    [
      { status: "APPROVED", approvalRequired: false, quoteAmount: 2500 },
      "skipped",
    ],
    [
      {
        status: "APPROVAL_REQUIRED",
        approvalRequired: true,
        quoteAmount: 18000,
      },
      "current",
    ],
  ] as const)(
    "only skips an approval branch after quotation proves the policy outcome: %j",
    (record, expected) => {
      expect(
        maintenanceWorkflow(record).find(
          (stage) => stage.key === "APPROVAL_REQUIRED",
        )?.position,
      ).toBe(expected);
    },
  );
  it("marks only the current stage current, with muted future stages", () => {
    const stages = orderedWorkflow(
      ["Draft", "Review", "Approval", "Active"],
      1,
      "UNDER_REVIEW",
    );
    expect(stages.map((stage) => stage.position)).toEqual([
      "completed",
      "current",
      "upcoming",
      "upcoming",
    ]);
    const html = renderToStaticMarkup(<WorkflowPipeline stages={stages} />);
    expect(html.match(/aria-current="step"/g)).toHaveLength(1);
    expect(html).toContain("Current stage");
    expect(html).toContain("Upcoming");
    expect(html).toContain("Completed");
  });
  it("preserves skipped approval paths and does not infer history after cancellation", () => {
    const stages = lifecycleWorkflow(
      ["NEW", "APPROVAL_REQUIRED", "IN_PROGRESS", "CLOSED"],
      "IN_PROGRESS",
      ["APPROVAL_REQUIRED"],
    );
    expect(stages.map((stage) => stage.position)).toEqual([
      "completed",
      "skipped",
      "current",
      "upcoming",
    ]);
    const cancelled = lifecycleWorkflow(
      ["NEW", "IN_PROGRESS", "CLOSED"],
      "CANCELLED",
    );
    expect(
      cancelled.filter((stage) => stage.position === "completed"),
    ).toHaveLength(0);
    expect(pipelineSemantic(cancelled.at(-1)!, "maintenance")).toBe("inactive");
    expect(
      renderToStaticMarkup(<WorkflowPipeline stages={cancelled} />),
    ).toContain("History not inferred");
  });
  it("keeps blocked and failed stages explicit and retains a next action link", () => {
    const stages: WorkflowStage[] = [
      { key: "1", label: "Invoice", position: "completed" },
      { key: "2", label: "Verification", status: "FAILED", position: "failed" },
      {
        key: "3",
        label: "Activation",
        position: "upcoming",
        href: "/onboarding",
      },
    ];
    const html = renderToStaticMarkup(<WorkflowPipeline stages={stages} />);
    expect(html).toContain('data-position="failed"');
    expect(html).toContain('data-semantic="failed"');
    expect(html).toContain('href="/onboarding"');
    expect(
      pipelineSemantic({ ...stages[1]!, position: "blocked" }, "payment"),
    ).toBe("blocked");
  });
});
function luminance(hex: string): number {
  const values = hex
    .match(/[a-f\d]{2}/gi)!
    .map((v) => parseInt(v, 16) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return values[0]! * 0.2126 + values[1]! * 0.7152 + values[2]! * 0.0722;
}
describe("themed visual tokens", () => {
  const css = readFileSync(
    resolve(process.cwd(), "src/app/globals.css"),
    "utf8",
  );
  it.each(Object.keys(statusGroups))(
    "%s text meets 4.5:1 in light and dark themes",
    (semantic) => {
      const backgrounds = [
        ...css.matchAll(
          new RegExp("--status-" + semantic + "-bg: (#[a-f\\d]{6})", "gi"),
        ),
      ].map((match) => match[1]!);
      const texts = [
        ...css.matchAll(
          new RegExp("--status-" + semantic + "-text: (#[a-f\\d]{6})", "gi"),
        ),
      ].map((match) => match[1]!);
      expect(backgrounds).toHaveLength(2);
      for (let i = 0; i < 2; i++) {
        const a = luminance(backgrounds[i]!),
          b = luminance(texts[i]!);
        expect(
          (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05),
        ).toBeGreaterThanOrEqual(4.5);
      }
    },
  );
  it("creates the real component fixture for browser geometry and computed contrast checks", () => {
    const stages: WorkflowStage[] = [
      "completed",
      "current",
      "upcoming",
      "blocked",
      "failed",
      "skipped",
    ]
      .map((position, index) => ({
        key: String(index),
        label: [
          "Reported",
          "Approval review",
          "Work begins",
          "Awaiting response",
          "Provider error",
          "Cancelled branch",
        ][index]!,
        status: index === 1 ? "APPROVAL_REQUIRED" : undefined,
        position: position as WorkflowStage["position"],
      }))
      .map(({ status, ...stage }) => ({
        ...stage,
        ...(status ? { status } : {}),
      }));
    const html = renderToStaticMarkup(
      <main style={{ padding: 16, maxWidth: 1400, margin: "auto" }}>
        <h1>Status and workflow verification</h1>
        <section className="card" style={{ padding: 16 }}>
          <WorkflowPipeline label="All pipeline positions" stages={stages} />
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 12,
              marginTop: 24,
            }}
          >
            {Object.entries(statusGroups).map(([key, values]) => (
              <StatusBadge key={key} status={values[0]}>
                {key} · {values[0]}
              </StatusBadge>
            ))}
            <StatusBadge
              style={{ maxWidth: 160 }}
              status="PENDING_SIGNATURE"
              domain="contract"
            >
              Awaiting authorized signatory verification
            </StatusBadge>
          </div>
        </section>
        <section style={{ marginTop: 24 }}>
          <Alert tone="warning">Approval needs attention</Alert>
          <Alert tone="destructive">Payment verification failed</Alert>
          <Alert tone="success">Repair completed with evidence</Alert>
        </section>
      </main>,
    );
    mkdirSync(resolve(process.cwd(), "test-results"), { recursive: true });
    writeFileSync(
      resolve(process.cwd(), "test-results/status-components.html"),
      "<style>" +
        css
          .replace(/@import[^;]+;/g, "")
          .replace(/@theme inline \{[\s\S]*?\}/, "") +
        "</style>" +
        html,
    );
    expect(html).toContain("All pipeline positions");
  });
});
