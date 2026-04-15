/**
 * Intelligence Layer — Consultas de identidad y cruce.
 *
 * Principio: mostramos datos, no interpretamos.
 * Las etiquetas son factuales ("Recurrente" = ganó en 3+ años).
 */

import { getPool } from "./db";
import { EMPRESAS } from "./privacy";

// --- Types ---

export interface ProveedorConEtiquetas {
  cuit: string;
  razon_social: string;
  tipo_personeria: string | null;
  provincia: string | null;
  rubros: string[];
  total_adjudicado: number;
  cantidad_contratos: number;
  anios_activo: number;
  jurisdicciones_distintas: number;
  etiquetas: string[]; // Factuales: "Recurrente", "Concentrado", "Multi-rubro"
}

export interface FichaIdentidad {
  cuit: string;
  razon_social: string;
  tipo_personeria: string | null;
  localidad: string | null;
  provincia: string | null;
  rubros: string[];
  fecha_inscripcion: string | null;
  total_adjudicado: number;
  cantidad_contratos: number;
  anios_activo: number;
  jurisdicciones_distintas: number;
  orbita_principal: { jurisdiccion_id: number; jurisdiccion_desc: string; monto: number } | null;
  historial: AdjudicacionHistorica[];
  etiquetas: string[];
}

export interface AdjudicacionHistorica {
  id: number;
  numero_procedimiento: string;
  saf_id: number;
  saf_desc: string;
  tipo_procedimiento: string;
  ejercicio: number;
  fecha_adjudicacion: string | null;
  monto: number;
  monto_ajustado: number;
  moneda: string;
  rubros: string[];
  documento_contractual: string;
}

export interface ConcentracionJurisdiccion {
  jurisdiccion_id: number;
  jurisdiccion_desc: string;
  total_monto: number;
  total_contratos: number;
  top_proveedores: {
    cuit: string;
    razon_social: string;
    monto: number;
    contratos: number;
    pct_monto: number;
  }[];
}

// --- Queries ---

/**
 * Lista proveedores con etiquetas factuales, paginado.
 */
export async function getProveedores(opts: {
  search?: string;
  page?: number;
  pageSize?: number;
  orderBy?: string;
}): Promise<{ data: ProveedorConEtiquetas[]; total: number }> {
  const pool = getPool();
  const { search, page = 1, pageSize = 50, orderBy = "total_adjudicado_ajustado" } = opts;

  const allowedOrder = ["total_adjudicado_ajustado", "total_adjudicado", "cantidad_contratos", "jurisdicciones_distintas"];
  const order = allowedOrder.includes(orderBy) ? orderBy : "total_adjudicado_ajustado";
  const offset = (page - 1) * pageSize;

  let where = `cantidad_contratos > 0 AND ${EMPRESAS.cuit}`;
  const params: (string | number)[] = [];
  let paramIdx = 1;

  if (search) {
    params.push(`%${search}%`, `%${search}%`);
    where += ` AND (razon_social ILIKE $${paramIdx} OR cuit ILIKE $${paramIdx + 1})`;
    paramIdx += 2;
  }

  params.push(pageSize, offset);
  const limitParam = paramIdx;
  const offsetParam = paramIdx + 1;

  const [{ rows }, { rows: [{ n }] }] = await Promise.all([
    pool.query(`SELECT * FROM proveedores WHERE ${where} ORDER BY ${order} DESC LIMIT $${limitParam} OFFSET $${offsetParam}`, params),
    pool.query(`SELECT COUNT(*) as n FROM proveedores WHERE ${where}`, params.slice(0, paramIdx - 1)),
  ]);

  return {
    data: (rows as ProveedorConEtiquetas[]).map((r) => ({ ...r, etiquetas: computeEtiquetas(r) })),
    total: Number(n),
  };
}

/**
 * Ficha completa de un CUIT con historial de adjudicaciones.
 */
export async function getFichaIdentidad(
  cuit: string
): Promise<FichaIdentidad | null> {
  // Excluir personas físicas (Ley 25.326)
  if (/^(20|23|24|27)-/.test(cuit)) return null;

  const pool = getPool();

  const { rows: provRows } = await pool.query(
    `SELECT * FROM proveedores WHERE cuit = $1 LIMIT 1`, [cuit]
  );
  if (!provRows.length) return null;
  const p = provRows[0] as Record<string, unknown>;

  const { rows: adjRows } = await pool.query(
    `SELECT * FROM adjudicaciones_historicas WHERE cuit_proveedor = $1 ORDER BY fecha_adjudicacion DESC`, [cuit]
  );
  const historial = adjRows as AdjudicacionHistorica[];

  const orbita = await getOrbitaPrincipal(cuit);

  return {
    cuit: String(p.cuit),
    razon_social: String(p.razon_social),
    tipo_personeria: p.tipo_personeria as string | null,
    localidad: p.localidad as string | null,
    provincia: p.provincia as string | null,
    rubros: (p.rubros as string[]) ?? [],
    fecha_inscripcion: p.fecha_inscripcion as string | null,
    total_adjudicado: Number(p.total_adjudicado ?? 0),
    cantidad_contratos: Number(p.cantidad_contratos ?? 0),
    anios_activo: Number(p.anios_activo ?? 0),
    jurisdicciones_distintas: Number(p.jurisdicciones_distintas ?? 0),
    orbita_principal: orbita,
    historial,
    etiquetas: computeEtiquetas(p as unknown as ProveedorConEtiquetas),
  };
}

