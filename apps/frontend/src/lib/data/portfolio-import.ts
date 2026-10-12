import { parseCsvTable } from "./pilot-import";

export const portfolioColumns = [
  ["propertyName", "Property name"],
  ["propertyCode", "Property code"],
  ["address", "Address"],
  ["city", "City"],
  ["country", "Country"],
  ["propertyType", "Property category"],
  ["buildingName", "Building name"],
  ["buildingCode", "Building code"],
  ["floorName", "Floor name"],
  ["floorLevel", "Floor level"],
  ["unitCode", "Unit code"],
  ["unitType", "Unit category"],
  ["unitTypeLabel", "Custom unit category"],
  ["monthlyRentMinor", "Monthly rent (KES)"],
  ["occupancyStatus", "Occupancy status"],
  ["tenantFirstName", "Tenant first name"],
  ["tenantLastName", "Tenant last name"],
  ["tenantPhone", "Tenant phone"],
  ["tenantEmail", "Tenant email"],
  ["tenancyStart", "Tenancy start"],
  ["tenancyEnd", "Tenancy end"],
  ["depositMinor", "Deposit (KES)"],
  ["openingBalanceMinor", "Opening balance (KES)"],
  ["caretakerFirstName", "Caretaker first name"],
  ["caretakerLastName", "Caretaker last name"],
  ["caretakerPhone", "Caretaker phone"],
  ["caretakerEmail", "Caretaker email"],
] as const;
export type PortfolioRow = Record<string, string | number | boolean | null>;
export const moneyColumns = new Set([
  "monthlyRentMinor",
  "depositMinor",
  "openingBalanceMinor",
]);
const numericColumns = new Set(["floorLevel", ...moneyColumns]);
const normal = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
const aliases = new Map(
  portfolioColumns.flatMap(
    ([key, label]) =>
      [
        [normal(key), { key, major: false }],
        [normal(label), { key, major: moneyColumns.has(key) }],
      ] as Array<[string, { key: string; major: boolean }]>,
  ),
);
for (const [header, key] of [
  ["rent", "monthlyRentMinor"],
  ["monthlyrent", "monthlyRentMinor"],
  ["deposit", "depositMinor"],
  ["openingbalance", "openingBalanceMinor"],
] as const)
  aliases.set(header, { key, major: true });
