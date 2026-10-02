import { describe, it, expect } from "vitest";
import { semanticDemoStatus } from "./sales-demo";
import { parsePilotCsv, pilotCsvTemplate } from "./pilot-import";
import { canPresentRoute } from "../navigation";
describe("sales and guided pilot UX contracts", () => {
  it.each([
    ["PAID", "success"],
    ["COMPLETED", "success"],
    ["IN_PROGRESS", "active"],
    ["OVERDUE", "danger"],
    ["CRITICAL", "danger"],
    ["APPROVAL_REQUIRED", "attention"],
    ["NEW", "attention"],
  ])("labels %s with an explicit semantic state", (state, tone) => {
    expect(semanticDemoStatus(state).tone).toBe(tone);
    expect(semanticDemoStatus(state).label.length).toBeGreaterThan(0);
  });
  it("maps domain states into clear pending and approval labels", () => {
    expect(semanticDemoStatus("NEW").label).toBe("PENDING");
    expect(semanticDemoStatus("APPROVAL_REQUIRED").label).toBe(
      "AWAITING APPROVAL",
    );
  });
  it("parses the downloadable template with correct numeric cents", () => {
    const row = parsePilotCsv(pilotCsvTemplate)[0];
    expect(row?.monthlyRentMinor).toBe(2500000);
    expect(row?.unitCode).toBe("A01");
  });
  it("supports quoted commas, rejects wrong columns and malformed quotes", () => {
    expect(
      parsePilotCsv(
        pilotCsvTemplate.replace("Acacia Court", '"Acacia, Court"'),
      )[0]?.propertyName,
    ).toBe("Acacia, Court");
    expect(() => parsePilotCsv("wrong\nrow")).toThrow();
    expect(() => parsePilotCsv(pilotCsvTemplate + '"unterminated')).toThrow();
    expect(() =>
      parsePilotCsv(pilotCsvTemplate.replace("Acacia Court", '"Acacia"Court')),
    ).toThrow("closing quote");
  });
  it("allows delegated sellers and authorized pilot roles while keeping tenant sales unavailable", () => {
    expect(
      canPresentRoute("PROPERTY_MANAGER", "/sales-demo", ["sales.demo.manage"]),
    ).toBe(true);
    expect(canPresentRoute("TENANT", "/sales-demo", [])).toBe(false);
    expect(canPresentRoute("LANDLORD", "/pilot", [])).toBe(true);
  });
});
