/**
 * Motor Diferencial — Detección de anomalías presupuestarias.
 *
 * Reglas de negocio:
 *
 * RECT ("Rectificación" — PRIORIDAD MÁXIMA):
 *   - Devengado o pagado BAJAN respecto a ayer (imposible en flujo normal)
 *   - O el presupuestado original cambia (reescritura de historia)
 *   - Significa que alguien editó registros hacia atrás
 *
 * BOOST ("Salto por Decreto"):
 *   - Crédito vigente supera al presupuestado por más del umbral (15% default)
 *   - O el crédito vigente creció significativamente vs ayer
 *
 * HALT ("Ahogo Financiero"):
 *   - El devengado creció (le facturaron al Estado) pero el pagado se estancó
 *   - Indica que el Estado le debe plata a proveedores
 *
 * NORMAL:
 *   - Flujo esperado, sin anomalías detectadas
 */

import type {
  AlertaTipo,
  NovedadInsert,
  PresupuestoDiario,
} from "./database.types";

// --- Umbrales configurables ---

/** Porcentaje mínimo de exceso vigente/presupuestado para BOOST */
const UMBRAL_BOOST_RATIO = 0.15; // 15%

/** Monto mínimo absoluto de delta vigente para considerar BOOST (millones) */
const UMBRAL_BOOST_ABSOLUTO = 1000; // $1.000M

/** Delta mínimo de devengado para considerar que "creció" */
const UMBRAL_DEVENGADO_CRECIMIENTO = 100; // $100M

/** Ratio máximo pagado/devengado para considerar HALT */
const UMBRAL_HALT_RATIO_PAGO = 0.3; // si pagó menos del 30% de lo devengado nuevo

/**
 * Tolerancia para rectificaciones: diferencias menores a este monto
 * se ignoran (pueden ser redondeos). En millones.
 */
const UMBRAL_RECT_TOLERANCIA = 0.5; // $0.5M

// --- Tipos ---

interface SnapshotHoy {
  fecha: string;
  ejercicio: number;
  jurisdiccion_id: number;
  jurisdiccion_desc: string;
  entidad_id: number | null;
  programa_id: number;
  programa_desc: string;
  credito_presupuestado: number;
  credito_vigente: number;
  credito_devengado: number;
  credito_pagado: number;
}

interface SnapshotAyer {
  credito_presupuestado: number;
  credito_vigente: number;
  credito_devengado: number;
  credito_pagado: number;
}

// --- Lógica de detección ---

/**
 * RECT: Detecta rectificaciones — valores que bajan cuando no deberían.
 *
 * En ejecución presupuestaria normal:
 * - presupuestado es fijo (cambia solo por ley)
 * - devengado solo sube (no se puede des-facturar)
 * - pagado solo sube (no se puede des-pagar)
 *
 * Si alguno baja, alguien editó los registros.
 */
function detectRect(
  hoy: SnapshotHoy,
  ayer: SnapshotAyer | null
): NovedadInsert | null {
  if (!ayer) return null;

  const hallazgos: string[] = [];
  let magnitudTotal = 0;

  // Presupuestado original cambió
  const deltaPresupuestado = hoy.credito_presupuestado - ayer.credito_presupuestado;
  if (Math.abs(deltaPresupuestado) > UMBRAL_RECT_TOLERANCIA) {
    const signo = deltaPresupuestado > 0 ? "+" : "";
    hallazgos.push(
      `presupuestado: $${fmtM(ayer.credito_presupuestado)}M → $${fmtM(hoy.credito_presupuestado)}M (${signo}${fmtM(deltaPresupuestado)}M)`
    );
    magnitudTotal += Math.abs(deltaPresupuestado);
  }

  // Devengado bajó (imposible en flujo normal)
  const deltaDevengado = hoy.credito_devengado - ayer.credito_devengado;
  if (deltaDevengado < -UMBRAL_RECT_TOLERANCIA) {
    hallazgos.push(
      `devengado BAJÓ: $${fmtM(ayer.credito_devengado)}M → $${fmtM(hoy.credito_devengado)}M (${fmtM(deltaDevengado)}M)`
    );
    magnitudTotal += Math.abs(deltaDevengado);
  }

  // Pagado bajó (imposible en flujo normal)
  const deltaPagado = hoy.credito_pagado - ayer.credito_pagado;
  if (deltaPagado < -UMBRAL_RECT_TOLERANCIA) {
    hallazgos.push(
      `pagado BAJÓ: $${fmtM(ayer.credito_pagado)}M → $${fmtM(hoy.credito_pagado)}M (${fmtM(deltaPagado)}M)`
    );
    magnitudTotal += Math.abs(deltaPagado);
  }

  if (hallazgos.length === 0) return null;

  const plural = hallazgos.length > 1 ? `${hallazgos.length} campos rectificados` : "Rectificación detectada";

  return buildNovedad(hoy, ayer, "RECT", {
    titulo: `${plural} en ${hoy.programa_desc}`,
    detalle: hallazgos.join(" · "),
    magnitud: magnitudTotal,
  });
}

