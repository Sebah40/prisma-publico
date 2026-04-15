/**
 * Queries para las páginas de drill-down.
 * Cada función recibe filtros y devuelve datos detallados.
 */

import { getPool } from "./db";
import { EMPRESAS } from "./privacy";


export interface ProveedorEnRango {
  cuit: string;
  razon_social: string;
  monto_promedio: number;
  total_adjudicado: number;
  cantidad_contratos: number;
  jurisdicciones_distintas: number;
}

export interface ContratoDetalle {
  numero_procedimiento: string;
  saf_desc: string;
  tipo_procedimiento: string;
  ejercicio: number;
  fecha_adjudicacion: string | null;
  cuit_proveedor: string;
  proveedor_desc: string;
  monto: number;
  monto_ajustado: number;
}

export interface CruceDetalle {
  proveedor: string;
  cuit: string;
  organismo: string;
  contratos: number;
  monto_total: number;
  primer_contrato: string | null;
  ultimo_contrato: string | null;
  ejercicios: number[];
}

/** Proveedores cuyo monto promedio cae en un rango */
export async function getProveedoresEnRango(
  minMonto: number, maxMonto: number, limit = 50
): Promise<ProveedorEnRango[]> {
  const pool = getPool();

    const { rows } = await pool.query(`
      SELECT cuit, razon_social,
        total_adjudicado / NULLIF(cantidad_contratos, 0) as monto_promedio,
        total_adjudicado, cantidad_contratos, jurisdicciones_distintas
      FROM proveedores
      WHERE cantidad_contratos > 0
        AND total_adjudicado / NULLIF(cantidad_contratos, 0) BETWEEN $1 AND $2
        AND ${EMPRESAS.cuit}
      ORDER BY total_adjudicado DESC
      LIMIT $3
    `, [minMonto, maxMonto, limit]);
    return rows as ProveedorEnRango[];
}

/** Contratos de un tipo de procedimiento */
export async function getContratosPorProcedimiento(
  tipo: string, limit = 100
): Promise<ContratoDetalle[]> {
  const pool = getPool();

    const { rows } = await pool.query(`
      SELECT numero_procedimiento, saf_desc, tipo_procedimiento,
        ejercicio, fecha_adjudicacion, cuit_proveedor, proveedor_desc,
        monto, monto_ajustado
      FROM adjudicaciones_historicas
      WHERE tipo_procedimiento ILIKE $1
      ORDER BY monto_ajustado DESC
      LIMIT $2
    `, [`%${tipo}%`, limit]);
    return rows as ContratoDetalle[];
}

/** Detalle del cruce proveedor×organismo */
export async function getCruceProveedorOrganismo(
  cuit?: string, organismo?: string, limit = 50
): Promise<CruceDetalle[]> {
  const pool = getPool();

    let where = `WHERE ${EMPRESAS.proveedor}`;
    const params: (string | number)[] = [];
    if (cuit) { params.push(cuit); where += ` AND cuit_proveedor = $${params.length}`; }
    if (organismo) { params.push(`%${organismo}%`); where += ` AND saf_desc ILIKE $${params.length}`; }
    params.push(limit);

    const { rows } = await pool.query(`
      SELECT proveedor_desc as proveedor, cuit_proveedor as cuit, saf_desc as organismo,
        COUNT(*) as contratos, SUM(monto_ajustado) as monto_total,
        MIN(fecha_adjudicacion::text) as primer_contrato,
        MAX(fecha_adjudicacion::text) as ultimo_contrato,
        array_agg(DISTINCT ejercicio ORDER BY ejercicio) as ejercicios
      FROM adjudicaciones_historicas
      ${where}
      GROUP BY proveedor_desc, cuit_proveedor, saf_desc
      ORDER BY monto_total DESC
      LIMIT $${params.length}
    `, params);
    return rows as CruceDetalle[];
}

/** Contratos de un mes específico */
export async function getContratosPorMes(
  mes: string, limit = 100
): Promise<ContratoDetalle[]> {
  const pool = getPool();

    const { rows } = await pool.query(`
      SELECT numero_procedimiento, saf_desc, tipo_procedimiento,
        ejercicio, fecha_adjudicacion, cuit_proveedor, proveedor_desc,
        monto, monto_ajustado
      FROM adjudicaciones_historicas
      WHERE to_char(fecha_adjudicacion, 'YYYY-MM') = $1
      ORDER BY monto_ajustado DESC
      LIMIT $2
    `, [mes, limit]);
    return rows as ContratoDetalle[];
}

/** Co-ocurrencia: detalle de dos proveedores que comparten organismos */
export async function getCoocurrenciaDetalle(
  cuit1: string, cuit2: string
): Promise<{ organismo: string; meses: string[]; monto1: number; monto2: number }[]> {
  const pool = getPool();

    const { rows } = await pool.query(`
      WITH a1 AS (
        SELECT saf_desc, to_char(COALESCE(fecha_adjudicacion, (ejercicio::text || '-06-01')::date), 'YYYY-MM') as mes, SUM(monto_ajustado) as monto
        FROM adjudicaciones_historicas WHERE cuit_proveedor = $1 AND moneda = 'ARS'
        GROUP BY saf_desc, mes
      ),
      a2 AS (
        SELECT saf_desc, to_char(COALESCE(fecha_adjudicacion, (ejercicio::text || '-06-01')::date), 'YYYY-MM') as mes, SUM(monto_ajustado) as monto
        FROM adjudicaciones_historicas WHERE cuit_proveedor = $2 AND moneda = 'ARS'
        GROUP BY saf_desc, mes
      )
      SELECT a1.saf_desc as organismo,
        array_agg(DISTINCT a1.mes ORDER BY a1.mes) as meses,
        SUM(a1.monto) as monto1, SUM(a2.monto) as monto2
      FROM a1 JOIN a2 ON a1.saf_desc = a2.saf_desc AND a1.mes = a2.mes
      GROUP BY a1.saf_desc
      ORDER BY SUM(a1.monto) + SUM(a2.monto) DESC
    `, [cuit1, cuit2]);
    return rows as { organismo: string; meses: string[]; monto1: number; monto2: number }[];
}
