import Link from "next/link";
import { getUltimoSnapshot, agregarPorJurisdiccion, enriquecerProgramas } from "@/lib/queries";
import { formatARSCompact, formatPesos } from "@/lib/format";
import { InfoTip } from "@/components/ui/tooltip";
import { Client } from "pg";
import { EMPRESAS } from "@/lib/privacy";
import {
  getDistribucionMontos,
  getRatioContratosDias,
  getBoxPlotProcedimiento,
  getAntesVsDespuesDonacion,
  getHeatmapProveedorOrganismo,
  getTimelineAcumulacion,
  getCoocurrencia,
} from "@/lib/insights";
import { InsightsSection } from "@/components/insights/insights-section";

export const dynamic = "force-dynamic";

async function getStats() {
  const client = new Client({
    host: "aws-1-us-east-2.pooler.supabase.com", port: 5432, database: "postgres",
    user: "postgres.sfecaatmpqppyoyaqksq",
    password: process.env.SUPABASE_DB_PASSWORD!,
    ssl: { rejectUnauthorized: false },
  });
  try {
    await client.connect();

    const { rows: [adj] } = await client.query("SELECT COUNT(*) as n, COUNT(DISTINCT cuit_proveedor) as provs FROM adjudicaciones_historicas");
    const { rows: [ap] } = await client.query("SELECT COUNT(*) as n, COUNT(DISTINCT cuit_donante) as donors FROM aportes_campania");
    const { rows: [cruce] } = await client.query(`
      SELECT COUNT(DISTINCT a.cuit_donante) as n
      FROM aportes_campania a JOIN proveedores p ON a.cuit_donante = p.cuit AND p.cantidad_contratos > 0
    `);
    const { rows: top5 } = await client.query(`
      SELECT cuit, razon_social, total_adjudicado, cantidad_contratos, jurisdicciones_distintas
      FROM proveedores WHERE cantidad_contratos > 0 AND ${EMPRESAS.cuit} ORDER BY total_adjudicado_ajustado DESC LIMIT 5
    `);
    const { rows: top5donantes } = await client.query(`
      SELECT a.cuit_donante, MAX(a.nombre_donante) as nombre,
        array_agg(DISTINCT a.partido_politico) as partidos,
        SUM(a.monto_aporte) as aportado, p.total_adjudicado as adjudicado
      FROM aportes_campania a JOIN proveedores p ON a.cuit_donante = p.cuit AND p.cantidad_contratos > 0
      WHERE ${EMPRESAS.donante}
      GROUP BY a.cuit_donante, p.total_adjudicado ORDER BY p.total_adjudicado DESC LIMIT 5
    `);
    const { rows: directa } = await client.query(`
      SELECT tipo_procedimiento, COUNT(*) as n FROM adjudicaciones_historicas
      WHERE tipo_procedimiento IS NOT NULL GROUP BY tipo_procedimiento ORDER BY n DESC
    `);

    return {
      adjudicaciones: Number(adj.n),
      proveedores_unicos: Number(adj.provs),
      aportes: Number(ap.n),
      donantes_unicos: Number(ap.donors),
      coincidencias: Number(cruce.n),
      top5: top5.map((r: Record<string, unknown>) => ({
        cuit: String(r.cuit), nombre: String(r.razon_social),
        adjudicado: Number(r.total_adjudicado), contratos: Number(r.cantidad_contratos),
        jurisdicciones: Number(r.jurisdicciones_distintas),
      })),
      top5donantes: top5donantes.map((r: Record<string, unknown>) => ({
        cuit: String(r.cuit_donante), nombre: String(r.nombre),
        partidos: (r.partidos as string[]) || [],
        aportado: Number(r.aportado), adjudicado: Number(r.adjudicado),
      })),
      directa: directa.map((r: Record<string, unknown>) => ({
        tipo: String(r.tipo_procedimiento), count: Number(r.n),
      })),
    };
  } finally {
    await client.end();
  }
}

