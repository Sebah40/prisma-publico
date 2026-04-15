/**
 * Motor de detección de outliers presupuestarios.
 *
 * Cada preset filtra programas que cumplen una condición anómala.
 * La vista por defecto muestra SOLO outliers — lo normal se esconde.
 */

import type { ProgramaConMetricas } from "./queries";

export type OutlierPreset =
  | "todos"         // Sin filtro (drill-down manual)
  | "plata-quieta"  // Mucha plata, 0 ejecución
  | "decreto"       // Aumento discrecional grande
  | "deuda"         // Gap de gestión alto (facturan pero no pagan)
  | "caja-muerta"   // Presupuesto vigente > 0, pagado = 0
  | "recorte"       // Presupuesto recortado significativamente
  | "anomalias";    // Unión de todos los outliers

export interface OutlierConfig {
  id: OutlierPreset;
  label: string;
  description: string;
  tooltip: string;
  filter: (p: ProgramaConMetricas) => boolean;
  sort: (a: ProgramaConMetricas, b: ProgramaConMetricas) => number;
}

const MIN_VIGENTE = 100; // Ignorar programas con presupuesto insignificante

export const OUTLIER_PRESETS: OutlierConfig[] = [
  {
    id: "anomalias",
    label: "Todos los patrones",
    description: "Programas con al menos un patrón destacado",
    tooltip: "Programas donde vigente ≠ presupuestado, ejecución < 5%, o devengado > pagado",
    filter: (p) =>
      isPlataQuieta(p) || isDecreto(p) || isDeuda(p) || isCajaMuerta(p) || isRecorte(p),
    sort: (a, b) => Math.abs(b.aumento_discrecional) - Math.abs(a.aumento_discrecional),
  },
  {
    id: "plata-quieta",
    label: "Baja ejecución",
    description: "Ejecución menor al 5% con presupuesto vigente alto",
    tooltip: "Programas con presupuesto vigente alto donde se pagó menos del 5% del total asignado",
    filter: isPlataQuieta,
    sort: (a, b) => b.credito_vigente - a.credito_vigente,
  },
  {
    id: "decreto",
    label: "Aumento por decreto",
    description: "Vigente supera al presupuestado en más de 20%",
    tooltip: "El presupuesto vigente (ajustado por el Ejecutivo) supera en más de 20% al que aprobó el Congreso originalmente",
    filter: isDecreto,
    sort: (a, b) => b.aumento_discrecional_pct - a.aumento_discrecional_pct,
  },
  {
    id: "deuda",
    label: "Devengado sin pagar",
    description: "Diferencia entre devengado y pagado > 10% del devengado",
    tooltip: "El Estado reconoce que debe (devengado) pero aún no pagó. La diferencia representa servicios facturados pendientes de pago",
    filter: isDeuda,
    sort: (a, b) => b.gap_gestion - a.gap_gestion,
  },
  {
    id: "caja-muerta",
    label: "Sin ejecución",
    description: "Presupuesto vigente > 0 con pagado = $0",
    tooltip: "El programa tiene presupuesto asignado pero no registra ningún pago",
    filter: isCajaMuerta,
    sort: (a, b) => b.credito_vigente - a.credito_vigente,
  },
  {
    id: "recorte",
    label: "Recorte por decreto",
    description: "Vigente menor al 80% del presupuestado original",
    tooltip: "El presupuesto vigente fue reducido por decreto a menos del 80% de lo que aprobó el Congreso",
    filter: isRecorte,
    sort: (a, b) => a.aumento_discrecional_pct - b.aumento_discrecional_pct,
  },
  {
    id: "todos",
    label: "Todos los programas",
    description: "Vista completa sin filtros",
    tooltip: "Muestra los 359 programas sin ningún filtro de anomalía",
    filter: () => true,
    sort: (a, b) => b.credito_vigente - a.credito_vigente,
  },
];

// --- Detection functions ---

function isPlataQuieta(p: ProgramaConMetricas): boolean {
  return p.credito_vigente > MIN_VIGENTE && p.ejecucion_pct < 5;
}

function isDecreto(p: ProgramaConMetricas): boolean {
  return p.credito_presupuestado > MIN_VIGENTE && p.aumento_discrecional_pct > 20;
}

function isDeuda(p: ProgramaConMetricas): boolean {
  if (p.credito_devengado <= 0) return false;
  const ratio = p.gap_gestion / p.credito_devengado;
  return ratio > 0.1 && p.gap_gestion > 50;
}

function isCajaMuerta(p: ProgramaConMetricas): boolean {
  return p.credito_vigente > MIN_VIGENTE && p.credito_pagado === 0;
}

function isRecorte(p: ProgramaConMetricas): boolean {
  return p.credito_presupuestado > MIN_VIGENTE && p.aumento_discrecional_pct < -20;
}

/**
 * Aplica un preset y retorna los programas filtrados y ordenados.
 */
export function applyPreset(
  programas: ProgramaConMetricas[],
  presetId: OutlierPreset
): ProgramaConMetricas[] {
  const preset = OUTLIER_PRESETS.find((p) => p.id === presetId) ?? OUTLIER_PRESETS[0];
  return programas.filter(preset.filter).sort(preset.sort);
}

/**
 * Cuenta cuántos outliers hay por cada preset.
 */
export function countOutliers(
  programas: ProgramaConMetricas[]
): Record<OutlierPreset, number> {
  const counts: Record<string, number> = {};
  for (const preset of OUTLIER_PRESETS) {
    counts[preset.id] = programas.filter(preset.filter).length;
  }
  return counts as Record<OutlierPreset, number>;
}

/**
 * Clasifica un programa en sus categorías de outlier.
 */
export function getOutlierTags(p: ProgramaConMetricas): string[] {
  const tags: string[] = [];
  if (isPlataQuieta(p)) tags.push("Baja ejec.");
  if (isDecreto(p)) tags.push("+Decreto");
  if (isDeuda(p)) tags.push("Pago pend.");
  if (isCajaMuerta(p)) tags.push("Sin pagos");
  if (isRecorte(p)) tags.push("-Decreto");
  return tags;
}
