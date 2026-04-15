/**
 * Normalizador de valor real — convierte pesos nominales a pesos constantes.
 *
 * Usa el IPC (Índice de Precios al Consumidor) de INDEC via API Series de Tiempo.
 * Serie: 101.1_I2NG_2016_M_22 (IPC Nivel General, base dic 2016 = 100)
 *
 * Uso:
 *   const real = await adjustForInflation(1000000, '2020-06', '2026-04');
 *   // → cuánto valen hoy esos $1M de junio 2020
 */

const IPC_SERIES_ID = "101.1_I2NG_2016_M_22";
const API_URL = `https://apis.datos.gob.ar/series/api/series/?ids=${IPC_SERIES_ID}&start_date=2015-01&limit=200&format=json`;

let ipcCache: Map<string, number> | null = null;

/**
 * Carga el IPC mensual desde la API de Series de Tiempo.
 * Cachea en memoria — 1 sola llamada por sesión.
 */
async function loadIPC(): Promise<Map<string, number>> {
  if (ipcCache) return ipcCache;

  try {
    const res = await fetch(API_URL);
    const text = await res.text();

    if (!res.ok || !text.startsWith("{")) {
      console.error("[IPC] API returned non-JSON response:", res.status, text.substring(0, 200));
      ipcCache = new Map();
      return ipcCache;
    }

    const json = JSON.parse(text);
    const data: [string, number | null][] = json.data || [];

    const map = new Map<string, number>();
    for (const [date, value] of data) {
      if (value != null) {
        map.set(date.substring(0, 7), value);
      }
    }

    console.log(`[IPC] Loaded ${map.size} months of data`);
    ipcCache = map;
    return map;
  } catch (err) {
    console.error("[IPC] Failed to load IPC data:", err);
    ipcCache = new Map();
    return ipcCache;
  }
}

/**
 * Obtiene el IPC para un mes dado. Si no existe el mes exacto, usa el más cercano.
 */
async function getIPC(yearMonth: string): Promise<number> {
  const ipc = await loadIPC();

  // Try exact match
  if (ipc.has(yearMonth)) return ipc.get(yearMonth)!;

  // Try previous months
  const [y, m] = yearMonth.split("-").map(Number);
  for (let i = 1; i <= 6; i++) {
    const prevM = m - i > 0 ? m - i : 12 + (m - i);
    const prevY = m - i > 0 ? y : y - 1;
    const key = `${prevY}-${String(prevM).padStart(2, "0")}`;
    if (ipc.has(key)) return ipc.get(key)!;
  }

  // Return latest available
  const values = Array.from(ipc.values());
  return values[values.length - 1] || 1;
}

/**
 * Ajusta un monto nominal a pesos constantes.
 *
 * @param monto - Monto en pesos nominales
 * @param fromMonth - Mes de origen "YYYY-MM" (ej: "2020-06")
 * @param toMonth - Mes destino "YYYY-MM" (ej: "2026-04"), default: último disponible
 * @returns Monto ajustado en pesos constantes del mes destino
 */
export async function adjustForInflation(
  monto: number,
  fromMonth: string,
  toMonth?: string
): Promise<number> {
  const ipc = await loadIPC();

  const ipcFrom = await getIPC(fromMonth);
  const ipcTo = toMonth
    ? await getIPC(toMonth)
    : Array.from(ipc.values()).pop() || ipcFrom;

  if (ipcFrom === 0) return monto;
  return monto * (ipcTo / ipcFrom);
}

/**
 * Obtiene el factor de ajuste entre dos períodos.
 */
export async function getInflationFactor(
  fromMonth: string,
  toMonth?: string
): Promise<number> {
  const ipcFrom = await getIPC(fromMonth);
  const ipc = await loadIPC();
  const ipcTo = toMonth
    ? await getIPC(toMonth)
    : Array.from(ipc.values()).pop() || ipcFrom;

  if (ipcFrom === 0) return 1;
  return ipcTo / ipcFrom;
}

/**
 * Devuelve la serie IPC completa para gráficos.
 */
export async function getIPCSeries(): Promise<{ month: string; value: number }[]> {
  const ipc = await loadIPC();
  return Array.from(ipc.entries())
    .map(([month, value]) => ({ month, value }))
    .sort((a, b) => a.month.localeCompare(b.month));
}

export function isIPCAvailable(yearMonth: string): boolean {
  // IPC data available from 2016-04 onwards
  return yearMonth >= "2016-04";
}

/**
 * Extrae YYYY-MM de una fecha o año.
 */
export function toYearMonth(input: string | number): string {
  if (typeof input === "number") return `${input}-06`; // mid-year estimate
  if (input.length === 4) return `${input}-06`;
  if (input.length === 7) return input;
  return input.substring(0, 7);
}
