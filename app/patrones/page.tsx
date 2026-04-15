import Link from "next/link";
import {
  getTopProveedores,
  getRecurrentes,
  getConcentrados,
  getDiversificados,
  getPatronesJurisdiccion,
  getTimeline,
  getDirectaPorMonto,
} from "@/lib/patrones";
import { formatPesos } from "@/lib/format";
import { InfoTip } from "@/components/ui/tooltip";
import {
  ScatterContratosVsMonto,
  BubbleJurisdicciones,
  TimelineContratos,
  DualBarDirecta,
} from "@/components/patrones/charts";

export const dynamic = "force-dynamic";

const TAG_STYLE: Record<string, string> = {
  Recurrente: "bg-cobalto/20 text-cobalto-claro",
  Concentrado: "bg-alerta/20 text-alerta",
  Diversificado: "bg-ok/20 text-ok",
  "Alto volumen": "bg-gris-600/30 text-gris-200",
};

export default async function PatronesPage() {
  const [top, recurrentes, concentrados, diversificados, jurisdicciones, timeline, dualBar] = await Promise.all([
    getTopProveedores(15),
    getRecurrentes(20),
    getConcentrados(20),
    getDiversificados(20),
    getPatronesJurisdiccion(),
    getTimeline(),
    getDirectaPorMonto(),
  ]);

  const topDirectas = jurisdicciones.filter(j => j.pct_directas > 50).slice(0, 15);

  return (
    <div className="h-full overflow-y-auto">
      {/* Header */}
      <header className="border-b border-border px-6 py-3">
        <h1 className="text-sm font-medium text-gris-200">
          Patrones de Contratación
        </h1>
        <p className="text-[10px] text-muted">
          Indicadores factuales — adjudicaciones históricas COMPR.AR (montos en pesos nominales)
        </p>
      </header>

      {/* Summary stats — each clickable */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-0 border-b border-border">
        <Stat label="RECURRENTES" value={recurrentes.length} tip="CUITs que ganaron contratos en 3 o más años distintos" href="#recurrentes" />
        <Stat label="CONCENTRADOS" value={concentrados.length} tip="CUITs que operan en 1 sola jurisdicción con 5+ contratos" href="#concentrados" />
        <Stat label="DIVERSIFICADOS" value={diversificados.length} tip="CUITs que operan en 5 o más jurisdicciones distintas" href="#diversificados" />
        <Stat label="SAFs CON >50% DIRECTA" value={topDirectas.length} tip="Organismos donde más de la mitad de las compras se hicieron por contratación directa" href="#directa" />
        <Stat
          label="TOP CUIT MONTO"
          value={top[0] ? formatPesos(top[0].total_adjudicado) : "—"}
          subtitle={top[0]?.razon_social}
          tip="Mayor monto adjudicado acumulado por un solo CUIT"
          href={top[0] ? `/identidades/${top[0].cuit}` : undefined}
        />
      </div>

      {/* === VISUAL ANALYTICS === */}

      {/* Chart 1: Scatter — pocos contratos, monto alto */}
      <div className="border-b border-border">
        <div className="px-4 py-2 text-[10px] font-medium uppercase tracking-wider text-muted">
          Desproporción: cantidad de contratos vs monto promedio
          <InfoTip text="Cada punto es un CUIT. Los puntos arriba-izquierda (pocos contratos, monto altísimo) pueden indicar un contrato inflado o adjudicación excepcional. Click en un punto para ver el detalle del proveedor" />
        </div>
        <ScatterContratosVsMonto
          data={top.map(p => ({
            cuit: p.cuit,
            nombre: p.razon_social,
            contratos: p.cantidad_contratos,
            montoPromedio: p.cantidad_contratos > 0 ? p.total_adjudicado / p.cantidad_contratos : 0,
            total: p.total_adjudicado,
          }))}
        />
      </div>

      {/* Chart 2: Bubble — jurisdicciones */}
      <div className="border-b border-border">
        <div className="px-4 py-2 text-[10px] font-medium uppercase tracking-wider text-muted">
          Mapa de jurisdicciones: proveedores vs monto vs % directa
          <InfoTip text="Cada burbuja es un organismo. Tamaño = % contratación directa. Los que están arriba-izquierda (mucha plata, pocos proveedores) tienen menor competencia. Rojo = más de 70% directa" />
        </div>
        <BubbleJurisdicciones
          data={jurisdicciones.map(j => ({
            safId: j.saf_id,
            saf: j.saf_desc,
            proveedores: j.proveedores_unicos,
            monto: j.total_monto,
            pctDirecta: j.pct_directas,
            contratos: j.total_contratos,
          }))}
        />
      </div>

      {/* Chart 3: Timeline */}
      <div className="border-b border-border">
        <div className="px-4 py-2 text-[10px] font-medium uppercase tracking-wider text-muted">
          Volumen de contratación por mes
          <InfoTip text="Cantidad de contratos adjudicados por mes. Los picos a fin de año suelen indicar apuro por gastar el presupuesto antes de perderlo (diciembre rush). Rojo = contratación directa" />
        </div>
        <TimelineContratos data={timeline} />
      </div>

      {/* Chart 4: Dual bar — % directa por monto vs cantidad */}
      {dualBar.length > 0 && (
        <div className="border-b border-border">
          <div className="px-4 py-2 text-[10px] font-medium uppercase tracking-wider text-muted">
            Contratación directa: % por cantidad vs % por monto
            <InfoTip text="Compara el porcentaje de contratación directa medido por cantidad de contratos vs por monto total. Si el % por monto es mucho mayor, significa que los contratos grandes se adjudican por directa mientras las licitaciones son para las compras chicas" />
          </div>
          <DualBarDirecta data={dualBar} />
        </div>
      )}

      {/* Section 1: Contratación Directa por Jurisdicción */}
      <div id="directa" className="border-b border-border scroll-mt-4">
        <div className="px-4 py-2 text-[10px] font-medium uppercase tracking-wider text-muted">
          Contratación directa por organismo
          <InfoTip text="Porcentaje de contratos adjudicados por contratación directa (sin competencia abierta). Un porcentaje alto no es ilegal, pero reduce la transparencia del proceso de selección" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-0">
          {/* Bar chart */}
          <div className="border-r border-border">
            <div className="divide-y divide-border">
              {topDirectas.map((j) => (
                <div key={j.saf_id} className="flex items-center gap-3 px-4 py-1.5">
                  <div className="min-w-0 flex-1">
                    <div className="text-[10px] text-gris-200 truncate">{j.saf_desc}</div>
                    <div className="mt-0.5 h-1.5 w-full bg-border">
                      <div
                        className={`h-full ${j.pct_directas > 80 ? "bg-alerta" : j.pct_directas > 60 ? "bg-alerta/60" : "bg-cobalto"}`}
                        style={{ width: `${Math.min(j.pct_directas, 100)}%` }}
                      />
                    </div>
                  </div>
                  <div className="shrink-0 text-right font-data text-[10px]">
                    <span className={j.pct_directas > 80 ? "text-alerta" : "text-gris-400"}>
                      {j.pct_directas.toFixed(0)}%
                    </span>
                    <div className="text-muted">{j.total_contratos} contr.</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          {/* Summary table */}
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead className="border-b border-border bg-grafito text-[9px] uppercase tracking-wider text-muted">
                <tr>
                  <th className="px-3 py-1.5 font-medium">Organismo (SAF)</th>
                  <th className="px-3 py-1.5 font-medium text-right">Contratos</th>
                  <th className="px-3 py-1.5 font-medium text-right">Directas</th>
                  <th className="px-3 py-1.5 font-medium text-right">% Dir.</th>
                  <th className="px-3 py-1.5 font-medium text-right">Proveedores</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {topDirectas.map((j) => (
                  <tr key={j.saf_id} className="hover:bg-grafito/50">
                    <td className="px-3 py-1 text-[10px] text-gris-200 max-w-48 truncate">{j.saf_desc}</td>
                    <td className="px-3 py-1 text-right font-data text-[10px] text-gris-400">{j.total_contratos}</td>
                    <td className="px-3 py-1 text-right font-data text-[10px] text-gris-400">{j.total_directas}</td>
                    <td className="px-3 py-1 text-right font-data text-[10px]">
                      <span className={j.pct_directas > 80 ? "text-alerta" : "text-gris-200"}>
                        {j.pct_directas.toFixed(0)}%
                      </span>
                    </td>
                    <td className="px-3 py-1 text-right font-data text-[10px] text-muted">{j.proveedores_unicos}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Section 2: Top CUITs por monto */}
      <div className="border-b border-border">
        <div className="px-4 py-2 text-[10px] font-medium uppercase tracking-wider text-muted">
          Mayor volumen adjudicado por CUIT
          <InfoTip text="CUITs que acumularon los mayores montos en adjudicaciones entre 2015-2020. Los montos son en pesos nominales de cada año (no ajustados por inflación)" />
        </div>
        <div className="divide-y divide-border">
          {top.map((p, i) => {
            const maxMonto = top[0]?.total_adjudicado || 1;
            const pct = (p.total_adjudicado / maxMonto) * 100;
            return (
              <Link
                key={p.cuit}
                href={`/identidades/${p.cuit}`}
                className="flex items-center gap-3 px-4 py-2 no-underline hover:bg-grafito/50 hover:no-underline"
              >
                <span className="font-data text-[10px] text-muted w-5 shrink-0">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gris-200 truncate">{p.razon_social}</span>
                    {p.indicadores.map(tag => (
                      <span key={tag} className={`shrink-0 px-1 py-0.5 text-[8px] font-medium ${TAG_STYLE[tag] ?? "bg-muted/20 text-muted"}`}>
                        {tag}
                      </span>
                    ))}
                  </div>
                  <div className="mt-0.5 flex items-center gap-2">
                    <div className="h-1 flex-1 bg-border">
                      <div className="h-full bg-cobalto" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="font-data text-[9px] text-muted shrink-0">
                      {p.cuit}
                    </span>
                  </div>
                </div>
                <div className="shrink-0 text-right font-data">
                  <div className="text-[11px] text-gris-200">{formatPesos(p.total_adjudicado)}</div>
                  <div className="text-[9px] text-muted">{p.cantidad_contratos} contr. · {p.anios_activo} años</div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Section 3: Recurrentes */}
      <div id="recurrentes" className="border-b border-border scroll-mt-4">
        <div className="px-4 py-2 text-[10px] font-medium uppercase tracking-wider text-muted">
          Proveedores recurrentes (3+ años)
          <InfoTip text="CUITs que ganaron al menos una adjudicación en 3 o más años distintos dentro del período 2015-2020" />
        </div>
        <CUITTable data={recurrentes} sortBy="anios" />
      </div>

      {/* Section 4: Concentrados */}
      <div id="concentrados" className="border-b border-border scroll-mt-4">
        <div className="px-4 py-2 text-[10px] font-medium uppercase tracking-wider text-muted">
          Proveedores concentrados (1 sola jurisdicción)
          <InfoTip text="CUITs con 5+ contratos que operaron exclusivamente en un solo organismo del Estado. Puede indicar especialización legítima o relación preferencial" />
        </div>
        <CUITTable data={concentrados} sortBy="contratos" />
      </div>

      {/* Section 5: Diversificados */}
      <div id="diversificados" className="border-b border-border scroll-mt-4">
        <div className="px-4 py-2 text-[10px] font-medium uppercase tracking-wider text-muted">
          Proveedores diversificados (5+ jurisdicciones)
          <InfoTip text="CUITs que ganaron contratos en 5 o más organismos distintos del Estado. Puede ser un gran proveedor legítimo o una empresa con alcance inusualmente amplio" />
        </div>
        <CUITTable data={diversificados} sortBy="contratos" />
      </div>

      {/* Section 6: Distribution charts */}
      <div className="border-b border-border">
        <div className="px-4 py-2 text-[10px] font-medium uppercase tracking-wider text-muted">
          Distribución de contratos por proveedor
          <InfoTip text="Cuántos contratos acumula cada proveedor. En un mercado competitivo, los contratos se distribuyen entre muchos proveedores. Si pocos CUITs concentran muchos contratos, hay menos competencia" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-0">
          {/* Concentration chart: top 10 vs rest */}
          <div className="border-r border-border p-4">
            <div className="text-[10px] text-muted mb-2">Top 10 CUITs vs el resto</div>
            {(() => {
              const top10monto = top.slice(0, 10).reduce((s, p) => s + p.total_adjudicado, 0);
              const totalMonto = top.reduce((s, p) => s + p.total_adjudicado, 0);
              const pct10 = totalMonto > 0 ? (top10monto / totalMonto * 100) : 0;
              return (
                <div>
                  <div className="flex h-6 w-full">
                    <div className="bg-cobalto flex items-center justify-center text-[9px] text-white font-data" style={{ width: `${pct10}%` }}>
                      {pct10.toFixed(0)}%
                    </div>
                    <div className="bg-border flex-1 flex items-center justify-center text-[9px] text-muted font-data">
                      {(100 - pct10).toFixed(0)}%
                    </div>
                  </div>
                  <div className="flex justify-between mt-1 text-[9px] text-muted">
                    <span>Top 10 CUITs: {formatPesos(top10monto)}</span>
                    <span>Resto: {formatPesos(totalMonto - top10monto)}</span>
                  </div>
                </div>
              );
            })()}
          </div>
          {/* Contracts per provider histogram-like */}
          <div className="p-4">
            <div className="text-[10px] text-muted mb-2">Distribución de cantidad de contratos por CUIT</div>
            {(() => {
              const buckets = [
                { label: "1 contrato", min: 1, max: 1, count: 0 },
                { label: "2-5", min: 2, max: 5, count: 0 },
                { label: "6-20", min: 6, max: 20, count: 0 },
                { label: "21-50", min: 21, max: 50, count: 0 },
                { label: "50+", min: 51, max: 999999, count: 0 },
              ];
              // We only have the top providers loaded, estimate from what we have
              for (const p of [...top, ...recurrentes, ...concentrados, ...diversificados]) {
                for (const b of buckets) {
                  if (p.cantidad_contratos >= b.min && p.cantidad_contratos <= b.max) { b.count++; break; }
                }
              }
              const maxCount = Math.max(...buckets.map(b => b.count), 1);
              return (
                <div className="space-y-1">
                  {buckets.map(b => (
                    <div key={b.label} className="flex items-center gap-2">
                      <span className="font-data text-[9px] text-muted w-16 shrink-0 text-right">{b.label}</span>
                      <div className="h-3 flex-1 bg-border">
                        <div className="h-full bg-cobalto/60" style={{ width: `${(b.count / maxCount) * 100}%` }} />
                      </div>
                      <span className="font-data text-[9px] text-gris-400 w-6">{b.count}</span>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
        </div>
      </div>
    </div>
  );
}

function CUITTable({
  data,
  sortBy,
}: {
  data: { cuit: string; razon_social: string; total_adjudicado: number; cantidad_contratos: number; anios_activo: number; jurisdicciones_distintas: number; indicadores: string[] }[];
  sortBy: "anios" | "contratos";
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left">
        <thead className="border-b border-border bg-grafito text-[9px] uppercase tracking-wider text-muted">
          <tr>
            <th className="px-3 py-1.5 font-medium">CUIT</th>
            <th className="px-3 py-1.5 font-medium">Razón Social</th>
            <th className="px-3 py-1.5 font-medium text-right">Adjudicado</th>
            <th className="px-3 py-1.5 font-medium text-right">Contratos</th>
            <th className="px-3 py-1.5 font-medium text-right">Años</th>
            <th className="px-3 py-1.5 font-medium text-right">JUR</th>
            <th className="px-3 py-1.5 font-medium">Indicadores</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {data.map((p) => (
            <tr key={p.cuit} className="hover:bg-grafito/50">
              <td className="px-3 py-1 font-data text-[10px]">
                <Link href={`/identidades/${p.cuit}`} className="text-cobalto-claro">
                  {p.cuit}
                </Link>
              </td>
              <td className="px-3 py-1 text-[11px] text-gris-200 max-w-56 truncate">
                <Link href={`/identidades/${p.cuit}`} className="text-gris-200 hover:text-cobalto-claro">
                  {p.razon_social}
                </Link>
              </td>
              <td className="px-3 py-1 text-right font-data text-[10px] text-gris-200">
                {formatPesos(p.total_adjudicado)}
              </td>
              <td className="px-3 py-1 text-right font-data text-[10px] text-gris-400">
                {p.cantidad_contratos}
              </td>
              <td className="px-3 py-1 text-right font-data text-[10px] text-gris-400">
                {p.anios_activo}
              </td>
              <td className="px-3 py-1 text-right font-data text-[10px] text-gris-400">
                {p.jurisdicciones_distintas}
              </td>
              <td className="px-3 py-1">
                <div className="flex gap-1">
                  {p.indicadores.map(tag => (
                    <span key={tag} className={`px-1 py-0.5 text-[8px] font-medium ${TAG_STYLE[tag] ?? "bg-muted/20 text-muted"}`}>
                      {tag}
                    </span>
                  ))}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Stat({ label, value, subtitle, tip, href }: { label: string; value: string | number; subtitle?: string; tip?: string; href?: string }) {
  const content = (
    <div className={`border-r border-border px-3 py-2 ${href ? "cursor-pointer hover:bg-grafito/50 transition-colors" : ""}`}>
      <div className="text-[9px] font-medium uppercase tracking-wider text-muted">
        {label}
        {tip && <InfoTip text={tip} />}
      </div>
      <div className="font-data text-lg text-gris-200">{value}</div>
      {subtitle && <div className="text-[9px] text-muted truncate">{subtitle}</div>}
    </div>
  );
  if (href) {
    return <Link href={href} className="no-underline hover:no-underline">{content}</Link>;
  }
  return content;
}