/**
 * Concentración: top proveedores por jurisdicción.
 */
export async function getConcentracion(
  jurisdiccionId: number
): Promise<ConcentracionJurisdiccion | null> {
  const pool = getPool();

  const { rows: safRows } = await pool.query(
    `SELECT saf_id, jurisdiccion_desc FROM map_saf_jurisdiccion WHERE jurisdiccion_id = $1`, [jurisdiccionId]
  );
  if (!safRows.length) return null;
  const safIds = safRows.map((r: Record<string, unknown>) => Number(r.saf_id));
  const jurDesc = String(safRows[0].jurisdiccion_desc);

  const { rows } = await pool.query(`
    SELECT ah.cuit_proveedor, SUM(ah.monto) as monto, COUNT(*) as contratos,
           p.razon_social
    FROM adjudicaciones_historicas ah
    JOIN proveedores p ON ah.cuit_proveedor = p.cuit
    WHERE ah.saf_id = ANY($1)
    GROUP BY ah.cuit_proveedor, p.razon_social
    ORDER BY monto DESC LIMIT 10
  `, [safIds]);

  const totalMonto = rows.reduce((s: number, r: Record<string, unknown>) => s + Number(r.monto), 0);
  const totalContratos = rows.reduce((s: number, r: Record<string, unknown>) => s + Number(r.contratos), 0);

  return {
    jurisdiccion_id: jurisdiccionId,
    jurisdiccion_desc: jurDesc,
    total_monto: totalMonto,
    total_contratos: totalContratos,
    top_proveedores: rows.map((r: Record<string, unknown>) => ({
      cuit: String(r.cuit_proveedor),
      razon_social: String(r.razon_social),
      monto: Number(r.monto),
      contratos: Number(r.contratos),
      pct_monto: totalMonto > 0 ? (Number(r.monto) / totalMonto) * 100 : 0,
    })),
  };
}

/**
 * Contratistas históricos para un SAF/jurisdicción (para el panel Nexo).
 */
export async function getContratistasJurisdiccion(
  jurisdiccionId: number,
  limit = 10
): Promise<
  { cuit: string; razon_social: string; monto: number; contratos: number; anios: number }[]
> {
  const pool = getPool();

  const { rows: safRows } = await pool.query(
    `SELECT saf_id FROM map_saf_jurisdiccion WHERE jurisdiccion_id = $1`, [jurisdiccionId]
  );
  if (!safRows.length) return [];
  const safIds = safRows.map((r: Record<string, unknown>) => Number(r.saf_id));

  const { rows } = await pool.query(`
    SELECT ah.cuit_proveedor, p.razon_social,
           SUM(ah.monto) as monto, COUNT(*) as contratos,
           COUNT(DISTINCT ah.ejercicio) as anios
    FROM adjudicaciones_historicas ah
    JOIN proveedores p ON ah.cuit_proveedor = p.cuit
    WHERE ah.saf_id = ANY($1)
    GROUP BY ah.cuit_proveedor, p.razon_social
    ORDER BY monto DESC LIMIT $2
  `, [safIds, limit]);

  return rows.map((r: Record<string, unknown>) => ({
    cuit: String(r.cuit_proveedor),
    razon_social: String(r.razon_social),
    monto: Number(r.monto),
    contratos: Number(r.contratos),
    anios: Number(r.anios),
  }));
}

// --- Helpers ---

async function getOrbitaPrincipal(cuit: string) {
  const pool = getPool();

  const { rows } = await pool.query(`
    SELECT ah.saf_id, SUM(ah.monto) as monto, m.jurisdiccion_id, m.jurisdiccion_desc
    FROM adjudicaciones_historicas ah
    LEFT JOIN map_saf_jurisdiccion m ON ah.saf_id = m.saf_id
    WHERE ah.cuit_proveedor = $1
    GROUP BY ah.saf_id, m.jurisdiccion_id, m.jurisdiccion_desc
    ORDER BY monto DESC LIMIT 1
  `, [cuit]);

  if (!rows.length || !rows[0].jurisdiccion_id) return null;
  const r = rows[0] as Record<string, unknown>;

  return {
    jurisdiccion_id: Number(r.jurisdiccion_id),
    jurisdiccion_desc: String(r.jurisdiccion_desc),
    monto: Number(r.monto),
  };
}

/**
 * Etiquetas factuales basadas en datos observables.
 */
function computeEtiquetas(p: ProveedorConEtiquetas): string[] {
  const tags: string[] = [];

  // Recurrente: ganó contratos en 3+ años distintos
  if (p.anios_activo >= 3) tags.push("Recurrente");

  // Concentrado: opera en 1 sola jurisdicción
  if (p.jurisdicciones_distintas === 1 && p.cantidad_contratos >= 3)
    tags.push("Concentrado");

  // Diversificado: opera en 5+ jurisdicciones
  if (p.jurisdicciones_distintas >= 5) tags.push("Diversificado");

  // Volumen: más de 50 contratos
  if (p.cantidad_contratos >= 50) tags.push("Alto volumen");

  return tags;
}
