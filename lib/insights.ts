import { getPool } from "./db";
import { EMPRESAS } from "./privacy";


// --- Types ---

export interface DistribucionMontosRow {
  cuit: string;
  nombre: string;
  montoPromedio: number;
  contratos: number;
  total: number;
}

export interface RatioContratosDiasRow {
  cuit: string;
  nombre: string;
  contratos: number;
  diasDistintos: number;
  maxContratosEnUnDia: number;
}

export interface BoxPlotRow {
  tipo: string;
  q1: number;
  median: number;
  q3: number;
  min: number;
  max: number;
  outliers: number[];
}

export interface AntesVsDespuesRow {
  cuit: string;
  nombre: string;
  montoAntes: number;
  montoDespues: number;
  partido: string;
}

export interface HeatmapRow {
  proveedor: string;
  organismo: string;
  monto: number;
}

export interface TimelineAcumulacionRow {
  month: string;
  proveedor: string;
  acumulado: number;
}

export interface CoocurrenciaRow {
  prov1: string;
  prov2: string;
  organismo: string;
  meses_compartidos: number;
}

// --- Queries ---

export async function getDistribucionMontos(): Promise<DistribucionMontosRow[]> {
  const pool = getPool();
  try {
    const { rows } = await pool.query(`
      SELECT cuit, razon_social,
        total_adjudicado / cantidad_contratos AS promedio,
        cantidad_contratos, total_adjudicado
      FROM proveedores
      WHERE cantidad_contratos > 0 AND ${EMPRESAS.cuit}
      ORDER BY promedio DESC
    `);
    return rows.map((r: Record<string, unknown>) => ({
      cuit: String(r.cuit),
      nombre: String(r.razon_social),
      montoPromedio: Number(r.promedio),
      contratos: Number(r.cantidad_contratos),
      total: Number(r.total_adjudicado),
    }));
  } catch {
    return [];
  }
}

export async function getRatioContratosDias(): Promise<RatioContratosDiasRow[]> {
  const pool = getPool();
  try {
    const { rows } = await pool.query(`
      SELECT
        a.cuit_proveedor AS cuit,
        MAX(p.razon_social) AS nombre,
        COUNT(*) AS contratos,
        COUNT(DISTINCT a.fecha_adjudicacion) AS dias_distintos,
        MAX(day_counts.max_day) AS max_en_un_dia
      FROM adjudicaciones_historicas a
      JOIN proveedores p ON a.cuit_proveedor = p.cuit AND ${EMPRESAS.cuit}
      LEFT JOIN LATERAL (
        SELECT MAX(cnt) AS max_day FROM (
          SELECT COUNT(*) AS cnt
          FROM adjudicaciones_historicas a2
          WHERE a2.cuit_proveedor = a.cuit_proveedor
          GROUP BY a2.fecha_adjudicacion
        ) sub
      ) day_counts ON true
      GROUP BY a.cuit_proveedor
      HAVING COUNT(*) >= 5
      ORDER BY COUNT(*) DESC
      LIMIT 500
    `);
    return rows.map((r: Record<string, unknown>) => ({
      cuit: String(r.cuit),
      nombre: String(r.nombre),
      contratos: Number(r.contratos),
      diasDistintos: Number(r.dias_distintos),
      maxContratosEnUnDia: Number(r.max_en_un_dia),
    }));
  } catch {
    return [];
  }
}

export async function getBoxPlotProcedimiento(): Promise<BoxPlotRow[]> {
  const pool = getPool();
  try {
    const { rows } = await pool.query(`
      WITH normalized AS (
        SELECT
          CASE
            WHEN tipo_procedimiento = '' OR tipo_procedimiento IS NULL THEN 'Sin especificar'
            WHEN tipo_procedimiento ILIKE 'licitacion privada' THEN 'Licitación Privada'
            WHEN tipo_procedimiento ILIKE 'licitacion publica' THEN 'Licitación Pública'
            WHEN tipo_procedimiento ILIKE 'licitación publica' THEN 'Licitación Pública'
            ELSE tipo_procedimiento
          END AS tipo,
          monto
        FROM adjudicaciones_historicas
        WHERE monto > 0
      ),
      stats AS (
        SELECT
          tipo,
          PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY monto) AS q1,
          PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY monto) AS median,
          PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY monto) AS q3,
          MIN(monto) AS min_val,
          MAX(monto) AS max_val
        FROM normalized
        GROUP BY tipo
        HAVING COUNT(*) >= 10
      )
      SELECT tipo AS tipo_procedimiento, q1, median, q3, min_val, max_val FROM stats ORDER BY median DESC
    `);

    // For outliers, compute IQR-based cutoffs
    return rows.map((r: Record<string, unknown>) => {
      const q1 = Number(r.q1);
      const q3 = Number(r.q3);
      const iqr = q3 - q1;
      // Whiskers: IQR-based but floor at $100 (values below are data errors)
      const whiskerCalcLow = q1 - 1.5 * iqr;
      const whiskerLow = Math.max(100, whiskerCalcLow > 0 ? whiskerCalcLow : q1 * 0.1);
      const whiskerHigh = Math.min(Number(r.max_val), q3 + 1.5 * iqr);
      return {
        tipo: String(r.tipo_procedimiento),
        q1,
        median: Number(r.median),
        q3,
        min: whiskerLow,
        max: whiskerHigh,
        outliers: [],
      };
    });
  } catch {
    return [];
  }
}

