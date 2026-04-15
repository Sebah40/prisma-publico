/**
 * Cliente para datos de COMPR.AR (CSVs bulk 2015-2020).
 *
 * Los CSVs viven en infra.datos.gob.ar y no cambian.
 * Se descargan una vez y se cargan en Supabase.
 */

import { normalizeCUIT, isValidCUIT } from "./cuit";

// URLs de adjudicaciones por año
const ADJUDICACIONES_URLS: Record<number, string> = {
  2015: "https://infra.datos.gob.ar/catalog/modernizacion/dataset/2/distribution/2.10/download/adjudicaciones-2015.csv",
  2016: "https://infra.datos.gob.ar/catalog/modernizacion/dataset/2/distribution/2.6/download/adjudicaciones-2016.csv",
  2017: "https://infra.datos.gob.ar/catalog/modernizacion/dataset/2/distribution/2.2/download/adjudicaciones-2017.csv",
  2018: "https://infra.datos.gob.ar/catalog/modernizacion/dataset/2/distribution/2.15/download/adjudicaciones-2018.csv",
  2019: "https://infra.datos.gob.ar/catalog/modernizacion/dataset/2/distribution/2.18/download/adjudicaciones-2019.csv",
  2020: "https://infra.datos.gob.ar/catalog/jgm/dataset/4/distribution/4.20/download/adjudicaciones-2020.csv",
};

const PROVEEDORES_URL =
  "https://infra.datos.gob.ar/catalog/modernizacion/dataset/2/distribution/2.11/download/proveedores.csv";

export interface AdjudicacionRaw {
  numero_procedimiento: string;
  saf_id: number;
  saf_desc: string;
  uoc_id: number | null;
  uoc_desc: string | null;
  tipo_procedimiento: string;
  modalidad: string;
  ejercicio: number;
  fecha_adjudicacion: string | null;
  rubros: string[];
  cuit_proveedor: string;
  proveedor_desc: string;
  documento_contractual: string;
  monto: number;
  moneda: string;
}

export interface ProveedorRaw {
  cuit: string;
  razon_social: string;
  tipo_personeria: string | null;
  localidad: string | null;
  provincia: string | null;
  codigo_postal: string | null;
  rubros: string[];
  fecha_inscripcion: string | null;
}

// --- CSV parsing ---

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

function parseCSV(csv: string): Record<string, string>[] {
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

function parseDate(raw: string): string | null {
  if (!raw) return null;
  // Format: "05/11/2020 12:24:00 p.m." or "05/11/2020"
  const match = raw.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!match) return null;
  return `${match[3]}-${match[2]}-${match[1]}`;
}

/**
 * Parser de fechas para el CSV legacy 2015.
 * Viene como "2015-29-10T..." (YYYY-DD-MM) o "29/10/2015".
 */
function parseDate2015(raw: string): string | null {
  if (!raw) return null;
  // Try ISO-like: "2015-29-10T..."
  const isoMatch = raw.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const [, y, a, b] = isoMatch;
    // If a > 12, it's DD-MM swapped
    if (parseInt(a) > 12) return `${y}-${b}-${a}`;
    return `${y}-${a}-${b}`;
  }
  // Try DD/MM/YYYY
  return parseDate(raw);
}

function parseRubros(raw: string): string[] {
  if (!raw) return [];
  return raw
    .split(";")
    .map((r) => r.trim())
    .filter((r) => r.length > 0);
}

// --- Public API ---

export async function fetchProveedores(): Promise<ProveedorRaw[]> {
  const res = await fetch(PROVEEDORES_URL);
  const csv = await res.text();
  const rows = parseCSV(csv);

  return rows
    .map((r) => {
      const rawCuit = r["cuit___nit"] || r["CUIT"] || "";
      const cuit = normalizeCUIT(rawCuit);
      if (!cuit || !isValidCUIT(rawCuit)) return null;

      return {
        cuit,
        razon_social: r["razon_social"] || r["Razón Social"] || "Desconocido",
        tipo_personeria: r["tipo_de_personeria"] || null,
        localidad: r["localidad"] || null,
        provincia: r["provincia"] || null,
        codigo_postal: r["codigo_postal"] || null,
        rubros: parseRubros(r["rubros"] || ""),
        fecha_inscripcion: parseDate(r["fecha_de_pre_inscripcion"] || ""),
      };
    })
    .filter((p): p is ProveedorRaw => p !== null);
}

/**
 * Resuelve un valor buscando entre múltiples nombres de columna posibles.
 * Los CSVs del gobierno cambian headers entre años.
 */
