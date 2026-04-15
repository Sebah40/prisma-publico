/**
 * Queries de patrones — agrega datos de adjudicaciones para mostrar
 * indicadores factuales. No interpreta, no puntúa — muestra.
 */

import { getPool } from "./db";
import { EMPRESAS } from "./privacy";

// --- Types ---

export interface PatronCUIT {
  cuit: string;
  razon_social: string;
  total_adjudicado: number;
  total_adjudicado_ajustado?: number;
  cantidad_contratos: number;
  anios_activo: number;
  jurisdicciones_distintas: number;
  indicadores: string[]; // factuales: "Recurrente", "Concentrado", etc.
}

export interface PatronJurisdiccion {
  saf_id: number;
  saf_desc: string;
  total_contratos: number;
  total_directas: number;
  pct_directas: number;
  total_monto: number;
  proveedores_unicos: number;
}

export interface ContratoDetalle {
  id: number;
  numero_procedimiento: string;
  saf_desc: string;
  tipo_procedimiento: string;
  ejercicio: number;
  fecha_adjudicacion: string | null;
  cuit_proveedor: string;
  proveedor_desc: string;
  monto: number;
  moneda: string;
}

// --- Queries ---

/**
 * Top CUITs por monto total adjudicado.
 */
export async function getTopProveedores(limit = 20): Promise<PatronCUIT[]> {
  const pool = getPool();
  const { rows } = await pool.query(`
    SELECT cuit, razon_social, total_adjudicado, total_adjudicado_ajustado,
           cantidad_contratos, anios_activo, jurisdicciones_distintas
    FROM proveedores WHERE cantidad_contratos > 0 AND ${EMPRESAS.cuit}
    ORDER BY total_adjudicado_ajustado DESC LIMIT $1
  `, [limit]);

  return (rows as PatronCUIT[]).map(p => ({ ...p, indicadores: buildIndicadores(p) }));
}

/**
 * CUITs recurrentes: ganaron contratos en 3+ años.
 */
export async function getRecurrentes(limit = 30): Promise<PatronCUIT[]> {
  const pool = getPool();
  const { rows } = await pool.query(`
    SELECT cuit, razon_social, total_adjudicado, cantidad_contratos, anios_activo, jurisdicciones_distintas
    FROM proveedores WHERE anios_activo >= 3 AND ${EMPRESAS.cuit}
    ORDER BY anios_activo DESC LIMIT $1
  `, [limit]);

  return (rows as PatronCUIT[]).map(p => ({ ...p, indicadores: buildIndicadores(p) }));
}

/**
 * CUITs concentrados: operan en 1 sola jurisdicción con muchos contratos.
 */
export async function getConcentrados(limit = 30): Promise<PatronCUIT[]> {
  const pool = getPool();
  const { rows } = await pool.query(`
    SELECT cuit, razon_social, total_adjudicado, cantidad_contratos, anios_activo, jurisdicciones_distintas
    FROM proveedores WHERE jurisdicciones_distintas = 1 AND cantidad_contratos >= 5 AND ${EMPRESAS.cuit}
    ORDER BY total_adjudicado DESC LIMIT $1
  `, [limit]);

  return (rows as PatronCUIT[]).map(p => ({ ...p, indicadores: buildIndicadores(p) }));
}

/**
 * CUITs diversificados: operan en 5+ jurisdicciones.
 */
export async function getDiversificados(limit = 30): Promise<PatronCUIT[]> {
  const pool = getPool();
  const { rows } = await pool.query(`
    SELECT cuit, razon_social, total_adjudicado, cantidad_contratos, anios_activo, jurisdicciones_distintas
    FROM proveedores WHERE jurisdicciones_distintas >= 5 AND ${EMPRESAS.cuit}
    ORDER BY jurisdicciones_distintas DESC LIMIT $1
  `, [limit]);

  return (rows as PatronCUIT[]).map(p => ({ ...p, indicadores: buildIndicadores(p) }));
}

/**
 * Jurisdicciones por % de contratación directa.
 */