function detectBoost(
  hoy: SnapshotHoy,
  ayer: SnapshotAyer | null
): NovedadInsert | null {
  const { credito_vigente, credito_presupuestado } = hoy;

  // Condición 1: Vigente excede presupuestado por más del umbral
  if (credito_presupuestado > 0) {
    const exceso = credito_vigente - credito_presupuestado;
    const ratio = exceso / credito_presupuestado;

    if (ratio > UMBRAL_BOOST_RATIO && exceso > UMBRAL_BOOST_ABSOLUTO) {
      const pct = (ratio * 100).toFixed(1);
      return buildNovedad(hoy, ayer, "BOOST", {
        titulo: `Vigente supera presupuestado en ${pct}%`,
        detalle: `${hoy.programa_desc}: vigente $${fmtM(credito_vigente)}M vs presupuestado $${fmtM(credito_presupuestado)}M (exceso: $${fmtM(exceso)}M)`,
        magnitud: exceso,
      });
    }
  }

  // Condición 2: Salto diario de vigente
  if (ayer) {
    const deltaVigente = credito_vigente - ayer.credito_vigente;
    if (deltaVigente > UMBRAL_BOOST_ABSOLUTO) {
      return buildNovedad(hoy, ayer, "BOOST", {
        titulo: `Salto de vigente: +$${fmtM(deltaVigente)}M en un día`,
        detalle: `${hoy.programa_desc}: vigente pasó de $${fmtM(ayer.credito_vigente)}M a $${fmtM(credito_vigente)}M`,
        magnitud: deltaVigente,
      });
    }
  }

  return null;
}

function detectHalt(
  hoy: SnapshotHoy,
  ayer: SnapshotAyer | null
): NovedadInsert | null {
  if (!ayer) return null;

  const deltaDevengado = hoy.credito_devengado - ayer.credito_devengado;
  const deltaPagado = hoy.credito_pagado - ayer.credito_pagado;

  // El devengado creció pero el pagado no acompañó
  if (deltaDevengado > UMBRAL_DEVENGADO_CRECIMIENTO) {
    const ratioPago =
      deltaDevengado > 0 ? deltaPagado / deltaDevengado : 1;

    if (ratioPago < UMBRAL_HALT_RATIO_PAGO) {
      const deuda = hoy.credito_devengado - hoy.credito_pagado;
      return buildNovedad(hoy, ayer, "HALT", {
        titulo: `Ahogo financiero: se factura pero no se paga`,
        detalle: `${hoy.programa_desc}: devengado creció $${fmtM(deltaDevengado)}M pero solo se pagaron $${fmtM(deltaPagado)}M. Deuda acumulada: $${fmtM(deuda)}M`,
        magnitud: deuda,
      });
    }
  }

  return null;
}