export async function getAntesVsDespuesDonacion(): Promise<AntesVsDespuesRow[]> {
  const pool = getPool();
  try {
    const { rows } = await pool.query(`
      WITH first_donation AS (
        SELECT cuit_donante, MIN(fecha_aporte) AS primera_donacion,
          MAX(nombre_donante) AS nombre,
          (array_agg(DISTINCT partido_politico))[1] AS partido
        FROM aportes_campania
        WHERE ${EMPRESAS.donante}
        GROUP BY cuit_donante
      ),
      adjudicado_antes AS (
        SELECT fd.cuit_donante, COALESCE(SUM(ah.monto), 0) AS monto_antes
        FROM first_donation fd
        LEFT JOIN adjudicaciones_historicas ah
          ON ah.cuit_proveedor = fd.cuit_donante
          AND COALESCE(ah.fecha_adjudicacion, (ah.ejercicio::text || '-06-01')::date) < fd.primera_donacion
          AND ah.moneda = 'ARS'
        GROUP BY fd.cuit_donante
      ),
      adjudicado_despues AS (
        SELECT fd.cuit_donante, COALESCE(SUM(ah.monto), 0) AS monto_despues
        FROM first_donation fd
        LEFT JOIN adjudicaciones_historicas ah
          ON ah.cuit_proveedor = fd.cuit_donante
          AND COALESCE(ah.fecha_adjudicacion, (ah.ejercicio::text || '-06-01')::date) >= fd.primera_donacion
          AND ah.moneda = 'ARS'
        GROUP BY fd.cuit_donante
      )
      SELECT fd.cuit_donante AS cuit, fd.nombre, fd.partido,
        aa.monto_antes, ad.monto_despues
      FROM first_donation fd
      JOIN adjudicado_antes aa ON aa.cuit_donante = fd.cuit_donante
      JOIN adjudicado_despues ad ON ad.cuit_donante = fd.cuit_donante
      JOIN proveedores p ON p.cuit = fd.cuit_donante AND p.cantidad_contratos > 0
      WHERE (aa.monto_antes + ad.monto_despues) > 0
      ORDER BY ad.monto_despues DESC
      LIMIT 30
    `);
    return rows.map((r: Record<string, unknown>) => ({
      cuit: String(r.cuit),
      nombre: String(r.nombre),
      montoAntes: Number(r.monto_antes),
      montoDespues: Number(r.monto_despues),
      partido: String(r.partido),
    }));
  } catch {
    return [];
  }
}

export async function getHeatmapProveedorOrganismo(): Promise<HeatmapRow[]> {
  const pool = getPool();
  try {
    const { rows } = await pool.query(`
      WITH top_provs AS (
        SELECT cuit, razon_social
        FROM proveedores
        WHERE cantidad_contratos > 0 AND ${EMPRESAS.cuit}
        ORDER BY total_adjudicado DESC
        LIMIT 20
      )
      SELECT tp.razon_social AS proveedor, ah.saf_desc AS organismo,
        SUM(ah.monto) AS monto
      FROM adjudicaciones_historicas ah
      JOIN top_provs tp ON ah.cuit_proveedor = tp.cuit
      WHERE ah.saf_desc IS NOT NULL AND ah.moneda = 'ARS'
      GROUP BY tp.razon_social, ah.saf_desc
      ORDER BY monto DESC
      LIMIT 200
    `);
    return rows.map((r: Record<string, unknown>) => ({
      proveedor: String(r.proveedor),
      organismo: String(r.organismo),
      monto: Number(r.monto),
    }));
  } catch {
    return [];
  }
}

