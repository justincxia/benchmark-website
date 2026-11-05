// Minimal RFC 4180 CSV parser: quoted fields, doubled quotes, embedded commas and newlines,
// LF or CRLF line endings. The stimulus CSVs quote option text that contains commas, so a
// plain split(',') is not enough. Pure.

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let i = 0;
  if (text.charCodeAt(0) === 0xfeff) i = 1; // BOM

  for (; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  if (quoted) throw new Error('CSV ends inside a quoted field');
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  // Drop blank lines (a lone empty field).
  return rows.filter((r) => !(r.length === 1 && r[0].trim() === ''));
}

/** Header + records keyed by column name. Every record must have exactly as many fields as
 *  the header; a ragged row is a corrupt file, not something to guess about. */
export function parseCsvRecords(text: string): { header: string[]; records: Record<string, string>[] } {
  const rows = parseCsv(text);
  if (rows.length === 0) throw new Error('CSV is empty');
  const header = rows[0].map((h) => h.trim());
  const records = rows.slice(1).map((r, idx) => {
    if (r.length !== header.length) {
      throw new Error(`CSV row ${idx + 2} has ${r.length} fields, header has ${header.length}`);
    }
    const rec: Record<string, string> = {};
    header.forEach((h, k) => (rec[h] = r[k].trim()));
    return rec;
  });
  return { header, records };
}
