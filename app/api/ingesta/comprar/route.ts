/**
 * Ingesta COMPR.AR — Carga única de datos históricos 2015-2020.
 *
 * POST /api/ingesta/comprar
 *
 * Flujo:
 * 1. Descarga CSV de proveedores → upsert en tabla proveedores
 * 2. Por cada año (2015-2020): descarga adjudicaciones → insert
 * 3. Construye mapa SAF → jurisdicción desde los datos
 * 4. Actualiza métricas de proveedores (totales, años activo, etc.)
 *
 * Se puede re-ejecutar sin duplicar datos (ON CONFLICT).
 */

import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import {
  fetchProveedores,
  fetchAdjudicaciones,
  getAvailableYears,
  type AdjudicacionRaw,
  type ProveedorRaw,
} from "@/lib/comprar";

export const maxDuration = 300; // 5 min — heavy operation

const BATCH_SIZE = 200;

export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabase();
  const start = Date.now();
  const log: string[] = [];

  try {
    // --- Paso 1: Proveedores ---
    log.push("Descargando proveedores...");
    const proveedores = await fetchProveedores();
    log.push(`  ${proveedores.length} proveedores parseados`);

    let provInserted = 0;
    for (let i = 0; i < proveedores.length; i += BATCH_SIZE) {
      const batch = proveedores.slice(i, i + BATCH_SIZE).map(toProveedorRow);
      const { error } = await supabase
        .from("proveedores")
        .upsert(batch, { onConflict: "cuit", ignoreDuplicates: true });
      if (error) log.push(`  WARN proveedores batch ${i}: ${error.message}`);
      else provInserted += batch.length;
    }
    log.push(`  ${provInserted} proveedores cargados`);

    // --- Paso 2: Adjudicaciones por año ---
    const years = getAvailableYears();
    let totalAdj = 0;
    const safMap = new Map<number, string>();

    for (const year of years) {
      log.push(`Descargando adjudicaciones ${year}...`);
      const adjs = await fetchAdjudicaciones(year);
      log.push(`  ${adjs.length} adjudicaciones parseadas`);

      // Ensure all CUITs exist in proveedores first
      const uniqueCuits = new Set(adjs.map((a) => a.cuit_proveedor));
      const missingCuits: ProveedorRaw[] = [];
      for (const cuit of uniqueCuits) {
        if (!proveedores.find((p) => p.cuit === cuit)) {
          const adj = adjs.find((a) => a.cuit_proveedor === cuit);
          missingCuits.push({
            cuit,
            razon_social: adj?.proveedor_desc || "Desconocido",
            tipo_personeria: null,
            localidad: null,
            provincia: null,
            codigo_postal: null,
            rubros: adj?.rubros || [],
            fecha_inscripcion: null,
          });
        }
      }
      if (missingCuits.length > 0) {
        for (let i = 0; i < missingCuits.length; i += BATCH_SIZE) {
          const batch = missingCuits.slice(i, i + BATCH_SIZE).map(toProveedorRow);
          await supabase
            .from("proveedores")
            .upsert(batch, { onConflict: "cuit", ignoreDuplicates: true });
        }
        log.push(`  ${missingCuits.length} proveedores adicionales creados`);
      }

      // Insert adjudicaciones
      let yearInserted = 0;
      for (let i = 0; i < adjs.length; i += BATCH_SIZE) {
        const batch = adjs.slice(i, i + BATCH_SIZE).map(toAdjRow);
        const { error } = await supabase
          .from("adjudicaciones_historicas")
          .upsert(batch, {
            onConflict: "numero_procedimiento,cuit_proveedor,documento_contractual",
            ignoreDuplicates: true,
          });
        if (error) log.push(`  WARN adj ${year} batch ${i}: ${error.message}`);
        else yearInserted += batch.length;
      }
      log.push(`  ${yearInserted} adjudicaciones cargadas`);
      totalAdj += yearInserted;

      // Collect SAF mapping
      for (const a of adjs) {
        if (a.saf_id && a.saf_desc && !safMap.has(a.saf_id)) {
          safMap.set(a.saf_id, a.saf_desc);
        }
      }
    }

    // --- Paso 3: Mapa SAF → Jurisdicción ---
    log.push("Construyendo mapa SAF → Jurisdicción...");
    const safRows = buildSAFMapping(safMap);
    for (let i = 0; i < safRows.length; i += BATCH_SIZE) {
      const batch = safRows.slice(i, i + BATCH_SIZE);
      await supabase
        .from("map_saf_jurisdiccion")
        .upsert(batch, { onConflict: "saf_id" });
    }
    log.push(`  ${safRows.length} SAFs mapeados`);

    // --- Paso 4: Actualizar métricas de proveedores ---
    log.push("Actualizando métricas de proveedores...");
    await updateProveedorMetrics(supabase);
    log.push("  Métricas actualizadas");

    const duracion = Date.now() - start;
    return NextResponse.json({
      status: "ok",
      proveedores: provInserted,
      adjudicaciones: totalAdj,
      safs: safRows.length,
      duracion_ms: duracion,
      log,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { status: "error", message, log, duracion_ms: Date.now() - start },
      { status: 500 }
    );
  }
}

// --- Helpers ---

function toProveedorRow(p: ProveedorRaw) {
  return {
    cuit: p.cuit,
    razon_social: p.razon_social,
    tipo_personeria: p.tipo_personeria,
    localidad: p.localidad,
    provincia: p.provincia,
    codigo_postal: p.codigo_postal,
    rubros: p.rubros,
    fecha_inscripcion: p.fecha_inscripcion,
  };
}

