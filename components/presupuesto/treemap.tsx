"use client";

import Link from "next/link";
import { formatARSCompact } from "@/lib/format";
import type { JurisdiccionAgregada } from "@/lib/queries";

/**
 * Treemap industrial: bloques proporcionales al vigente,
 * opacidad proporcional a la ejecución.
 *
 * Ejecución baja = bloque oscuro (menor actividad de gasto).
 * Ejecución alta = bloque brillante (plata en movimiento).
 */
export function Treemap({ data }: { data: JurisdiccionAgregada[] }) {
  const totalVigente = data.reduce((s, d) => s + d.credito_vigente, 0);
  if (totalVigente === 0) return null;

  return (
    <div className="flex flex-wrap gap-px bg-border p-px">
      {data.map((j) => {
        const share = (j.credito_vigente / totalVigente) * 100;
        // Minimum 4% width so small jurisdictions are clickable
        const width = Math.max(share, 4);
        // Ejecución maps to opacity: 0% exec → 0.15, 100% exec → 0.9
        const opacity = 0.15 + (j.ejecucion_pct / 100) * 0.75;
        const isLow = j.ejecucion_pct < 10;
        const isHigh = j.ejecucion_pct > 50;

        return (
          <Link
            key={j.jurisdiccion_id}
            href={`/presupuesto?jurisdiccion=${j.jurisdiccion_id}`}
            className="group relative no-underline hover:no-underline"
            style={{
              width: `calc(${width}% - 1px)`,
              minHeight: share > 10 ? "120px" : "80px",
            }}
          >
            <div
              className="flex h-full flex-col justify-between border border-transparent p-2 transition-colors group-hover:border-cobalto"
              style={{
                backgroundColor: isLow
                  ? `rgba(204, 51, 51, ${opacity * 0.6})`
                  : `rgba(0, 71, 171, ${opacity})`,
              }}
            >
              <div>
                <div className="text-[10px] font-medium text-white/60">
                  JUR {j.jurisdiccion_id}
                </div>
                <div className="text-[11px] font-medium leading-tight text-white/90">
                  {j.jurisdiccion_desc.length > 40
                    ? j.jurisdiccion_desc.slice(0, 37) + "..."
                    : j.jurisdiccion_desc}
                </div>
              </div>
              <div className="mt-1">
                <div className="font-data text-xs text-white/80">
                  {formatARSCompact(j.credito_vigente)}
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`font-data text-[10px] ${
                      isLow
                        ? "text-alerta"
                        : isHigh
                          ? "text-ok"
                          : "text-white/50"
                    }`}
                  >
                    {j.ejecucion_pct.toFixed(0)}% ejec
                  </span>
                  <span className="text-[10px] text-white/30">
                    {j.programas_count} prg
                  </span>
                </div>
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
