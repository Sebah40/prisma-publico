/**
 * Queries de patrones — agrega datos de adjudicaciones para mostrar
 * indicadores factuales. No interpreta, no puntúa — muestra.
 */

import { getSupabase, isSupabaseConfigured } from "./supabase";

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
  if (!isSupabaseConfigured()) return [];
  const supabase = getSupabase();

  const { data } = await supabase
    .from("proveedores")
    .select("cuit, razon_social, total_adjudicado, total_adjudicado_ajustado, cantidad_contratos, anios_activo, jurisdicciones_distintas")
    .gt("cantidad_contratos", 0)
    .or('cuit.like.30-%,cuit.like.33-%,cuit.like.34-%')
    .order("total_adjudicado_ajustado", { ascending: false })
    .limit(limit);

  return ((data ?? []) as PatronCUIT[]).map(p => ({
    ...p,
    indicadores: buildIndicadores(p),
  }));
}

/**
 * CUITs recurrentes: ganaron contratos en 3+ años.
 */
export async function getRecurrentes(limit = 30): Promise<PatronCUIT[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = getSupabase();

  const { data } = await supabase
    .from("proveedores")
    .select("cuit, razon_social, total_adjudicado, cantidad_contratos, anios_activo, jurisdicciones_distintas")
    .gte("anios_activo", 3)
    .or('cuit.like.30-%,cuit.like.33-%,cuit.like.34-%')
    .order("anios_activo", { ascending: false })
    .limit(limit);

  return ((data ?? []) as PatronCUIT[]).map(p => ({
    ...p,
    indicadores: buildIndicadores(p),
  }));
}

/**
 * CUITs concentrados: operan en 1 sola jurisdicción con muchos contratos.
 */
export async function getConcentrados(limit = 30): Promise<PatronCUIT[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = getSupabase();

  const { data } = await supabase
    .from("proveedores")
    .select("cuit, razon_social, total_adjudicado, cantidad_contratos, anios_activo, jurisdicciones_distintas")
    .eq("jurisdicciones_distintas", 1)
    .gte("cantidad_contratos", 5)
    .or('cuit.like.30-%,cuit.like.33-%,cuit.like.34-%')
    .order("total_adjudicado", { ascending: false })
    .limit(limit);

  return ((data ?? []) as PatronCUIT[]).map(p => ({
    ...p,
    indicadores: buildIndicadores(p),
  }));
}

/**
 * CUITs diversificados: operan en 5+ jurisdicciones.
 */
export async function getDiversificados(limit = 30): Promise<PatronCUIT[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = getSupabase();

  const { data } = await supabase
    .from("proveedores")
    .select("cuit, razon_social, total_adjudicado, cantidad_contratos, anios_activo, jurisdicciones_distintas")
    .gte("jurisdicciones_distintas", 5)
    .or('cuit.like.30-%,cuit.like.33-%,cuit.like.34-%')
    .order("jurisdicciones_distintas", { ascending: false })
    .limit(limit);

  return ((data ?? []) as PatronCUIT[]).map(p => ({
    ...p,
    indicadores: buildIndicadores(p),
  }));
}

/**
 * Jurisdicciones por % de contratación directa.
 */