function buildNovedad(
  hoy: SnapshotHoy,
  ayer: SnapshotAyer | null,
  tipo: AlertaTipo,
  extra: { titulo: string; detalle: string; magnitud: number }
): NovedadInsert {
  const ratioVP =
    hoy.credito_presupuestado > 0
      ? hoy.credito_vigente / hoy.credito_presupuestado
      : null;
  const ratioPago =
    hoy.credito_devengado > 0
      ? hoy.credito_pagado / hoy.credito_devengado
      : null;

  return {
    fecha: hoy.fecha,
    ejercicio: hoy.ejercicio,
    jurisdiccion_id: hoy.jurisdiccion_id,
    jurisdiccion_desc: hoy.jurisdiccion_desc,
    programa_id: hoy.programa_id,
    programa_desc: hoy.programa_desc,
    tipo,
    titulo: extra.titulo,
    detalle: extra.detalle,
    vigente_hoy: hoy.credito_vigente,
    presupuestado_hoy: hoy.credito_presupuestado,
    devengado_hoy: hoy.credito_devengado,
    pagado_hoy: hoy.credito_pagado,
    vigente_ayer: ayer?.credito_vigente ?? null,
    devengado_ayer: ayer?.credito_devengado ?? null,
    pagado_ayer: ayer?.credito_pagado ?? null,
    delta_vigente: ayer
      ? hoy.credito_vigente - ayer.credito_vigente
      : null,
    delta_devengado: ayer
      ? hoy.credito_devengado - ayer.credito_devengado
      : null,
    delta_pagado: ayer
      ? hoy.credito_pagado - ayer.credito_pagado
      : null,
    ratio_vigente_presupuestado: ratioVP,
    ratio_pago: ratioPago,
    magnitud: extra.magnitud,
  };
}

// --- API pública ---

/**
 * Analiza un snapshot de hoy contra el de ayer y genera novedades.
 *
 * Orden de prioridad por registro:
 * 1. RECT (rectificación) — siempre se emite, es la más grave
 * 2. BOOST (salto presupuestario)
 * 3. HALT (ahogo financiero)
 *
 * Un registro puede generar RECT + otra alerta (son independientes).
 */
export function detectarNovedades(
  hoy: SnapshotHoy[],
  ayer: Map<string, SnapshotAyer>
): NovedadInsert[] {
  const novedades: NovedadInsert[] = [];

  for (const registro of hoy) {
    const key = `${registro.jurisdiccion_id}:${registro.entidad_id ?? 0}:${registro.programa_id}`;
    const registroAyer = ayer.get(key) ?? null;

    // RECT siempre se evalúa primero y siempre se emite (no excluye las demás)
    const rect = detectRect(registro, registroAyer);
    if (rect) {
      novedades.push(rect);
    }

    // BOOST
    const boost = detectBoost(registro, registroAyer);
    if (boost) {
      novedades.push(boost);
      continue; // BOOST y HALT son mutuamente excluyentes
    }

    // HALT
    const halt = detectHalt(registro, registroAyer);
    if (halt) {
      novedades.push(halt);
    }
  }

  // RECT primero, luego por magnitud descendente
  novedades.sort((a, b) => {
    if (a.tipo === "RECT" && b.tipo !== "RECT") return -1;
    if (a.tipo !== "RECT" && b.tipo === "RECT") return 1;
    return (b.magnitud ?? 0) - (a.magnitud ?? 0);
  });

  return novedades;
}

/**
 * Construye el mapa de ayer a partir de registros de presupuesto_diario.
 */
export function buildMapaAyer(
  registros: Pick<
    PresupuestoDiario,
    | "jurisdiccion_id"
    | "entidad_id"
    | "programa_id"
    | "credito_presupuestado"
    | "credito_vigente"
    | "credito_devengado"
    | "credito_pagado"
  >[]
): Map<string, SnapshotAyer> {
  const mapa = new Map<string, SnapshotAyer>();
  for (const r of registros) {
    const key = `${r.jurisdiccion_id}:${r.entidad_id ?? 0}:${r.programa_id}`;
    mapa.set(key, {
      credito_presupuestado: r.credito_presupuestado,
      credito_vigente: r.credito_vigente,
      credito_devengado: r.credito_devengado,
      credito_pagado: r.credito_pagado,
    });
  }
  return mapa;
}

/** Formato compacto para millones */
function fmtM(n: number): string {
  return (n / 1).toFixed(1);
}
