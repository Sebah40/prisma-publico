/**
 * Nexo de Poder — Queries para el dashboard de cruce CNE × COMPR.AR.
 * Todo en pesos ajustados (Feb 2026).
 */

import { getPool } from "./db";
import { EMPRESAS } from "./privacy";


// --- Types ---

export interface NexoPoint {
  cuit: string;
  nombre: string;
  total_aportado: number;
  total_aportado_ajustado: number;
  total_adjudicado: number;
  total_adjudicado_ajustado: number;
  ratio: number;
  contratos: number;
  partidos: string[];
  jurisdicciones: number;
  primer_aporte: number;
  primer_contrato: number;
}

export interface NexoTimeline {
  fecha: string;
  tipo: "aporte" | "contrato";
  monto: number;
  monto_ajustado: number;
  detalle: string;
  partido?: string;
  saf?: string;
}

export interface NexoJurisdiccion {
  saf_desc: string;
  monto_total: number;
  monto_ajustado: number;
  contratos: number;
}

export interface NexoKPIs {
  inversion_total: number;
  retorno_promedio: number;
  nodo_mayor_cuit: string;
  nodo_mayor_nombre: string;
  nodo_mayor_ratio: number;
  total_coincidencias: number;
}

// --- Queries ---

export async function getNexoPoints(): Promise<NexoPoint[]> {
  const pool = getPool();

    const { rows } = await pool.query(`
      SELECT
        a.cuit_donante as cuit,
        MAX(a.nombre_donante) as nombre,
        array_agg(DISTINCT a.partido_politico) as partidos,
        SUM(a.monto_aporte) as total_aportado,
        SUM(a.monto_ajustado) as total_aportado_ajustado,
        p.total_adjudicado,
        p.cantidad_contratos as contratos,
        p.jurisdicciones_distintas as jurisdicciones,
        MIN(a.eleccion_anio) as primer_aporte,
        (SELECT MIN(ejercicio) FROM adjudicaciones_historicas WHERE cuit_proveedor = a.cuit_donante) as primer_contrato
      FROM aportes_campania a
      INNER JOIN proveedores p ON a.cuit_donante = p.cuit AND p.cantidad_contratos > 0
      WHERE ${EMPRESAS.donante}
      GROUP BY a.cuit_donante, p.total_adjudicado, p.cantidad_contratos, p.jurisdicciones_distintas
      ORDER BY p.total_adjudicado DESC
    `);

    // Get adjusted adjudicado totals
    const cuits = rows.map((r: Record<string, unknown>) => String(r.cuit));
    const { rows: adjTotals } = await pool.query(`
      SELECT cuit_proveedor, SUM(monto_ajustado) as total_ajustado
      FROM adjudicaciones_historicas
      WHERE cuit_proveedor = ANY($1) AND moneda = 'ARS' AND ${EMPRESAS.proveedor}
      GROUP BY cuit_proveedor
    `, [cuits]);

    const adjMap = new Map(adjTotals.map((r: Record<string, unknown>) => [String(r.cuit_proveedor), Number(r.total_ajustado)]));

    return rows.map((r: Record<string, unknown>) => {
      const aportadoAdj = Number(r.total_aportado_ajustado);
      const adjudicadoAdj = adjMap.get(String(r.cuit)) || Number(r.total_adjudicado);
      return {
        cuit: String(r.cuit),
        nombre: String(r.nombre),
        total_aportado: Number(r.total_aportado),
        total_aportado_ajustado: aportadoAdj,
        total_adjudicado: Number(r.total_adjudicado),
        total_adjudicado_ajustado: adjudicadoAdj,
        ratio: aportadoAdj > 0 ? adjudicadoAdj / aportadoAdj : 0,
        contratos: Number(r.contratos),
        partidos: (r.partidos as string[]) || [],
        jurisdicciones: Number(r.jurisdicciones),
        primer_aporte: Number(r.primer_aporte) || 0,
        primer_contrato: Number(r.primer_contrato) || 0,
      };
    });
}