export async function getPatronesJurisdiccion(): Promise<PatronJurisdiccion[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = getSupabase();

  const { data } = await supabase
    .from("adjudicaciones_historicas")
    .select("saf_id, saf_desc, tipo_procedimiento, monto, cuit_proveedor, moneda")
    .eq("moneda", "ARS");

  if (!data?.length) return [];

  const mapa = new Map<number, {
    saf_desc: string;
    total: number;
    directas: number;
    monto: number;
    proveedores: Set<string>;
  }>();

  for (const row of data as { saf_id: number; saf_desc: string; tipo_procedimiento: string; monto: number; cuit_proveedor: string; moneda: string }[]) {
    const e = mapa.get(row.saf_id) ?? {
      saf_desc: row.saf_desc,
      total: 0, directas: 0, monto: 0,
      proveedores: new Set(),
    };
    e.total++;
    if (row.tipo_procedimiento?.toLowerCase().includes('directa')) e.directas++;
    e.monto += Number(row.monto);
    e.proveedores.add(row.cuit_proveedor);
    mapa.set(row.saf_id, e);
  }

  return Array.from(mapa.entries())
    .map(([saf_id, e]) => ({
      saf_id,
      saf_desc: e.saf_desc,
      total_contratos: e.total,
      total_directas: e.directas,
      pct_directas: e.total > 0 ? (e.directas / e.total) * 100 : 0,
      total_monto: e.monto,
      proveedores_unicos: e.proveedores.size,
    }))
    .filter(j => j.total_contratos >= 5)
    .sort((a, b) => b.pct_directas - a.pct_directas);
}

/**
 * Contratos de un CUIT específico (para drill-down).
 */
export async function getContratosCUIT(cuit: string): Promise<ContratoDetalle[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = getSupabase();

  const { data } = await supabase
    .from("adjudicaciones_historicas")
    .select("id, numero_procedimiento, saf_desc, tipo_procedimiento, ejercicio, fecha_adjudicacion, cuit_proveedor, proveedor_desc, monto, moneda")
    .eq("cuit_proveedor", cuit)
    .order("monto", { ascending: false });

  return (data ?? []) as ContratoDetalle[];
}

/**
 * Timeline: contratos por mes (para detectar spikes de fin de año).
 */
export async function getTimeline(): Promise<{ month: string; count: number; monto: number; directas: number }[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = getSupabase();

  const { data } = await supabase
    .from("adjudicaciones_historicas")
    .select("fecha_adjudicacion, tipo_procedimiento, monto");

  if (!data?.length) return [];

  const mapa = new Map<string, { count: number; monto: number; directas: number }>();

  for (const row of data as { fecha_adjudicacion: string | null; tipo_procedimiento: string; monto: number }[]) {
    const fecha = row.fecha_adjudicacion;
    if (!fecha) continue;
    const month = fecha.substring(0, 7); // "2020-03"
    const e = mapa.get(month) ?? { count: 0, monto: 0, directas: 0 };
    e.count++;
    e.monto += Number(row.monto);
    if (row.tipo_procedimiento?.toLowerCase().includes("directa")) e.directas++;
    mapa.set(month, e);
  }

  return Array.from(mapa.entries())
    .map(([month, e]) => ({ month, ...e }))
    .sort((a, b) => a.month.localeCompare(b.month));
}

/**
 * % contratación directa por MONTO vs por CANTIDAD por jurisdicción.
 * Revela si los contratos grandes van por directa.
 */
export async function getDirectaPorMonto(): Promise<{ saf: string; pctDirectaCantidad: number; pctDirectaMonto: number }[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = getSupabase();

  const { data } = await supabase
    .from("adjudicaciones_historicas")
    .select("saf_desc, tipo_procedimiento, monto, moneda")
    .eq("moneda", "ARS");

  if (!data?.length) return [];

  const mapa = new Map<string, { total: number; directas: number; montoTotal: number; montoDirectas: number }>();

  for (const row of data as { saf_desc: string; tipo_procedimiento: string; monto: number }[]) {
    const e = mapa.get(row.saf_desc) ?? { total: 0, directas: 0, montoTotal: 0, montoDirectas: 0 };
    const isDirecta = row.tipo_procedimiento?.toLowerCase().includes("directa");
    e.total++;
    e.montoTotal += Number(row.monto);
    if (isDirecta) { e.directas++; e.montoDirectas += Number(row.monto); }
    mapa.set(row.saf_desc, e);
  }

  return Array.from(mapa.entries())
    .map(([saf, e]) => ({
      saf,
      pctDirectaCantidad: e.total > 0 ? (e.directas / e.total) * 100 : 0,
      pctDirectaMonto: e.montoTotal > 0 ? (e.montoDirectas / e.montoTotal) * 100 : 0,
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
