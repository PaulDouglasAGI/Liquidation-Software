function escapeCell(v: unknown, sep: string): string {
  if (v === null || v === undefined) return "";
  let s = String(v);
  // Formula-injection guard for spreadsheet apps. A leading =, +, -, @, tab or
  // CR is treated as a formula by Excel and Sheets and would execute on open.
  //
  // A plain number is exempt: "-24.50" is a negative amount, not a formula,
  // and escaping it put a stray apostrophe through every P&L export. Only
  // text that merely STARTS like a number ("-2+3") still gets quoted.
  const isPlainNumber = /^-?\d+(\.\d+)?$/.test(s);
  if (!isPlainNumber && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
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
