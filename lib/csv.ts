function escapeCell(v: unknown, sep: string): string {
  if (v === null || v === undefined) return "";
  let s = String(v);
  // Formula-injection guard for spreadsheet apps: a leading =, +, or @ in
  // user-entered text (item names, notes) would execute when opened in Excel.
  if (/^[=+@]/.test(s)) s = `'${s}`;
  if (s.includes(sep) || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function toCsv(headers: string[], rows: unknown[][], sep = ","): string {
  const lines = [headers.map((h) => escapeCell(h, sep)).join(sep)];
  for (const row of rows) {
    lines.push(row.map((c) => escapeCell(c, sep)).join(sep));
  }
  return lines.join("\r\n") + "\r\n";
}

export function csvResponse(filename: string, csv: string): Response {
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
