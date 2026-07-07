import { describe, expect, it } from "vitest";
import { toCsv } from "@/lib/csv";
import { parseCsv } from "@/lib/csvParse";

describe("toCsv", () => {
  it("quotes separators, quotes, and newlines", () => {
    const csv = toCsv(["a", "b"], [['x,y', 'he said "hi"'], ["line1\nline2", "bare\rcr"]]);
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe("a,b");
    expect(lines[1]).toBe('"x,y","he said ""hi"""');
    expect(csv).toContain('"line1\nline2"');
    expect(csv).toContain('"bare\rcr"');
  });

  it("guards spreadsheet formula injection", () => {
    const csv = toCsv(["name"], [["=HYPERLINK(evil)"], ["+SUM(A1)"], ["@cmd"], ["-5"]]);
    expect(csv).toContain("'=HYPERLINK(evil)");
    expect(csv).toContain("'+SUM(A1)");
    expect(csv).toContain("'@cmd");
    expect(csv).toContain("\r\n-5\r\n"); // negative numbers untouched
  });

  it("renders null/undefined as empty cells", () => {
    expect(toCsv(["a", "b"], [[null, undefined]])).toBe("a,b\r\n,\r\n");
  });
});

describe("parseCsv", () => {
  it("handles quoted fields, escaped quotes, and CRLF", () => {
    const rows = parseCsv('name,qty\r\n"DeWalt, 20V ""MAX""",3\r\nplain,1\r\n');
    expect(rows).toEqual([
      ["name", "qty"],
      ['DeWalt, 20V "MAX"', "3"],
      ["plain", "1"],
    ]);
  });

  it("handles newlines inside quoted fields", () => {
    const rows = parseCsv('a,b\n"multi\nline",2');
    expect(rows).toEqual([
      ["a", "b"],
      ["multi\nline", "2"],
    ]);
  });

  it("drops fully-empty trailing rows", () => {
    expect(parseCsv("a,b\n1,2\n\n \n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("round-trips with toCsv", () => {
    const rows = [["SKU", "note"], ["ITM-1", 'has "quotes", commas\nand newlines']];
    const parsed = parseCsv(toCsv(rows[0], [rows[1]]));
    expect(parsed).toEqual(rows);
  });
});
