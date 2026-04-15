/**
 * Intelligence Layer — Consultas de identidad y cruce.
 *
 * Principio: mostramos datos, no interpretamos.
 * Las etiquetas son factuales ("Recurrente" = ganó en 3+ años).
 */

import { getSupabase, isSupabaseConfigured } from "./supabase";

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
  if (!isSupabaseConfigured()) return { data: [], total: 0 };
  const supabase = getSupabase();
  const { search, page = 1, pageSize = 50, orderBy = "total_adjudicado_ajustado" } = opts;

  let query = supabase
    .from("proveedores")
    .select("*", { count: "exact" })
    .gt("cantidad_contratos", 0)
    .or('cuit.like.30-%,cuit.like.33-%,cuit.like.34-%')
    .order(orderBy, { ascending: false });

  if (search) {
    query = query.or(
      `razon_social.ilike.%${search}%,cuit.ilike.%${search}%`
    );
  }

  const from = (page - 1) * pageSize;
  query = query.range(from, from + pageSize - 1);

  const { data, count } = await query;
  const rows = (data ?? []) as ProveedorConEtiquetas[];

  return {
    data: rows.map((r) => ({ ...r, etiquetas: computeEtiquetas(r) })),
    total: count ?? 0,
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

  if (!isSupabaseConfigured()) return null;
  const supabase = getSupabase();

  const { data: prov } = await supabase
    .from("proveedores")
    .select("*")
    .eq("cuit", cuit)
    .limit(1);

  if (!prov?.length) return null;
  const p = prov[0] as Record<string, unknown>;

  const { data: adjs } = await supabase
    .from("adjudicaciones_historicas")
    .select("*")
    .eq("cuit_proveedor", cuit)
    .order("fecha_adjudicacion", { ascending: false });

  const historial = (adjs ?? []) as AdjudicacionHistorica[];

  // Calcular órbita principal (jurisdicción donde más ganó)
  const orbita = await getOrbitaPrincipal(cuit);

  const ficha: FichaIdentidad = {
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

  return ficha;
}

/**
 * Concentración: top proveedores por jurisdicción.
 */
export async function getConcentracion(
  jurisdiccionId: number
): Promise<ConcentracionJurisdiccion | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = getSupabase();

  // Get SAF IDs for this jurisdiccion
  const { data: safRows } = await supabase
    .from("map_saf_jurisdiccion")
    .select("saf_id, jurisdiccion_desc")
    .eq("jurisdiccion_id", jurisdiccionId);

  if (!safRows?.length) return null;
  const safIds = (safRows as { saf_id: number; jurisdiccion_desc: string }[]).map((r) => r.saf_id);
  const jurDesc = (safRows[0] as { jurisdiccion_desc: string }).jurisdiccion_desc;

  // Get all adjudicaciones for these SAFs
  const { data: adjs } = await supabase
    .from("adjudicaciones_historicas")
    .select("cuit_proveedor, monto, saf_id")
    .in("saf_id", safIds);

  if (!adjs?.length) return null;

  const provMap = new Map<string, { monto: number; contratos: number }>();
  let totalMonto = 0;
  let totalContratos = 0;

  for (const a of adjs as { cuit_proveedor: string; monto: number }[]) {
    const m = provMap.get(a.cuit_proveedor) ?? { monto: 0, contratos: 0 };
    m.monto += Number(a.monto);
    m.contratos += 1;
    provMap.set(a.cuit_proveedor, m);
    totalMonto += Number(a.monto);
    totalContratos += 1;
  }

  // Get razon_social for top providers
  const sorted = Array.from(provMap.entries())
    .sort((a, b) => b[1].monto - a[1].monto)
    .slice(0, 10);

  const cuits = sorted.map((s) => s[0]);
  const { data: provs } = await supabase
    .from("proveedores")
    .select("cuit, razon_social")
    .in("cuit", cuits);

  const nameMap = new Map(
    ((provs ?? []) as { cuit: string; razon_social: string }[]).map((p) => [p.cuit, p.razon_social])
  );

  return {
    jurisdiccion_id: jurisdiccionId,
    jurisdiccion_desc: jurDesc,
    total_monto: totalMonto,
    total_contratos: totalContratos,
    top_proveedores: sorted.map(([cuit, m]) => ({
      cuit,
      razon_social: nameMap.get(cuit) ?? "Desconocido",
      monto: m.monto,
      contratos: m.contratos,
      pct_monto: totalMonto > 0 ? (m.monto / totalMonto) * 100 : 0,
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
  if (!isSupabaseConfigured()) return [];
  const supabase = getSupabase();

  const { data: safRows } = await supabase
    .from("map_saf_jurisdiccion")
    .select("saf_id")
    .eq("jurisdiccion_id", jurisdiccionId);

  if (!safRows?.length) return [];
  const safIds = (safRows as { saf_id: number }[]).map((r) => r.saf_id);

  const { data: adjs } = await supabase
    .from("adjudicaciones_historicas")
    .select("cuit_proveedor, monto, ejercicio")
    .in("saf_id", safIds);

  if (!adjs?.length) return [];

  const provMap = new Map<
    string,
    { monto: number; contratos: number; years: Set<number> }
  >();
  for (const a of adjs as { cuit_proveedor: string; monto: number; ejercicio: number }[]) {
    const m = provMap.get(a.cuit_proveedor) ?? {
      monto: 0,
      contratos: 0,
      years: new Set(),
    };
    m.monto += Number(a.monto);
    m.contratos += 1;
    m.years.add(a.ejercicio);
    provMap.set(a.cuit_proveedor, m);
  }

  const sorted = Array.from(provMap.entries())
    .sort((a, b) => b[1].monto - a[1].monto)
    .slice(0, limit);

  const cuits = sorted.map((s) => s[0]);
  const { data: provs } = await supabase
    .from("proveedores")
    .select("cuit, razon_social")
    .in("cuit", cuits);

  const nameMap = new Map(
    ((provs ?? []) as { cuit: string; razon_social: string }[]).map((p) => [p.cuit, p.razon_social])
  );

  return sorted.map(([cuit, m]) => ({
    cuit,
    razon_social: nameMap.get(cuit) ?? "Desconocido",
    monto: m.monto,
    contratos: m.contratos,
    anios: m.years.size,
  }));
}

// --- Helpers ---

async function getOrbitaPrincipal(cuit: string) {
  const supabase = getSupabase();

  const { data: adjs } = await supabase
    .from("adjudicaciones_historicas")
    .select("saf_id, monto")
    .eq("cuit_proveedor", cuit);

  if (!adjs?.length) return null;

  const safTotals = new Map<number, number>();
  for (const a of adjs as { saf_id: number; monto: number }[]) {
    safTotals.set(a.saf_id, (safTotals.get(a.saf_id) ?? 0) + Number(a.monto));
  }

  const topSaf = Array.from(safTotals.entries()).sort((a, b) => b[1] - a[1])[0];
  if (!topSaf) return null;

  const { data: mapping } = await supabase
    .from("map_saf_jurisdiccion")
    .select("jurisdiccion_id, jurisdiccion_desc")
    .eq("saf_id", topSaf[0])
    .limit(1);

  if (!mapping?.length) return null;
  const m = mapping[0] as { jurisdiccion_id: number; jurisdiccion_desc: string };

  return {
    jurisdiccion_id: m.jurisdiccion_id,
    jurisdiccion_desc: m.jurisdiccion_desc,
    monto: topSaf[1],
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
