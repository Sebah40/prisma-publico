/**
 * Daily Pulse — Worker de ingesta y detección de anomalías.
 *
 * POST /api/ingesta/pulse
 *
 * Flujo:
 * 1. Fetch crédito a nivel programa desde SITIF
 * 2. Guardar snapshot inmutable en presupuesto_diario
 * 3. Cargar snapshot de ayer
 * 4. Ejecutar motor diferencial → generar novedades
 * 5. Logear resultado en ingestas_log
 *
 * Diseñado para ser invocado por cron (Vercel Cron o externo).
 * Protegido por CRON_SECRET header.
 */

import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { fetchCredito, type CreditoRow } from "@/lib/sitif";
import { detectarNovedades, buildMapaAyer } from "@/lib/delta";
import type {
  PresupuestoDiarioInsert,
  IngestaLogInsert,
} from "@/lib/database.types";

export const maxDuration = 60; // segundos (Vercel Functions)

export async function POST(request: Request) {
  const supabase = getSupabase();
  const start = Date.now();
  const hoy = new Date().toISOString().slice(0, 10);

  // Verificar secret
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // --- Paso 1: Verificar que no exista snapshot de hoy ---
    const { count: existente } = await supabase
      .from("presupuesto_diario")
      .select("*", { count: "exact", head: true })
      .eq("fecha", hoy);

    if (existente && existente > 0) {
      return NextResponse.json({
        status: "skipped",
        message: `Snapshot de ${hoy} ya existe (${existente} registros). Inmutable.`,
      });
    }

    // --- Paso 2: Fetch desde SITIF ---
    const rows = await fetchCredito();
    const ejercicioActual = new Date().getFullYear();
    const rowsEjercicio = rows.filter(
      (r) => r.ejercicio_presupuestario === ejercicioActual
    );

    if (rowsEjercicio.length === 0) {
      await logIngesta({
        fecha: hoy,
        endpoint: "credito",
        filas_recibidas: rows.length,
        filas_insertadas: 0,
        novedades_generadas: 0,
        duracion_ms: Date.now() - start,
        error: `Sin datos para ejercicio ${ejercicioActual}`,
      });
      return NextResponse.json({
        status: "empty",
        message: `Sin datos para ejercicio ${ejercicioActual}`,
        total_rows: rows.length,
      });
    }

    // --- Paso 3: Deduplicar y agregar por clave única ---
    // SITIF puede devolver múltiples filas para el mismo programa
    // (distintas entidades, fuentes, etc). Agregamos los montos.
    const agrupado = new Map<string, PresupuestoDiarioInsert>();
    for (const row of rowsEjercicio) {
      const key = `${row.jurisdiccion_id}:${row.entidad_id ?? 0}:${row.programa_id}`;
      const existing = agrupado.get(key);
      if (existing) {
        existing.credito_presupuestado += row.credito_presupuestado;
        existing.credito_vigente += row.credito_vigente;
        existing.credito_devengado += row.credito_devengado;
        existing.credito_pagado += row.credito_pagado;
      } else {
        agrupado.set(key, toPresupuestoDiario(hoy)(row));
      }
    }
    const inserts = Array.from(agrupado.values());

    // Insertar en batches de 500 (límite de Supabase REST)
    const BATCH_SIZE = 500;
    for (let i = 0; i < inserts.length; i += BATCH_SIZE) {
      const batch = inserts.slice(i, i + BATCH_SIZE);
      const { error: insertError } = await supabase
        .from("presupuesto_diario")
        .insert(batch);
      if (insertError) throw new Error(`Insert failed (batch ${i}): ${insertError.message}`);
    }

    // --- Paso 4: Cargar snapshot de ayer ---
    const ayer = await getSnapshotAnterior(hoy, ejercicioActual);
    const mapaAyer = buildMapaAyer(ayer);

    // --- Paso 5: Ejecutar motor diferencial ---
    // IMPORTANTE: usar inserts (deduplicados) no rowsEjercicio (crudos)
    const snapshotsHoy = inserts.map((r) => ({
      fecha: hoy,
      ejercicio: r.ejercicio,
      jurisdiccion_id: r.jurisdiccion_id,
      jurisdiccion_desc: r.jurisdiccion_desc,
      entidad_id: r.entidad_id,
      programa_id: r.programa_id,
      programa_desc: r.programa_desc,
      credito_presupuestado: r.credito_presupuestado,
      credito_vigente: r.credito_vigente,
      credito_devengado: r.credito_devengado,
      credito_pagado: r.credito_pagado,
    }));

    const novedades = detectarNovedades(snapshotsHoy, mapaAyer);

    // --- Paso 6: Guardar novedades ---
    let novedadesInsertadas = 0;
    if (novedades.length > 0) {
      const { error: novError } = await supabase
        .from("novedades")
        .insert(novedades);
      if (novError)
        throw new Error(`Novedades insert failed: ${novError.message}`);
      novedadesInsertadas = novedades.length;
    }

    // --- Paso 7: Log ---
    const duracion = Date.now() - start;
    await logIngesta({
      fecha: hoy,
      endpoint: "credito",
      filas_recibidas: rows.length,
      filas_insertadas: inserts.length,
      novedades_generadas: novedadesInsertadas,
      duracion_ms: duracion,
      error: null,
    });

    return NextResponse.json({
      status: "ok",
      fecha: hoy,
      ejercicio: ejercicioActual,
      filas_insertadas: inserts.length,
      novedades: novedadesInsertadas,
      boost: novedades.filter((n) => n.tipo === "BOOST").length,
      halt: novedades.filter((n) => n.tipo === "HALT").length,
      duracion_ms: duracion,
    });
  } catch (err) {
    const duracion = Date.now() - start;
    const message = err instanceof Error ? err.message : String(err);

    await logIngesta({
      fecha: hoy,
      endpoint: "credito",
      filas_recibidas: 0,
      filas_insertadas: 0,
      novedades_generadas: 0,
      duracion_ms: duracion,
      error: message,
    });

    return NextResponse.json(
      { status: "error", message, duracion_ms: duracion },
      { status: 500 }
    );
  }
}