export function parseKesMinor(value: string | number) {
  const text = String(value)
    .trim()
    .replace(/^KES\s*/i, "");
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(text))
    throw new Error(
      "Use a non-negative KES amount with at most two decimal places.",
    );
  const parts = text.replaceAll(",", "").split("."),
    result = Number(parts[0]) * 100 + Number((parts[1] ?? "").padEnd(2, "0"));
  if (!Number.isSafeInteger(result) || result > 10000000000)
    throw new Error("Rent amount is too large.");
  return result;
}
export function mapPortfolioTable(table: unknown[][]) {
  const [header, ...values] = table;
  if (!header?.length) throw new Error("The file has no column headers.");
  const used = new Set<string>();
  const mapping = header.map((value) => {
    const title = String(value ?? "").trim();
    if (!title) return null;
    const match = aliases.get(normal(title));
    if (!match)
      throw new Error(
        'Unrecognized column "' + title + '". Rename it using the template.',
      );
    if (used.has(match.key))
      throw new Error("Two columns map to " + match.key + ". Keep only one.");
    used.add(match.key);
    return { ...match, title };
  });
  for (const required of [
    "propertyName",
    "propertyCode",
    "address",
    "city",
    "unitCode",
    "unitType",
    "monthlyRentMinor",
  ])
    if (!used.has(required))
      throw new Error("Missing required column: " + required);
  const nonempty = values.filter((row) =>
    row.some(
      (value) =>
        value !== undefined && value !== null && String(value).trim() !== "",
    ),
  );
  if (nonempty.length === 0)
    throw new Error("Add at least one unit below the headers.");
  if (nonempty.length > 5000)
    throw new Error(
      "Import up to 5,000 units per file, processed in batches of 500.",
    );
  const rows: PortfolioRow[] = nonempty.map((cells, index) => {
    if (
      cells.length > header.length &&
      cells.slice(header.length).some((value) => String(value ?? "").trim())
    )
      throw new Error("Row " + (index + 2) + " has extra columns.");
    const row: PortfolioRow = {};
    mapping.forEach((column, i) => {
      if (!column) return;
      const raw = cells[i];
      if (raw === undefined || raw === null || String(raw).trim() === "")
        return;
      const value =
        raw instanceof Date
          ? raw.toISOString().slice(0, 10)
          : String(raw).trim();
      if (column.major) {
        try {
          row[column.key] = parseKesMinor(value);
        } catch {
          row[column.key] = value;
        }
      } else if (numericColumns.has(column.key))
        row[column.key] = Number(value);
      else if (column.key === "tenantPhone" || column.key === "caretakerPhone")
        row[column.key] = value.replace(/^'/, "");
      else if (
        ["propertyType", "unitType", "occupancyStatus"].includes(column.key)
      )
        row[column.key] = value.toUpperCase().replace(/[ -]/g, "_");
      else row[column.key] = value;
    });
    row.buildingName ??= "Site";
    row.buildingCode ??= "SITE";
    row.floorName ??= "Ground floor";
    row.floorLevel ??= 0;
    return row;
  });
  return {
    rows,
    mapping: mapping.filter(
      (entry): entry is NonNullable<typeof entry> => entry !== null,
    ),
  };
}
export function parsePortfolioCsv(text: string) {
  return mapPortfolioTable(parseCsvTable(text, 5000000));
}
export async function readPortfolioFile(file: File) {
  if (file.size > 5000000) throw new Error("Use a file smaller than 5 MB.");
  if (file.name.toLowerCase().endsWith(".csv"))
    return parsePortfolioCsv(await file.text());
  if (!file.name.toLowerCase().endsWith(".xlsx"))
    throw new Error("Choose an .xlsx or .csv file.");
  const { default: ExcelJS } = await import("exceljs"),
    workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());
  const sheet =
    workbook.getWorksheet("Units") ??
    workbook.worksheets.find(
      (item) => !["Instructions", "Lists"].includes(item.name),
    );
  if (!sheet || sheet.actualRowCount > 5001 || sheet.actualColumnCount > 50)
    throw new Error(
      "Use one unit sheet with at most 5,000 rows and 50 columns.",
    );
  const table: unknown[][] = [];
  sheet.eachRow({ includeEmpty: true }, (row) => {
    const cells: unknown[] = [];
    for (let col = 1; col <= sheet.actualColumnCount; col++) {
      const value = row.getCell(col).value;
      if (
        value !== null &&
        typeof value === "object" &&
        !(value instanceof Date)
      )
        throw new Error(
          "Formula, hyperlink or embedded object cells are not accepted. Paste values only.",
        );
      cells.push(value);
    }
    table.push(cells);
  });
  return mapPortfolioTable(table);
}
export async function portfolioWorkbook() {
  const { default: ExcelJS } = await import("exceljs"),
    workbook = new ExcelJS.Workbook();
  workbook.creator = "Dapinni";
  workbook.subject = "Private portfolio onboarding template";
  const units = workbook.addWorksheet("Units", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  units.addRow(portfolioColumns.map(([, label]) => label));
  units.getRow(1).height = 32;
  units.getRow(1).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF17191C" },
    };
    cell.alignment = { wrapText: true, vertical: "middle" };
  });
  units.columns.forEach((column, index) => {
    column.width = Math.max(
      18,
      Math.min(28, portfolioColumns[index]![1].length + 3),
    );
    column.numFmt = moneyColumns.has(portfolioColumns[index]![0])
      ? "#,##0.00"
      : "@";
  });
  units.getColumn(10).numFmt = "0";
  units.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: portfolioColumns.length },
  };
  const instructions = workbook.addWorksheet("Instructions");
  instructions.columns = [{ width: 28 }, { width: 100 }];
  instructions.addRow([
    "DAPINNI PORTFOLIO IMPORT",
    "Fill the Units sheet. This workbook contains no example customer records.",
  ]);
  instructions.addRow([
    "Review before confirmation",
    "Upload, validate, correct the flagged rows, then confirm. Every batch of 500 is atomic; repeat the same upload to resume.",
  ]);
  instructions.addRow([
    "Required columns",
    "Property name/code, address, city, unit code/category and monthly rent. Amounts are KES, not cents.",
  ]);
  instructions.addRow([
    "No buildings or floors",
    "Leave building/floor columns empty for a standalone site; Site / Ground floor / level 0 will be used.",
  ]);
  instructions.addRow([
    "Current occupied units",
    "Provide OCCUPIED, tenant first/last name, international phone, email and current tenancy start. Future/ended leases use the tenancy workflow.",
  ]);
  instructions.addRow([
    "Tenant and caretaker email",
    "Required while SMS is unavailable. Imported contacts remain unverified until their own OTP succeeds.",
  ]);
  instructions.addRow([
    "Opening balances",
    "Use confirmed balances from your records. The import creates no provider payment and infers no collected revenue.",
  ]);
  instructions.addRow([
    "Optional caretaker",
    "Repeat the same caretaker contact on the relevant rows. Scope is limited to those properties/buildings. Existing unrelated accounts cannot be attached.",
  ]);
  instructions.addRow([
    "Occupancy status",
    "VACANT, OCCUPIED, RESERVED or UNAVAILABLE. A current tenancy requires OCCUPIED.",
  ]);
  instructions.addRow([
    "Unit categories",
    "SINGLE_ROOM, BEDSITTER, STUDIO, ONE_BEDROOM, TWO_BEDROOM, THREE_PLUS_BEDROOM, FOUR_BEDROOM, FIVE_PLUS_BEDROOM, MAISONETTE, SHOP, OFFICE, RETAIL, COMMERCIAL_UNIT, OTHER. Supply a custom name for OTHER.",
  ]);
  instructions.addRow([
    "Property categories",
    "APARTMENT, RESIDENTIAL_ESTATE, COMMERCIAL, MIXED_USE, OFFICE, RETAIL, WAREHOUSE, OTHER.",
  ]);
  instructions.addRow([
    "Dates and phone numbers",
    "Use YYYY-MM-DD and international phones such as +254700000000. Do not use formulas or hyperlinks.",
  ]);
  instructions.addRow([
    "Existing properties",
    "Use their exact saved codes and details. Matching buildings/floors are reused; units and existing contacts are never silently overwritten.",
  ]);
  instructions.addRow([
    "Privacy",
    "This file is for your private workspace. Do not add credentials or unrelated personal information.",
  ]);
  for (const [key, label] of portfolioColumns)
    instructions.addRow([label, "Server field: " + key]);
  instructions.getRow(1).font = {
    bold: true,
    color: { argb: "FF9C4A20" },
    size: 14,
  };
  instructions.eachRow((row) => {
    row.alignment = { wrapText: true, vertical: "top" };
    row.height = 42;
  });
  const buffer = await workbook.xlsx.writeBuffer();
  return new Uint8Array(buffer).buffer;
}
export function downloadPortfolioCsv() {
  const blob = new Blob(
    [portfolioColumns.map(([, label]) => label).join(",") + "\n"],
    { type: "text/csv" },
  );
  downloadBlob(blob, "dapinni-portfolio-template.csv");
}
export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob),
    anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}