export async function getNexoTimeline(cuit: string): Promise<NexoTimeline[]> {
  const pool = getPool();

    const { rows: aportes } = await pool.query(`
      SELECT fecha_aporte, monto_aporte, monto_ajustado, partido_politico, eleccion_anio
      FROM aportes_campania WHERE cuit_donante = $1
      ORDER BY fecha_aporte ASC
    `, [cuit]);

    const { rows: contratos } = await pool.query(`
      SELECT fecha_adjudicacion, monto, monto_ajustado, saf_desc, ejercicio
      FROM adjudicaciones_historicas WHERE cuit_proveedor = $1
      ORDER BY fecha_adjudicacion ASC
    `, [cuit]);

    const timeline: NexoTimeline[] = [];

    for (const a of aportes) {
      timeline.push({
        fecha: a.fecha_aporte ? new Date(a.fecha_aporte).toISOString().slice(0, 10) : `${a.eleccion_anio}-06-01`,
        tipo: "aporte",
        monto: Number(a.monto_aporte),
        monto_ajustado: Number(a.monto_ajustado),
        detalle: String(a.partido_politico),
        partido: String(a.partido_politico),
      });
    }

    for (const c of contratos) {
      timeline.push({
        fecha: c.fecha_adjudicacion ? new Date(c.fecha_adjudicacion).toISOString().slice(0, 10) : `${c.ejercicio}-06-01`,
        tipo: "contrato",
        monto: Number(c.monto),
        monto_ajustado: Number(c.monto_ajustado),
        detalle: String(c.saf_desc),
        saf: String(c.saf_desc),
      });
    }

    return timeline.sort((a, b) => a.fecha.localeCompare(b.fecha));
}

export async function getNexoJurisdicciones(cuit: string): Promise<NexoJurisdiccion[]> {
  const pool = getPool();

    const { rows } = await pool.query(`
      SELECT saf_desc, SUM(monto) as monto_total, SUM(monto_ajustado) as monto_ajustado, COUNT(*) as contratos
      FROM adjudicaciones_historicas WHERE cuit_proveedor = $1 AND moneda = 'ARS'
      GROUP BY saf_desc ORDER BY monto_ajustado DESC
    `, [cuit]);
    return rows.map((r: Record<string, unknown>) => ({
      saf_desc: String(r.saf_desc),
      monto_total: Number(r.monto_total),
      monto_ajustado: Number(r.monto_ajustado),
      contratos: Number(r.contratos),
    }));
}

export async function getNexoKPIs(): Promise<NexoKPIs> {
  const pool = getPool();

    // Get aggregates
    const { rows: cruces } = await pool.query(`
      SELECT
        a.cuit_donante,
        MAX(a.nombre_donante) as nombre,
        SUM(a.monto_ajustado) as aportado,
        p.total_adjudicado as adjudicado
      FROM aportes_campania a
      JOIN proveedores p ON a.cuit_donante = p.cuit AND p.cantidad_contratos > 0
      WHERE ${EMPRESAS.donante}
      GROUP BY a.cuit_donante, p.total_adjudicado
    `);

    const total = cruces.length;
    const inversionTotal = cruces.reduce((s: number, r: Record<string, unknown>) => s + Number(r.aportado), 0);
    const ratios = cruces
      .filter((r: Record<string, unknown>) => Number(r.aportado) > 0)
      .map((r: Record<string, unknown>) => Number(r.adjudicado) / Number(r.aportado));
    const retornoPromedio = ratios.length > 0 ? ratios.reduce((s: number, v: number) => s + v, 0) / ratios.length : 0;

    // Find max ratio
    let nodo = { cuit: "", nombre: "", ratio: 0 };
    for (const r of cruces) {
      const ap = Number(r.aportado);
      if (ap <= 0) continue;
      const ratio = Number(r.adjudicado) / ap;
      if (ratio > nodo.ratio) {
        nodo = { cuit: String(r.cuit_donante), nombre: String(r.nombre), ratio };
      }
    }

    const kpi = { total, inversion_total: inversionTotal, retorno_promedio: retornoPromedio, nodo_cuit: nodo.cuit, nodo_nombre: nodo.nombre, nodo_ratio: nodo.ratio };
    return {
      total_coincidencias: Number(kpi.total),
      inversion_total: Number(kpi.inversion_total),
      retorno_promedio: Number(kpi.retorno_promedio),
      nodo_mayor_cuit: String(kpi.nodo_cuit || ""),
      nodo_mayor_nombre: String(kpi.nodo_nombre || ""),
      nodo_mayor_ratio: Number(kpi.nodo_ratio || 0),
    };
}