export async function getPatronesJurisdiccion(): Promise<PatronJurisdiccion[]> {
  const pool = getPool();
  const { rows } = await pool.query(`
    SELECT saf_id, MAX(saf_desc) as saf_desc,
           COUNT(*) as total_contratos,
           COUNT(*) FILTER (WHERE tipo_procedimiento ILIKE '%directa%') as total_directas,
           SUM(monto) as total_monto,
           COUNT(DISTINCT cuit_proveedor) as proveedores_unicos
    FROM adjudicaciones_historicas WHERE moneda = 'ARS'
    GROUP BY saf_id HAVING COUNT(*) >= 5
    ORDER BY (COUNT(*) FILTER (WHERE tipo_procedimiento ILIKE '%directa%'))::float / COUNT(*) DESC
  `);

  return rows.map((r: Record<string, unknown>) => ({
    saf_id: Number(r.saf_id),
    saf_desc: String(r.saf_desc),
    total_contratos: Number(r.total_contratos),
    total_directas: Number(r.total_directas),
    pct_directas: Number(r.total_contratos) > 0 ? (Number(r.total_directas) / Number(r.total_contratos)) * 100 : 0,
    total_monto: Number(r.total_monto),
    proveedores_unicos: Number(r.proveedores_unicos),
  }));
}

/**
 * Contratos de un CUIT específico (para drill-down).
 */
export async function getContratosCUIT(cuit: string): Promise<ContratoDetalle[]> {
  const pool = getPool();
  const { rows } = await pool.query(`
    SELECT id, numero_procedimiento, saf_desc, tipo_procedimiento, ejercicio,
           fecha_adjudicacion, cuit_proveedor, proveedor_desc, monto, moneda
    FROM adjudicaciones_historicas WHERE cuit_proveedor = $1 ORDER BY monto DESC
  `, [cuit]);

  return rows as ContratoDetalle[];
}

/**
 * Timeline: contratos por mes (para detectar spikes de fin de año).
 */
export async function getTimeline(): Promise<{ month: string; count: number; monto: number; directas: number }[]> {
  const pool = getPool();
  const { rows } = await pool.query(`
    SELECT TO_CHAR(fecha_adjudicacion, 'YYYY-MM') as month,
           COUNT(*) as count, SUM(monto) as monto,
           COUNT(*) FILTER (WHERE tipo_procedimiento ILIKE '%directa%') as directas
    FROM adjudicaciones_historicas WHERE fecha_adjudicacion IS NOT NULL
    GROUP BY month ORDER BY month ASC
  `);

  return rows.map((r: Record<string, unknown>) => ({
    month: String(r.month),
    count: Number(r.count),
    monto: Number(r.monto),
    directas: Number(r.directas),
  }));
}

/**
 * % contratación directa por MONTO vs por CANTIDAD por jurisdicción.
 * Revela si los contratos grandes van por directa.
 */
export async function getDirectaPorMonto(): Promise<{ saf: string; pctDirectaCantidad: number; pctDirectaMonto: number }[]> {
  const pool = getPool();
  const { rows } = await pool.query(`
    SELECT saf_desc as saf,
           COUNT(*) as total,
           COUNT(*) FILTER (WHERE tipo_procedimiento ILIKE '%directa%') as directas,
           SUM(monto) as monto_total,
           SUM(monto) FILTER (WHERE tipo_procedimiento ILIKE '%directa%') as monto_directas
    FROM adjudicaciones_historicas WHERE moneda = 'ARS'
    GROUP BY saf_desc HAVING COUNT(*) > 0
  `);

  return rows
    .map((r: Record<string, unknown>) => ({
      saf: String(r.saf),
      pctDirectaCantidad: Number(r.total) > 0 ? (Number(r.directas) / Number(r.total)) * 100 : 0,
      pctDirectaMonto: Number(r.monto_total) > 0 ? (Number(r.monto_directas) / Number(r.monto_total)) * 100 : 0,
    }))
    .filter(d => d.pctDirectaMonto > 30 && d.pctDirectaCantidad > 0)
    .sort((a, b) => (b.pctDirectaMonto - b.pctDirectaCantidad) - (a.pctDirectaMonto - a.pctDirectaCantidad))
    .slice(0, 15);
}

// --- Helpers ---

function buildIndicadores(p: PatronCUIT): string[] {
  const tags: string[] = [];
  if (p.anios_activo >= 3) tags.push("Recurrente");
  if (p.jurisdicciones_distintas === 1 && p.cantidad_contratos >= 5) tags.push("Concentrado");
  if (p.jurisdicciones_distintas >= 5) tags.push("Diversificado");
  if (p.cantidad_contratos >= 50) tags.push("Alto volumen");
  return tags;
}
