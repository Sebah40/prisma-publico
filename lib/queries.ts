import { getPool } from "./db";
import type { PresupuestoDiario } from "./database.types";

export interface JurisdiccionAgregada {
  jurisdiccion_id: number;
  jurisdiccion_desc: string;
  credito_presupuestado: number;
  credito_vigente: number;
  credito_devengado: number;
  credito_pagado: number;
  programas_count: number;
  ejecucion_pct: number;
  gap_gestion: number;
  aumento_discrecional: number;
}

export interface ProgramaConMetricas extends PresupuestoDiario {
  ejecucion_pct: number;
  gap_gestion: number;
  aumento_discrecional: number;
  aumento_discrecional_pct: number;
}

/**
 * Obtiene todos los programas del snapshot más reciente.
 */
export async function getUltimoSnapshot(): Promise<PresupuestoDiario[]> {
  const pool = getPool();

  const { rows: fechas } = await pool.query(
    `SELECT fecha FROM presupuesto_diario ORDER BY fecha DESC LIMIT 1`
  );
  if (!fechas.length) return [];

  const { rows } = await pool.query(
    `SELECT * FROM presupuesto_diario WHERE fecha = $1 ORDER BY credito_vigente DESC`,
    [fechas[0].fecha]
  );
  return rows as PresupuestoDiario[];
}

/**
 * Agrega programas por jurisdicción.
 */
export function agregarPorJurisdiccion(
  programas: PresupuestoDiario[]
): JurisdiccionAgregada[] {
  const mapa = new Map<number, JurisdiccionAgregada>();

  for (const p of programas) {
    const existing = mapa.get(p.jurisdiccion_id);
    if (existing) {
      existing.credito_presupuestado += p.credito_presupuestado;
      existing.credito_vigente += p.credito_vigente;
      existing.credito_devengado += p.credito_devengado;
      existing.credito_pagado += p.credito_pagado;
      existing.programas_count += 1;
    } else {
      mapa.set(p.jurisdiccion_id, {
        jurisdiccion_id: p.jurisdiccion_id,
        jurisdiccion_desc: p.jurisdiccion_desc,
        credito_presupuestado: p.credito_presupuestado,
        credito_vigente: p.credito_vigente,
        credito_devengado: p.credito_devengado,
        credito_pagado: p.credito_pagado,
        programas_count: 1,
        ejecucion_pct: 0,
        gap_gestion: 0,
        aumento_discrecional: 0,
      });
    }
  }

  for (const j of mapa.values()) {
    j.ejecucion_pct = j.credito_vigente > 0
      ? (j.credito_pagado / j.credito_vigente) * 100
      : 0;
    j.gap_gestion = j.credito_devengado - j.credito_pagado;
    j.aumento_discrecional = j.credito_vigente - j.credito_presupuestado;
  }

  return Array.from(mapa.values()).sort(
    (a, b) => b.credito_vigente - a.credito_vigente
  );
}

/**
 * Enriquece programas con métricas calculadas.
 */
export function enriquecerProgramas(
  programas: PresupuestoDiario[]
): ProgramaConMetricas[] {
  return programas.map((p) => ({
    ...p,
    ejecucion_pct:
      p.credito_vigente > 0
        ? (p.credito_pagado / p.credito_vigente) * 100
        : 0,
    gap_gestion: p.credito_devengado - p.credito_pagado,
    aumento_discrecional: p.credito_vigente - p.credito_presupuestado,
    aumento_discrecional_pct:
      p.credito_presupuestado > 0
        ? ((p.credito_vigente - p.credito_presupuestado) /
            p.credito_presupuestado) *
          100
        : 0,
  }));
}

/**
 * Obtiene todos los snapshots de un programa para el timeline.
 */
export async function getSnapshotsPrograma(
  jurisdiccionId: number,
  entidadId: number,
  programaId: number
): Promise<PresupuestoDiario[]> {
  const pool = getPool();

  const { rows } = await pool.query(
    `SELECT * FROM presupuesto_diario WHERE jurisdiccion_id = $1 AND entidad_id = $2 AND programa_id = $3 ORDER BY fecha ASC`,
    [jurisdiccionId, entidadId, programaId]
  );
  return rows as PresupuestoDiario[];
}