export default async function HomePage() {
  const [
    snapshot,
    stats,
    distribucion,
    ratioContratos,
    boxplot,
    antesVsDespues,
    heatmap,
    timeline,
    coocurrencia,
  ] = await Promise.all([
    getUltimoSnapshot(),
    getStats(),
    getDistribucionMontos(),
    getRatioContratosDias(),
    getBoxPlotProcedimiento(),
    getAntesVsDespuesDonacion(),
    getHeatmapProveedorOrganismo(),
    getTimelineAcumulacion(),
    getCoocurrencia(),
  ]);
  const jurisdicciones = agregarPorJurisdiccion(snapshot);
  const programas = enriquecerProgramas(snapshot);

  const totalVigente = jurisdicciones.reduce((s, j) => s + j.credito_vigente, 0);
  const totalPagado = jurisdicciones.reduce((s, j) => s + j.credito_pagado, 0);
  const ejecGlobal = totalVigente > 0 ? (totalPagado / totalVigente) * 100 : 0;
  const sinEjecucion = programas.filter(p => p.credito_pagado === 0 && p.credito_vigente > 100).length;
  const totalDirecta = stats.directa.find(d => d.tipo.includes("Directa"))?.count ?? 0;
  const totalContratos = stats.directa.reduce((s, d) => s + d.count, 0);
  const pctDirecta = totalContratos > 0 ? ((totalDirecta / totalContratos) * 100).toFixed(0) : "0";

  return (
    <div className="px-4 md:px-6 py-8 space-y-12">

      {/* === HERO === */}
      <section>
        <h2 className="text-2xl md:text-4xl font-black leading-tight text-white">
          El Estado argentino tiene{" "}
          <span className="text-mint">{formatARSCompact(totalVigente)}</span>{" "}
          asignados en 2026.
        </h2>
        <p className="mt-3 text-lg text-text-secondary max-w-3xl leading-relaxed">
          Al mes 4 de 12, lleva gastados {formatARSCompact(totalPagado)} ({ejecGlobal.toFixed(0)}%).
          Al ritmo actual, cerraría el año en ~{(ejecGlobal * 3).toFixed(0)}%.
          {sinEjecucion > 0 && <> <span className="whitespace-nowrap">{sinEjecucion} programas</span> todavía no registran ningún pago.</>}
          {" "}Esta página cruza presupuesto, contrataciones y aportes de campaña para que veas a dónde va la plata.
        </p>
        <Link href="/presupuesto" className="inline-block mt-4 border border-mint px-4 py-2 font-data text-[11px] uppercase tracking-widest text-mint no-underline hover:bg-mint hover:text-canvas hover:no-underline transition-colors">
          Ver el detalle del gasto →
        </Link>
      </section>

      {/* === ¿A DÓNDE VA LA PLATA? === */}
      <section className="border-t border-border pt-8">
        <div className="font-data text-[11px] uppercase tracking-[0.2em] text-mint mb-2">Presupuesto 2026</div>
        <h3 className="text-2xl font-bold text-white mb-1">¿A dónde va la plata?</h3>
        <p className="text-[11px] text-text-secondary mb-4">(montos en millones de pesos)</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-3">
            {jurisdicciones.slice(0, 8).map((j) => {
              const pct = totalVigente > 0 ? (j.credito_vigente / totalVigente) * 100 : 0;
              return (
                <div key={j.jurisdiccion_id}>
                  <div className="flex justify-between text-sm">
                    <Link href={`/presupuesto?jurisdiccion=${j.jurisdiccion_id}`} className="text-white no-underline hover:text-mint">
                      {j.jurisdiccion_desc}
                    </Link>
                    <span className="font-data text-text-secondary">{formatARSCompact(j.credito_vigente)}</span>
                  </div>
                  <div className="mt-1 h-2 w-full bg-surface">
                    <div className="h-full bg-mint/30" style={{ width: `${pct}%` }}>
                      <div className="h-full bg-mint" style={{ width: `${j.ejecucion_pct}%` }} />
                    </div>
                  </div>
                  <div className="flex justify-between mt-0.5 font-data text-[10px] text-text-muted">
                    <span>{pct.toFixed(1)}% del total</span>
                    <span>{j.ejecucion_pct.toFixed(0)}% ejecutado</span>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="border border-border p-5">
            <div className="font-data text-[11px] uppercase tracking-widest text-text-muted mb-3">En resumen</div>
            <div className="space-y-3 text-sm text-text-secondary leading-relaxed">
              <p>
                <span className="text-white font-medium">{jurisdicciones[0]?.jurisdiccion_desc}</span> concentra el{" "}
                {totalVigente > 0 ? ((jurisdicciones[0]?.credito_vigente / totalVigente) * 100).toFixed(0) : 0}% del presupuesto.
                {jurisdicciones[0]?.ejecucion_pct < 25 && " Lleva menos del 25% ejecutado."}
              </p>
              <p>
                <span className="text-white font-medium">{sinEjecucion} programas</span> tienen plata asignada pero no registran ningún pago.
                {sinEjecucion > 0 && (
                  <Link href="/presupuesto?preset=caja-muerta" className="ml-1">Ver cuáles →</Link>
                )}
              </p>
              <p>
                Al mes 4, la ejecución global es {ejecGlobal.toFixed(0)}%.
                El ritmo lineal esperado a esta altura del año sería 33%.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* === ¿QUIÉN COBRA? === */}
      <section className="border-t border-border pt-8">
        <div className="font-data text-[11px] uppercase tracking-[0.2em] text-mint mb-2">Contrataciones 2015–2026</div>
        <h3 className="text-2xl font-bold text-white mb-1">¿Quién cobra?</h3>
        <p className="text-[11px] text-text-secondary mb-2">(montos en pesos nominales)</p>
        <p className="text-text-secondary mb-4">
          {stats.adjudicaciones.toLocaleString()} contratos adjudicados a {stats.proveedores_unicos.toLocaleString()} proveedores.
          El {pctDirecta}% fue por contratación directa (sin competencia abierta).
        </p>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-0 border border-border">
          {stats.top5.map((p, i) => (
            <Link key={p.cuit} href={`/identidades/${p.cuit}`}
              className="block p-4 border-r border-border no-underline hover:bg-surface hover:no-underline transition-colors last:border-r-0">
              <div className="font-data text-[10px] text-text-muted">#{i + 1}</div>
              <div className="text-sm font-medium text-white mt-1 leading-tight">{p.nombre}</div>
              <div className="font-data text-lg text-mint mt-2">{formatPesos(p.adjudicado)}</div>
              <div className="font-data text-[10px] text-text-secondary mt-1">
                {p.contratos} contratos · {p.jurisdicciones} organismos
              </div>
            </Link>
          ))}
        </div>
        <Link href="/patrones" className="inline-block mt-4 font-data text-[11px] uppercase tracking-widest text-mint">
          Ver todos los patrones de contratación →
        </Link>
      </section>

      {/* === ¿QUIÉN DONA Y QUIÉN COBRA? === */}
      <section className="border-t border-border pt-8">
        <div className="font-data text-[11px] uppercase tracking-[0.2em] text-mint mb-2">Aportes de campaña × Contrataciones</div>
        <h3 className="text-2xl font-bold text-white mb-1">¿Quién dona y quién cobra?</h3>
        <p className="text-[11px] text-text-secondary mb-2">(montos en pesos nominales)</p>
        <p className="text-text-secondary mb-4">
          De {stats.donantes_unicos.toLocaleString()} donantes de campaña registrados en la CNE,{" "}
          <span className="text-white font-medium">{stats.coincidencias}</span>{" "}
          también son proveedores del Estado.
        </p>

        {stats.top5donantes.length > 0 ? (
          <div className="space-y-2">
            {stats.top5donantes.map((d) => {
              const ratio = d.aportado > 0 ? (d.adjudicado / d.aportado).toFixed(0) : "—";
              return (
                <Link key={d.cuit} href={`/identidades/${d.cuit}`}
                  className="flex items-center gap-4 border border-border p-3 no-underline hover:bg-surface hover:no-underline transition-colors">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-white font-medium">{d.nombre}</div>
                    <div className="font-data text-[10px] text-text-secondary mt-0.5">
                      Donó a {d.partidos.slice(0, 2).join(", ").substring(0, 60)}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-data text-[10px] text-text-secondary">Donó {formatPesos(d.aportado)}</div>
                    <div className="font-data text-[10px] text-text-secondary">Cobró {formatPesos(d.adjudicado)}</div>
                  </div>
                  <div className="font-data text-lg text-mint shrink-0 w-16 text-right">{ratio}x</div>
                </Link>
              );
            })}
          </div>
        ) : (
          <p className="text-text-muted">Sin datos de aportes cargados.</p>
        )}
        <Link href="/nexo" className="inline-block mt-4 font-data text-[11px] uppercase tracking-widest text-mint">
          Explorar el cruce completo →
        </Link>
      </section>

      {/* === DATOS INTERESANTES === */}
      <section className="border-t border-border pt-8">
        <div className="font-data text-[11px] uppercase tracking-[0.2em] text-mint mb-2">Cruces de datos</div>
        <h3 className="text-2xl font-bold text-white mb-2">Datos interesantes</h3>
        <p className="text-text-secondary mb-6">
          Patrones que emergen al cruzar las bases de datos.
        </p>
        <InsightsSection
          distribucion={distribucion}
          ratioContratos={ratioContratos}
          boxplot={boxplot}
          antesVsDespues={antesVsDespues}
          heatmap={heatmap}
          timeline={timeline}
          coocurrencia={coocurrencia}
        />
      </section>

      {/* === FUENTES === */}
      <section className="border-t border-border pt-8">
        <div className="font-data text-[11px] uppercase tracking-[0.2em] text-text-muted mb-3">Fuentes de datos</div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { name: "Presupuesto Abierto", desc: "API SITIF — presupuesto nacional en tiempo real", rows: "359 programas" },
            { name: "COMPR.AR", desc: "Contrataciones del Estado — scrapeado del portal oficial", rows: `${stats.adjudicaciones.toLocaleString()} adjudicaciones` },
            { name: "CNE", desc: "Cámara Nacional Electoral — aportes de campaña", rows: `${stats.aportes.toLocaleString()} aportes` },
          ].map((s) => (
            <div key={s.name} className="border border-border p-4">
              <div className="text-sm font-medium text-white">{s.name}</div>
              <div className="text-[11px] text-text-secondary mt-1">{s.desc}</div>
              <div className="font-data text-[10px] text-mint mt-2">{s.rows}</div>
            </div>
          ))}
        </div>
      </section>

    </div>
  );
}