function col(row: Record<string, string>, ...keys: string[]): string {
  for (const k of keys) {
    if (row[k] !== undefined && row[k] !== "") return row[k];
  }
  return "";
}

export async function fetchAdjudicaciones(
  year: number
): Promise<AdjudicacionRaw[]> {
  const url = ADJUDICACIONES_URLS[year];
  if (!url) return [];

  const res = await fetch(url);
  const csv = await res.text();
  const rows = parseCSV(csv);

  // 2015 tiene un schema completamente distinto
  if (year === 2015) return parse2015(rows);

  return rows
    .map((r) => {
      const rawCuit = col(r, "CUIT", "cuit");
      const cuit = normalizeCUIT(rawCuit);
      if (!cuit) return null;

      const montoStr = col(r, "Monto", "monto", "monto_adjudicacion");
      const monto = parseFloat(montoStr);
      if (isNaN(monto) || monto <= 0) return null;

      const safStr = col(r, "Nro SAF", "nro_saf", "numero_SAF");
      const uocStr = col(r, "Nro UOC", "nro_uoc", "numero_UOC");

      return {
        numero_procedimiento: col(r, "Número Procedimiento", "numero_procedimiento"),
        saf_id: parseInt(safStr) || 0,
        saf_desc: col(r, "Descripcion SAF", "descripcion_saf", "descripcion_SAF"),
        uoc_id: parseInt(uocStr) || null,
        uoc_desc: col(r, "Descripcion UOC", "descripcion_uoc", "descripcion_UOC") || null,
        tipo_procedimiento: col(r, "Tipo de Procedimiento", "tipo_de_procedimiento"),
        modalidad: col(r, "Modalidad", "modalidad"),
        ejercicio: parseInt(col(r, "Ejercicio", "ejercicio") || String(year)),
        fecha_adjudicacion: parseDate(col(r, "Fecha de Adjudicación", "fecha_de_adjudicacion")),
        rubros: parseRubros(col(r, "Rubros", "rubros", "rubro_contratacion_desc")),
        cuit_proveedor: cuit,
        proveedor_desc: col(r, "Descripción Proveedor", "descripcion_proveedor", "prov_razon_social"),
        documento_contractual: col(r, "Documento Contractual", "documento_contractual") || `${year}-${rawCuit}`,
        monto,
        moneda: col(r, "Moneda", "moneda") || "Peso Argentino",
      };
    })
    .filter((a): a is AdjudicacionRaw => a !== null);
}

/**
 * Parser especial para 2015 (schema legacy completamente distinto).
 * Headers: procedimiento_id, uoc_id, uoc_int_id, uoc_desc, uoc_int_desc,
 *          proc_ejercicio, isodatetime_fecha_acto, fecha_acto,
 *          rubro_contratacion_desc, cuit, prov_razon_social, monto_adjudicacion
 */
function parse2015(rows: Record<string, string>[]): AdjudicacionRaw[] {
  return rows
    .map((r) => {
      const rawCuit = r["cuit"] || "";
      const cuit = normalizeCUIT(rawCuit);
      if (!cuit) return null;

      const monto = parseFloat(r["monto_adjudicacion"] || "0");
      if (isNaN(monto) || monto <= 0) return null;

      const uocId = parseInt(r["uoc_id"] || "0");
      return {
        numero_procedimiento: r["procedimiento_id"] || "",
        saf_id: uocId, // 2015 no tiene SAF, usamos UOC como aproximación
        saf_desc: r["uoc_desc"] || "",
        uoc_id: parseInt(r["uoc_int_id"] || "0") || null,
        uoc_desc: r["uoc_int_desc"] || null,
        tipo_procedimiento: "",
        modalidad: "",
        ejercicio: parseInt(r["proc_ejercicio"] || "2015"),
        fecha_adjudicacion: parseDate2015(r["isodatetime_fecha_acto"] || r["fecha_acto"] || ""),
        rubros: parseRubros(r["rubro_contratacion_desc"] || ""),
        cuit_proveedor: cuit,
        proveedor_desc: r["prov_razon_social"] || "",
        documento_contractual: `2015-${r["procedimiento_id"] || ""}-${rawCuit}`,
        monto,
        moneda: "Peso Argentino",
      };
    })
    .filter((a): a is AdjudicacionRaw => a !== null);
}

export function getAvailableYears(): number[] {
  return Object.keys(ADJUDICACIONES_URLS).map(Number).sort();
}
