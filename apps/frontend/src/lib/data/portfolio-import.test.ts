import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import {
  mapPortfolioTable,
  parseKesMinor,
  parsePortfolioCsv,
  portfolioColumns,
  portfolioWorkbook,
  readPortfolioFile,
} from "./portfolio-import";
import { parseSignupContext, signupHref } from "../acquisition";
const table = [
  [
    "Unit code",
    "City",
    "Monthly rent (KES)",
    "Property code",
    "Unit category",
    "Address",
    "Property name",
  ],
  [
    "A1",
    "Nairobi",
    "12,500.25",
    "ACACIA",
    "ONE_BEDROOM",
    "Test Road",
    "Acacia",
  ],
];
describe("customer portfolio spreadsheet boundary", () => {
  it("maps reordered headers, exact KES and a flat site without inventing tenants", () => {
    const result = mapPortfolioTable(table);
    expect(result.rows[0]).toMatchObject({
      unitCode: "A1",
      monthlyRentMinor: 1250025,
      buildingCode: "SITE",
      floorLevel: 0,
    });
    expect(result.rows[0]).not.toHaveProperty("tenantFirstName");
  });
  it.each(["0", "0.01", "12500.25", "KES 1,234.50"])(
    "accepts exact nonnegative KES %s",
    (value) => expect(Number.isSafeInteger(parseKesMinor(value))).toBe(true),
  );
  it.each(["-1", "12.345", "1e5", "NaN", "12,34", "999999999999999"])(
    "rejects unsafe amount %s",
    (value) => expect(() => parseKesMinor(value)).toThrow(),
  );
  it("keeps an invalid row editable without losing valid rows", () => {
    const result = mapPortfolioTable([
      ...table,
      ["A2", "Nairobi", "12.345", "ACACIA", "STUDIO", "Test Road", "Acacia"],
    ]);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[1]?.monthlyRentMinor).toBe("12.345");
  });
  it("rejects ambiguous, unknown, missing headers and oversized tables", () => {
    expect(() =>
      mapPortfolioTable([["Property code", "propertyCode"]]),
    ).toThrow("Two columns");
    expect(() => mapPortfolioTable([["password"]])).toThrow("Unrecognized");
    expect(() => mapPortfolioTable([["Property code"], ["A"]])).toThrow(
      "Missing",
    );
    expect(() =>
      mapPortfolioTable([
        table[0]!,
        ...Array.from({ length: 5001 }, () => table[1]!),
      ]),
    ).toThrow("5,000");
  });
  it("supports quoted CSV values and CRLF", () => {
    const csv =
      table[0]!.join(",") +
      '\r\nA1,Nairobi,"12,500.25",ACACIA,ONE_BEDROOM,"Road, Nairobi",Acacia\r\n';
    expect(parsePortfolioCsv(csv).rows[0]).toMatchObject({
      address: "Road, Nairobi",
      monthlyRentMinor: 1250025,
    });
  });
  it("round trips the empty downloadable Excel workbook with customer data", async () => {
    const data = await portfolioWorkbook(),
      book = new ExcelJS.Workbook();
    await book.xlsx.load(data);
    const units = book.getWorksheet("Units")!;
    expect(units.actualRowCount).toBe(1);
    expect(units.getRow(1).values).toEqual([
      undefined,
      ...portfolioColumns.map(([, label]) => label),
    ]);
    expect(book.getWorksheet("Instructions")).toBeDefined();
    const values: Record<string, string | number> = {
      propertyName: "Acacia",
      propertyCode: "ACACIA",
      address: "Test Road",
      city: "Nairobi",
      unitCode: "A1",
      unitType: "ONE_BEDROOM",
      monthlyRentMinor: 12500.25,
    };
    units.addRow(portfolioColumns.map(([key]) => values[key] ?? ""));
    const buffer = await book.xlsx.writeBuffer();
    const file = {
      name: "customer.xlsx",
      size: buffer.byteLength,
      arrayBuffer: async () => buffer,
    } as unknown as File;
    expect((await readPortfolioFile(file)).rows[0]).toMatchObject({
      propertyName: "Acacia",
      monthlyRentMinor: 1250025,
      buildingCode: "SITE",
    });
  });
  it("rejects spreadsheet formulas and hyperlinks before preview", async () => {
    for (const value of [
      { formula: "1+2", result: 3 },
      { text: "click", hyperlink: "https://example.com" },
    ]) {
      const book = new ExcelJS.Workbook(),
        sheet = book.addWorksheet("Units");
      sheet.addRow(table[0]!);
      sheet.addRow([value, ...table[1]!.slice(1)]);
      const buffer = await book.xlsx.writeBuffer();
      await expect(
        readPortfolioFile({
          name: "unsafe.xlsx",
          size: buffer.byteLength,
          arrayBuffer: async () => buffer,
        } as unknown as File),
      ).rejects.toThrow("Formula");
    }
  });
});
describe("plan handoff", () => {
  it("preserves the validated chosen plan and commercial estimate", () => {
    const context = parseSignupContext(
      "?plan=FORT_KNOX&units=120&months=6&source=PUBLIC_DEMO",
    );
    expect(parseSignupContext(signupHref(context).split("?")[1]!)).toEqual(
      context,
    );
  });
  it("bounds untrusted plan context and never treats it as paid authority", () => {
    expect(
      parseSignupContext("?plan=ADMIN&units=-1&months=1&source=ATTACKER"),
    ).toEqual({
      planKey: "CONTROL",
      unitCount: 5,
      prepaidMonths: 3,
      source: "WEBSITE",
    });
  });
});
