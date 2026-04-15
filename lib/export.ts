/**
 * Exportación de evidencia para periodistas.
 * Funciona client-side — genera y descarga el archivo.
 */

export function exportCSV(data: Record<string, unknown>[], filename: string) {
  if (data.length === 0) return;
  const headers = Object.keys(data[0]);
  const rows = data.map((row) =>
    headers.map((h) => {
      const val = row[h];
      const str = val == null ? "" : String(val);
      return str.includes(",") || str.includes('"')
        ? `"${str.replace(/"/g, '""')}"`
        : str;
    }).join(",")
  );
  const csv = [headers.join(","), ...rows].join("\n");
  download(csv, `${filename}.csv`, "text/csv");
}

export function exportJSON(data: unknown, filename: string) {
  const json = JSON.stringify(data, null, 2);
  download(json, `${filename}.json`, "application/json");
}

function download(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
