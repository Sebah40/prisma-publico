"use client";

import Link from "next/link";
import { formatARSCompact } from "@/lib/format";
import type { ProgramaConMetricas } from "@/lib/queries";

/**
 * Top outlier bar charts — CSS puro, sin librerías.
 * Muestra los peores offenders en cada categoría.
 */

export function TopOutliers({ data }: { data: ProgramaConMetricas[] }) {
  const topDecreto = [...data]
    .filter((p) => p.credito_presupuestado > 100 && p.aumento_discrecional_pct > 10)
    .sort((a, b) => b.aumento_discrecional_pct - a.aumento_discrecional_pct)
    .slice(0, 8);

  const topDeuda = [...data]
    .filter((p) => p.gap_gestion > 50)
    .sort((a, b) => b.gap_gestion - a.gap_gestion)
    .slice(0, 8);

  const topQuieta = [...data]
    .filter((p) => p.credito_vigente > 100 && p.ejecucion_pct < 10)
    .sort((a, b) => b.credito_vigente - a.credito_vigente)
    .slice(0, 8);

  return (
    <div className="grid grid-cols-3 gap-0">
      <BarChart
        title="Mayor aumento por decreto"
        subtitle="Vigente vs presupuestado original"
        items={topDecreto.map((p) => ({
          slug: `${p.jurisdiccion_id}-${p.entidad_id ?? 0}-${p.programa_id}`,
          label: p.programa_desc,
          sublabel: `JUR ${p.jurisdiccion_id}`,
          value: p.aumento_discrecional_pct,
          display: `+${p.aumento_discrecional_pct.toFixed(0)}%`,
        }))}
        color="bg-cobalto"
      />
      <BarChart
        title="Mayor diferencia devengado-pagado"
        subtitle="Devengado sin pagar"
        items={topDeuda.map((p) => ({
          slug: `${p.jurisdiccion_id}-${p.entidad_id ?? 0}-${p.programa_id}`,
          label: p.programa_desc,
          sublabel: `JUR ${p.jurisdiccion_id}`,
          value: p.gap_gestion,
          display: formatARSCompact(p.gap_gestion),
        }))}
        color="bg-alerta"
      />
      <BarChart
        title="Mayor presupuesto con menor ejecución"
        subtitle="Vigente alto, ejecución < 10%"
        items={topQuieta.map((p) => ({
          slug: `${p.jurisdiccion_id}-${p.entidad_id ?? 0}-${p.programa_id}`,
          label: p.programa_desc,
          sublabel: `JUR ${p.jurisdiccion_id} · ${p.ejecucion_pct.toFixed(1)}% ejec`,
          value: p.credito_vigente,
          display: formatARSCompact(p.credito_vigente),
        }))}
        color="bg-alerta/70"
      />
    </div>
  );
}

function BarChart({
  title,
  subtitle,
  items,
  color,
}: {
  title: string;
  subtitle: string;
  items: {
    slug: string;
    label: string;
    sublabel: string;
    value: number;
    display: string;
  }[];
  color: string;
}) {
  const maxVal = Math.max(...items.map((i) => Math.abs(i.value)), 1);

  return (
    <div className="border-r border-border">
      <div className="border-b border-border px-3 py-2">
        <div className="text-[10px] font-medium uppercase tracking-wider text-muted">
          {title}
        </div>
        <div className="text-[9px] text-muted">{subtitle}</div>
      </div>
      <div className="divide-y divide-border">
        {items.length === 0 && (
          <div className="px-3 py-4 text-center text-[10px] text-muted">
            Sin datos
          </div>
        )}
        {items.map((item, i) => {
          const pct = (Math.abs(item.value) / maxVal) * 100;
          return (
            <Link
              key={`${item.slug}-${i}`}
              href={`/presupuesto/${item.slug}`}
              className="group block px-3 py-1.5 no-underline hover:bg-grafito/50 hover:no-underline"
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[10px] text-gris-200 group-hover:text-cobalto-claro truncate max-w-48">
                  {item.label}
                </span>
                <span className="font-data text-[10px] text-gris-200 shrink-0">
                  {item.display}
                </span>
              </div>
              <div className="mt-0.5 flex items-center gap-2">
                <div className="h-1 flex-1 bg-border">
                  <div
                    className={`h-full ${color}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="text-[8px] text-muted shrink-0">
                  {item.sublabel}
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
