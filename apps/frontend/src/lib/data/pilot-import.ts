export const importColumns = [
  "propertyName",
  "propertyCode",
  "address",
  "city",
  "propertyType",
  "buildingName",
  "buildingCode",
  "floorName",
  "floorLevel",
  "unitCode",
  "unitType",
  "monthlyRentMinor",
  "depositMinor",
  "openingBalanceMinor",
  "tenantFirstName",
  "tenantLastName",
  "tenantPhone",
  "tenancyStart",
  "tenancyEnd",
] as const;
export const pilotCsvTemplate =
  importColumns.join(",") +
  "\nAcacia Court,ACACIA,Kilimani,Nairobi,APARTMENT,Block A,A,Ground Floor,0,A01,TWO_BEDROOM,2500000,0,0,,,,,\n";
export function parsePilotCsv(text: string): Record<string, unknown>[] {
  if (text.length > 1500000)
    throw new Error("CSV is too large; import up to 500 units per batch.");
  const lines: string[][] = [];
  let row: string[] = [],
    cell = "",
    quoted = false,
    closedQuote = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (closedQuote && c !== "," && c !== "\n" && c !== "\r")
      throw new Error("Malformed CSV content after a closing quote.");
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (quoted || cell === "") {
        closedQuote = quoted;
        quoted = !quoted;
      }
      else throw new Error("Malformed CSV quote.");
    } else if (!quoted && (c === "," || c === "\n")) {
      row.push(cell);
      cell = "";
      closedQuote = false;
      if (c === "\n") {
        lines.push(row);
        row = [];
      }
    } else if (c !== "\r" || quoted) cell += c;
  }
  if (quoted) throw new Error("CSV has an unclosed quote.");
  if (cell || row.length) {
    row.push(cell);
    lines.push(row);
  }
  const header = lines.shift()?.map((v) => v.replace(/^\uFEFF/, "").trim());
  if (!header || header.join(",") !== importColumns.join(","))
    throw new Error("Use the supplied column template in its original order.");
  const numbers = new Set([
    "floorLevel",
    "monthlyRentMinor",
    "depositMinor",
    "openingBalanceMinor",
  ]);
  return lines
    .filter((r) => r.some((v) => v.trim()))
    .map((r, index) => {
      if (r.length !== header.length)
        throw new Error(`Row ${index + 2} has the wrong number of columns.`);
      const result: Record<string, unknown> = {};
      header.forEach((key, i) => {
        const value = r[i]?.trim() ?? "";
        if (value) result[key] = numbers.has(key) ? Number(value) : value;
      });
      return result;
    });
}