export async function getTimelineAcumulacion(): Promise<TimelineAcumulacionRow[]> {
  const pool = getPool();
  try {
    const { rows } = await pool.query(`
      WITH top5 AS (
        SELECT cuit, razon_social
        FROM proveedores
        WHERE cantidad_contratos > 0 AND ${EMPRESAS.cuit}
        ORDER BY total_adjudicado DESC
        LIMIT 5
      ),
      monthly AS (
        SELECT
          TO_CHAR(COALESCE(ah.fecha_adjudicacion, (ah.ejercicio::text || '-06-01')::date), 'YYYY-MM') AS month,
          tp.razon_social AS proveedor,
          SUM(ah.monto) AS monto_mes
        FROM adjudicaciones_historicas ah
        JOIN top5 tp ON ah.cuit_proveedor = tp.cuit
        WHERE ah.moneda = 'ARS'
        GROUP BY TO_CHAR(COALESCE(ah.fecha_adjudicacion, (ah.ejercicio::text || '-06-01')::date), 'YYYY-MM'), tp.razon_social
      ),
      avg_monthly AS (
        SELECT
          month,
          'PROMEDIO' AS proveedor,
          AVG(mes_sum) AS monto_mes
        FROM (
          SELECT TO_CHAR(COALESCE(fecha_adjudicacion, (ejercicio::text || '-06-01')::date), 'YYYY-MM') AS month, cuit_proveedor, SUM(monto) AS mes_sum
          FROM adjudicaciones_historicas
          WHERE moneda = 'ARS'
          GROUP BY TO_CHAR(COALESCE(fecha_adjudicacion, (ejercicio::text || '-06-01')::date), 'YYYY-MM'), cuit_proveedor
        ) sub
        GROUP BY month
      ),
      combined AS (
        SELECT * FROM monthly
        UNION ALL
        SELECT * FROM avg_monthly
      )
      SELECT month, proveedor, monto_mes,
        SUM(monto_mes) OVER (PARTITION BY proveedor ORDER BY month) AS acumulado
      FROM combined
      ORDER BY proveedor, month
    `);
    return rows.map((r: Record<string, unknown>) => ({
      month: String(r.month),
      proveedor: String(r.proveedor),
      acumulado: Number(r.acumulado),
    }));
  } catch {
    return [];
  }
}

export async function getCoocurrencia(): Promise<CoocurrenciaRow[]> {
  const pool = getPool();
  try {
    const { rows } = await pool.query(`
      WITH prov_org_month AS (
        SELECT DISTINCT
          cuit_proveedor,
          saf_desc,
          TO_CHAR(COALESCE(fecha_adjudicacion, (ejercicio::text || '-06-01')::date), 'YYYY-MM') AS mes
        FROM adjudicaciones_historicas
        WHERE saf_desc IS NOT NULL
      ),
      top_provs AS (
        SELECT cuit, razon_social
        FROM proveedores
        WHERE cantidad_contratos > 0 AND ${EMPRESAS.cuit}
        ORDER BY total_adjudicado DESC
        LIMIT 30
      ),
      pairs AS (
        SELECT
          p1.razon_social AS prov1,
          p2.razon_social AS prov2,
          a.saf_desc AS organismo,
          COUNT(DISTINCT a.mes) AS meses_compartidos
        FROM prov_org_month a
        JOIN prov_org_month b ON a.saf_desc = b.saf_desc AND a.mes = b.mes AND a.cuit_proveedor < b.cuit_proveedor
        JOIN top_provs p1 ON a.cuit_proveedor = p1.cuit
        JOIN top_provs p2 ON b.cuit_proveedor = p2.cuit
        GROUP BY p1.razon_social, p2.razon_social, a.saf_desc
        HAVING COUNT(DISTINCT a.mes) >= 2
      )
      SELECT prov1, prov2, organismo, meses_compartidos
      FROM pairs
      ORDER BY meses_compartidos DESC
      LIMIT 60
    `);
    return rows.map((r: Record<string, unknown>) => ({
      prov1: String(r.prov1),
      prov2: String(r.prov2),
      organismo: String(r.organismo),
      meses_compartidos: Number(r.meses_compartidos),
    }));
  } catch {
    return [];
  }
}
