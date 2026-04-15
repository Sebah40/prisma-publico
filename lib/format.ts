/**
 * Formato de moneda argentina para datos de Presupuesto Abierto.
 *
 * IMPORTANTE: Los valores de la API SITIF vienen en MILLONES de pesos.
 * 52.748.936 en la API = $52,7 billones de pesos reales.
 *
 * Escalas:
 *   API value        Real               Display
 *   1                $1M                "$ 1 M"
 *   1.000            $1.000M            "$ 1.000 M"
 *   1.000.000        $1 billón          "$ 1,0 B"
 *   1.000.000.000    $1.000 billones    "$ 1.000 B"
 */

/**
 * Formato completo con unidad.
 * 52748936.1 → "$ 52.748.936 M"
 */
export function formatARS(value: number): string {
  const formatted = new Intl.NumberFormat("es-AR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
  return `$ ${formatted} M`;
}

/**
 * Formato compacto.
 * Los valores ya vienen en millones de pesos desde la API.
 *
 *   52748936    → "$ 52,7 B"    (billones de pesos)
 *   1234567     → "$ 1,2 B"
 *   234567      → "$ 234.567 M"
 *   1234        → "$ 1.234 M"
 *   56          → "$ 56 M"
 *   0.5         → "$ 0,5 M"
 */
export function formatARSCompact(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";

  // Billones (millones de millones de pesos)
  if (abs >= 1_000_000) {
    return `${sign}$ ${(abs / 1_000_000).toFixed(1).replace(".", ",")} B`;
  }
  // Miles de millones de pesos
  if (abs >= 1_000) {
    return `${sign}$ ${Math.round(abs).toLocaleString("es-AR")} M`;
  }
  // Millones de pesos
  if (abs >= 1) {
    return `${sign}$ ${abs.toFixed(1).replace(".", ",")} M`;
  }
  // Sub-millón
  if (abs > 0) {
    return `${sign}$ ${(abs * 1000).toFixed(0)} K`;
  }
  return "$ 0";
}

/**
 * Formato para montos en PESOS reales (COMPR.AR, adjudicaciones).
 * A diferencia de SITIF (que viene en millones), estos son pesos directos.
 *
 *   243300000   → "$ 243,3 M"
 *   1500000     → "$ 1,5 M"
 *   85200       → "$ 85.200"
 *   1200        → "$ 1.200"
 */
export function formatPesos(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";

  if (abs >= 1_000_000_000_000) {
    return `${sign}$ ${(abs / 1_000_000_000_000).toFixed(1).replace(".", ",")} B`;
  }
  if (abs >= 1_000_000_000) {
    return `${sign}$ ${(abs / 1_000_000_000).toFixed(1).replace(".", ",")} MM`;
  }
  if (abs >= 1_000_000) {
    return `${sign}$ ${(abs / 1_000_000).toFixed(1).replace(".", ",")} M`;
  }
  if (abs >= 1) {
    return `${sign}$ ${Math.round(abs).toLocaleString("es-AR")}`;
  }
  return "$ 0";
}

/**
 * Porcentaje de ejecución presupuestaria.
 * (devengado, vigente) → "78,3%"
 */
export function formatEjecucion(devengado: number, vigente: number): string {
  if (vigente === 0) return "—";
  const pct = (devengado / vigente) * 100;
  return `${pct.toFixed(1).replace(".", ",")}%`;
}