function toAdjRow(a: AdjudicacionRaw) {
  return {
    numero_procedimiento: a.numero_procedimiento,
    saf_id: a.saf_id,
    saf_desc: a.saf_desc,
    uoc_id: a.uoc_id,
    uoc_desc: a.uoc_desc,
    tipo_procedimiento: a.tipo_procedimiento,
    modalidad: a.modalidad,
    ejercicio: a.ejercicio,
    fecha_adjudicacion: a.fecha_adjudicacion,
    rubros: a.rubros,
    cuit_proveedor: a.cuit_proveedor,
    proveedor_desc: a.proveedor_desc,
    documento_contractual: a.documento_contractual,
    monto: a.monto,
    moneda: a.moneda === "Peso Argentino" ? "ARS" : a.moneda,
  };
}

/**
 * Mapea SAF IDs a jurisdicciones del presupuesto.
 * Heurística: agrupa SAFs por ministerio/organismo padre.
 */
function buildSAFMapping(
  safMap: Map<number, string>
): { saf_id: number; saf_desc: string; jurisdiccion_id: number; jurisdiccion_desc: string }[] {
  // Mapping conocido de ministerios (SAF ranges → jurisdiccion)
  const KNOWN_MAP: [RegExp, number, string][] = [
    [/legislat|congreso|auditor|defensor|bicameral/i, 1, "Poder Legislativo Nacional"],
    [/judicial|justicia de la nac|corte suprema/i, 5, "Poder Judicial de la Nación"],
    [/ministerio p[uú]blico/i, 10, "Ministerio Público"],
    [/presidencia/i, 20, "Presidencia de la Nación"],
    [/jefatura.*gabinete/i, 25, "Jefatura de Gabinete de Ministros"],
    [/interior/i, 30, "Ministerio del Interior"],
    [/relaciones exteriores|canciller/i, 35, "Ministerio de Relaciones Exteriores"],
    [/justicia|penitenciar/i, 40, "Ministerio de Justicia"],
    [/seguridad|polic[ií]a|gendarmer[ií]a|prefectura|migracion/i, 41, "Ministerio de Seguridad Nacional"],
    [/defensa|ej[eé]rcito|armada|fuerza a[eé]rea|estado mayor/i, 45, "Ministerio de Defensa"],
    [/econom[ií]a|hacienda|finanzas|producci[oó]n|agri|transporte|energ|miner|industri|comerci|obras p/i, 50, "Ministerio de Economía"],
    [/salud/i, 80, "Ministerio de Salud"],
    [/capital humano|educac|trabajo|social|ni[ñn]ez|familia|anses/i, 88, "Ministerio de Capital Humano"],
    [/desregulaci[oó]n|modernizaci[oó]n|innovaci[oó]n/i, 89, "Ministerio de Desregulación"],
    [/deuda|servicio de la deuda/i, 90, "Servicio de la Deuda Pública"],
    [/obligaciones.*tesoro/i, 91, "Obligaciones a Cargo del Tesoro"],
  ];

  const results: { saf_id: number; saf_desc: string; jurisdiccion_id: number; jurisdiccion_desc: string }[] = [];

  for (const [safId, safDesc] of safMap.entries()) {
    let matched = false;
    for (const [regex, jurId, jurDesc] of KNOWN_MAP) {
      if (regex.test(safDesc)) {
        results.push({
          saf_id: safId,
          saf_desc: safDesc,
          jurisdiccion_id: jurId,
          jurisdiccion_desc: jurDesc,
        });
        matched = true;
        break;
      }
    }
    if (!matched) {
      // Default: map to Economía (catch-all for unmatched)
      results.push({
        saf_id: safId,
        saf_desc: safDesc,
        jurisdiccion_id: 50,
        jurisdiccion_desc: "Ministerio de Economía (no mapeado)",
      });
    }
  }

  return results;
}

/**
 * Actualiza métricas agregadas en la tabla proveedores
 * basándose en adjudicaciones_historicas.
 */
async function updateProveedorMetrics(supabase: ReturnType<typeof getSupabase>) {
  // Use raw SQL via RPC is not available, so we compute in JS
  // Get aggregated data
  const { data: aggs } = await supabase
    .from("adjudicaciones_historicas")
    .select("cuit_proveedor, monto, ejercicio, saf_id");

  if (!aggs || aggs.length === 0) return;

  const metrics = new Map<
    string,
    { total: number; count: number; years: Set<number>; safs: Set<number> }
  >();

  for (const row of aggs as { cuit_proveedor: string; monto: number; ejercicio: number; saf_id: number }[]) {
    const m = metrics.get(row.cuit_proveedor) ?? {
      total: 0,
      count: 0,
      years: new Set(),
      safs: new Set(),
    };
    m.total += Number(row.monto);
    m.count += 1;
    m.years.add(row.ejercicio);
    m.safs.add(row.saf_id);
    metrics.set(row.cuit_proveedor, m);
  }

  // Update in batches
  for (const [cuit, m] of metrics.entries()) {
    await supabase
      .from("proveedores")
      .update({
        total_adjudicado: m.total,
        cantidad_contratos: m.count,
        anios_activo: m.years.size,
        jurisdicciones_distintas: m.safs.size,
      })
      .eq("cuit", cuit);
  }
}
