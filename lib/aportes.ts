/**
 * Módulo de Aportes de Campaña — Cruce CNE × COMPR.AR
 *
 * Muestra coincidencias temporales entre donaciones políticas
 * y adjudicaciones del Estado. Sin emitir juicio — solo datos y fechas.
 */

import { getSupabase, isSupabaseConfigured } from "./supabase";
import { adjustForInflation, toYearMonth } from "./inflation";
import { getPool } from "./db";

// --- Types ---

export interface AporteCampania {
  id: number;
  cuit_donante: string;
  nombre_donante: string;
  partido_politico: string;
  agrupacion: string | null;
  distrito: string | null;
  eleccion_anio: number;
  eleccion_tipo: string | null;
  monto_aporte: number;
  tipo_aporte: string;
  fecha_aporte: string | null;
}

export interface VinculacionPolitica {
  cuit: string;
  razon_social: string;
  aportes: AporteCampania[];
  total_aportado: number;
  total_adjudicado: number;
  partidos: string[];
  timeline: TimelineEvent[];
}

export interface TimelineEvent {
  fecha: string;
  tipo: "aporte" | "contrato";
  descripcion: string;
  monto: number;
  monto_real: number; // ajustado por inflación
  partido?: string;
  saf?: string;
}

export interface CoincidenciaFinanciamiento {
  cuit: string;
  razon_social: string;
  total_aportado: number;
  total_adjudicado: number;
  ratio: number; // adjudicado / aportado
  primer_aporte_anio: number;
  primer_contrato_anio: number;
  dias_entre: number | null;
  partidos: string[];
  jurisdicciones: number;
}

// --- Queries ---

/**
 * Obtiene la vinculación política completa de un CUIT.
 * Timeline cronológica de aportes + contratos.
 */
export async function getVinculacionPolitica(
  cuit: string
): Promise<VinculacionPolitica | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = getSupabase();

  // Aportes de este CUIT
  const { data: aportes } = await supabase
    .from("aportes_campania")
    .select("*")
    .eq("cuit_donante", cuit)
    .order("eleccion_anio", { ascending: true });

  // Adjudicaciones de este CUIT
  const { data: contratos } = await supabase
    .from("adjudicaciones_historicas")
    .select("fecha_adjudicacion, saf_desc, monto, moneda, ejercicio")
    .eq("cuit_proveedor", cuit)
    .order("fecha_adjudicacion", { ascending: true });

  // Proveedor info
  const { data: prov } = await supabase
    .from("proveedores")
    .select("razon_social, total_adjudicado")
    .eq("cuit", cuit)
    .limit(1);

  const aportesTyped = (aportes ?? []) as AporteCampania[];
  const contratosTyped = (contratos ?? []) as { fecha_adjudicacion: string | null; saf_desc: string; monto: number; moneda: string; ejercicio: number }[];
  const provData = (prov as { razon_social: string; total_adjudicado: number }[] | null)?.[0];

  if (aportesTyped.length === 0 && contratosTyped.length === 0) return null;

  // Build timeline
  const timeline: TimelineEvent[] = [];

  for (const a of aportesTyped) {
    const fecha = a.fecha_aporte || `${a.eleccion_anio}-06-01`;
    const montoReal = await adjustForInflation(
      a.monto_aporte,
      toYearMonth(fecha)
    );
    timeline.push({
      fecha,
      tipo: "aporte",
      descripcion: `Aporte a ${a.partido_politico}${a.agrupacion ? ` (${a.agrupacion})` : ""}`,
      monto: a.monto_aporte,
      monto_real: montoReal,
      partido: a.partido_politico,
    });
  }

  for (const c of contratosTyped) {
    const fecha = c.fecha_adjudicacion || `${c.ejercicio}-06-01`;
    const montoReal = c.moneda === "USD"
      ? c.monto // USD stays as-is
      : await adjustForInflation(c.monto, toYearMonth(fecha));
    timeline.push({
      fecha,
      tipo: "contrato",
      descripcion: `Contrato en ${c.saf_desc}`,
      monto: c.monto,
      monto_real: montoReal,
      saf: c.saf_desc,
    });
  }

  timeline.sort((a, b) => a.fecha.localeCompare(b.fecha));

  const totalAportado = aportesTyped.reduce((s, a) => s + a.monto_aporte, 0);
  const partidos = [...new Set(aportesTyped.map((a) => a.partido_politico))];

  return {
    cuit,
    razon_social: provData?.razon_social ?? "",
    aportes: aportesTyped,
    total_aportado: totalAportado,
    total_adjudicado: provData?.total_adjudicado ?? 0,
    partidos,
    timeline,
  };
}

/**
 * Detecta coincidencias de financiamiento via SQL directo.
 * El cruce se hace en la DB, no en JS.
 */
export async function getCoincidencias(
  limit = 30
): Promise<CoincidenciaFinanciamiento[]> {
  if (!isSupabaseConfigured()) return [];

  const pool = getPool();

    const { rows } = await pool.query(`
      SELECT
        a.cuit_donante as cuit,
        MAX(a.nombre_donante) as razon_social,
        array_agg(DISTINCT a.partido_politico) as partidos,
        SUM(a.monto_aporte) as total_aportado,
        p.total_adjudicado,
        p.cantidad_contratos,
        p.jurisdicciones_distintas,
        MIN(a.eleccion_anio) as primer_aporte_anio,
        MIN(ah.ejercicio) as primer_contrato_anio
      FROM aportes_campania a
      INNER JOIN proveedores p ON a.cuit_donante = p.cuit AND p.cantidad_contratos > 0
      LEFT JOIN LATERAL (
        SELECT ejercicio FROM adjudicaciones_historicas
        WHERE cuit_proveedor = a.cuit_donante
        ORDER BY ejercicio ASC LIMIT 1
      ) ah ON true
      GROUP BY a.cuit_donante, p.total_adjudicado, p.cantidad_contratos, p.jurisdicciones_distintas
      ORDER BY p.total_adjudicado DESC
      LIMIT $1
    `, [limit]);

    return rows.map((r: Record<string, unknown>) => ({
      cuit: String(r.cuit),
      razon_social: String(r.razon_social),
      total_aportado: Number(r.total_aportado),
      total_adjudicado: Number(r.total_adjudicado),
      ratio: Number(r.total_aportado) > 0 ? Number(r.total_adjudicado) / Number(r.total_aportado) : 0,
      primer_aporte_anio: Number(r.primer_aporte_anio) || 0,
      primer_contrato_anio: Number(r.primer_contrato_anio) || 0,
      dias_entre: null,
      partidos: (r.partidos as string[]) || [],
      jurisdicciones: Number(r.jurisdicciones_distintas),
    }));
}
