/**
 * Cliente para la API de Presupuesto Abierto (SITIF).
 *
 * Reglas:
 * - Un request a la vez. Nunca en paralelo.
 * - Delay entre requests para no ametrallar el servidor.
 * - La API acepta POST, requiere Authorization header, responde CSV.
 */

const SITIF_BASE = "https://www.presupuestoabierto.gob.ar/api/v1";
const REQUEST_DELAY_MS = 2000;

type Endpoint = "credito" | "recurso" | "pef" | "transversal_financiero";

interface SITIFRequestBody {
  columns: string[];
}

// Columnas que pedimos para el Daily Pulse (crédito a nivel programa)
export const CREDITO_COLUMNS = [
  "ejercicio_presupuestario",
  "jurisdiccion_id",
  "jurisdiccion_desc",
  "entidad_id",
  "entidad_desc",
  "programa_id",
  "programa_desc",
  "credito_presupuestado",
  "credito_vigente",
  "credito_devengado",
  "credito_pagado",
  "ultima_actualizacion_fecha",
] as const;

export interface CreditoRow {
  ejercicio_presupuestario: number;
  jurisdiccion_id: number;
  jurisdiccion_desc: string;
  entidad_id: number | null;
  entidad_desc: string | null;
  programa_id: number;
  programa_desc: string;
  credito_presupuestado: number;
  credito_vigente: number;
  credito_devengado: number;
  credito_pagado: number;
  ultima_actualizacion_fecha: string;
}

function getToken(): string {
  const token = process.env.PRESUPUESTO_API_TOKEN;
  if (!token) throw new Error("PRESUPUESTO_API_TOKEN not set");
  return token;
}

/**
 * Parsea CSV a array de objetos. La API devuelve CSV con header.
 * Maneja BOM y campos con comas entre comillas.
 */
function parseCSV(csv: string): Record<string, string>[] {
  // Remove BOM
  const clean = csv.replace(/^\uFEFF/, "");
  const lines = clean.split("\n").filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];

  const headers = parseCSVLine(lines[0]);
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = values[j] ?? "";
    }
    rows.push(row);
  }

  return rows;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        result.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
  }
  result.push(current.trim());
  return result;
}

function toNumber(val: string): number {
  if (!val || val === "") return 0;
  return parseFloat(val) || 0;
}

function toNullableNumber(val: string): number | null {
  if (!val || val === "") return null;
  const n = parseFloat(val);
  return isNaN(n) ? null : n;
}

/**
 * Hace un request a un endpoint de SITIF.
 * Retorna el CSV crudo.
 */
async function fetchEndpoint(
  endpoint: Endpoint,
  body: SITIFRequestBody
): Promise<string> {
  const res = await fetch(`${SITIF_BASE}/${endpoint}`, {
    method: "POST",
    headers: {
      Authorization: getToken(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`SITIF ${endpoint} ${res.status}: ${text}`);
  }

  return res.text();
}

/**
 * Delay para no ametrallar el servidor.
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Obtiene los datos de crédito a nivel programa para el ejercicio actual.
 * Un solo request. Parsea CSV a objetos tipados.
 */
export async function fetchCredito(): Promise<CreditoRow[]> {
  const csv = await fetchEndpoint("credito", {
    columns: [...CREDITO_COLUMNS],
  });

  const raw = parseCSV(csv);

  return raw.map((r) => ({
    ejercicio_presupuestario: toNumber(r.ejercicio_presupuestario),
    jurisdiccion_id: toNumber(r.jurisdiccion_id),
    jurisdiccion_desc: r.jurisdiccion_desc || "",
    entidad_id: toNullableNumber(r.entidad_id),
    entidad_desc: r.entidad_desc || null,
    programa_id: toNumber(r.programa_id),
    programa_desc: r.programa_desc || "",
    credito_presupuestado: toNumber(r.credito_presupuestado),
    credito_vigente: toNumber(r.credito_vigente),
    credito_devengado: toNumber(r.credito_devengado),
    credito_pagado: toNumber(r.credito_pagado),
    ultima_actualizacion_fecha: r.ultima_actualizacion_fecha || "",
  }));
}

/**
 * Obtiene datos de todos los endpoints secuencialmente.
 * Respeta el delay entre requests.
 */
export async function fetchAllEndpoints(): Promise<{
  credito: CreditoRow[];
}> {
  // Por ahora solo crédito — los demás se suman cuando se necesiten
  const credito = await fetchCredito();
  await delay(REQUEST_DELAY_MS);
  return { credito };
}
