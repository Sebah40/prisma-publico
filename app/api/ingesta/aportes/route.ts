/**
 * Ingesta de aportes de campaña (CNE).
 *
 * POST /api/ingesta/aportes
 * Body: JSON array de aportes normalizados.
 *
 * Formato esperado:
 * [
 *   {
 *     "cuit": "20-12345678-9",
 *     "nombre": "Juan Pérez",
 *     "partido": "Partido X",
 *     "agrupacion": "Frente Y",
 *     "distrito": "CABA",
 *     "eleccion_anio": 2023,
 *     "eleccion_tipo": "PASO",
 *     "monto": 500000,
 *     "tipo": "efectivo",
 *     "fecha": "2023-05-15"
 *   }
 * ]
 */

import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

export const maxDuration = 60;

export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabase();
  const body = await request.json();

  if (!Array.isArray(body)) {
    return NextResponse.json({ error: "Body must be a JSON array" }, { status: 400 });
  }

  const rows = body.map((a: Record<string, unknown>) => ({
    cuit_donante: String(a.cuit || ""),
    nombre_donante: String(a.nombre || "Desconocido"),
    partido_politico: String(a.partido || ""),
    agrupacion: a.agrupacion ? String(a.agrupacion) : null,
    distrito: a.distrito ? String(a.distrito) : null,
    eleccion_anio: Number(a.eleccion_anio || a.anio || 0),
    eleccion_tipo: a.eleccion_tipo ? String(a.eleccion_tipo) : null,
    monto_aporte: Number(a.monto || 0),
    tipo_aporte: String(a.tipo || "efectivo"),
    fecha_aporte: a.fecha ? String(a.fecha) : null,
  })).filter((r: { cuit_donante: string; monto_aporte: number }) => r.cuit_donante && r.monto_aporte > 0);

  let inserted = 0;
  const BATCH = 500;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const { error } = await supabase.from("aportes_campania").insert(batch);
    if (error) {
      return NextResponse.json({ error: error.message, inserted }, { status: 500 });
    }
    inserted += batch.length;
  }

  return NextResponse.json({
    status: "ok",
    inserted,
    total_received: body.length,
    skipped: body.length - inserted,
  });
}