// --- Helpers ---

function toPresupuestoDiario(
  fecha: string
): (row: CreditoRow) => PresupuestoDiarioInsert {
  return (row) => ({
    fecha,
    ejercicio: row.ejercicio_presupuestario,
    jurisdiccion_id: row.jurisdiccion_id,
    jurisdiccion_desc: row.jurisdiccion_desc,
    entidad_id: row.entidad_id,
    entidad_desc: row.entidad_desc,
    programa_id: row.programa_id,
    programa_desc: row.programa_desc,
    credito_presupuestado: row.credito_presupuestado,
    credito_vigente: row.credito_vigente,
    credito_devengado: row.credito_devengado,
    credito_pagado: row.credito_pagado,
  });
}

async function getSnapshotAnterior(hoy: string, ejercicio: number) {
  const db = getSupabase();

  // Buscar la fecha más reciente antes de hoy
  const { data: anterior } = await db
    .from("presupuesto_diario")
    .select("fecha")
    .eq("ejercicio", ejercicio)
    .lt("fecha", hoy)
    .order("fecha", { ascending: false })
    .limit(1);

  if (!anterior || anterior.length === 0) return [];

  const fechaRef = (anterior[0] as { fecha: string }).fecha;

  const { data: snapshot } = await db
    .from("presupuesto_diario")
    .select(
      "jurisdiccion_id, entidad_id, programa_id, credito_presupuestado, credito_vigente, credito_devengado, credito_pagado"
    )
    .eq("ejercicio", ejercicio)
    .eq("fecha", fechaRef);

  return snapshot ?? [];
}

async function logIngesta(log: IngestaLogInsert) {
  await getSupabase().from("ingestas_log").insert(log);
}
