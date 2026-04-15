"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatPesos } from "@/lib/format";
import type { NexoTimeline, NexoJurisdiccion } from "@/lib/nexo";

interface Props {
  cuit: string;
  nombre: string;
}

export function DetailPanel({ cuit, nombre }: Props) {
  const [timeline, setTimeline] = useState<NexoTimeline[] | null>(null);
  const [jurisdicciones, setJurisdicciones] = useState<NexoJurisdiccion[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch(`/api/nexo/timeline?cuit=${encodeURIComponent(cuit)}`).then(r => r.json()),
      fetch(`/api/nexo/jurisdicciones?cuit=${encodeURIComponent(cuit)}`).then(r => r.json()),
    ]).then(([tl, jur]) => {
      setTimeline(tl);
      setJurisdicciones(jur);
      setLoading(false);
    });
  }, [cuit]);

  if (loading) {
    return <div className="p-6 text-xs text-muted">Cargando datos de {nombre}...</div>;
  }

  const maxMonto = Math.max(...(timeline || []).map(t => t.monto_ajustado), 1);
  const maxJur = Math.max(...(jurisdicciones || []).map(j => j.monto_ajustado), 1);

  return (
    <div className="border-t border-border">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-6 py-3 bg-grafito">
        <div>
          <div className="text-sm font-medium text-gris-200">{nombre}</div>
          <div className="font-data text-[10px] text-muted">{cuit}</div>
        </div>
        <Link
          href={`/identidades/${cuit}`}
          className="border border-border px-3 py-1 text-[10px] text-gris-400 hover:bg-grafito hover:text-gris-200 no-underline"
        >
          Ver ficha completa →
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-0">
        {/* Timeline */}
        <div className="border-r border-border p-4">
          <div className="text-[10px] font-medium uppercase tracking-wider text-muted mb-3">
            Línea de tiempo: aportes y contratos
          </div>
          <div className="space-y-1 max-h-72 overflow-y-auto">
            {(timeline || []).map((ev, i) => {
              const barWidth = (ev.monto_ajustado / maxMonto) * 100;
              return (
                <div key={i} className="flex items-center gap-2">
                  <span className="font-data text-[9px] text-muted w-20 shrink-0">{ev.fecha}</span>
                  <div className={`h-4 flex items-center ${ev.tipo === "aporte" ? "" : "flex-row-reverse"}`}
                    style={{ width: "100%" }}>
                    {ev.tipo === "aporte" ? (
                      <div className="flex items-center gap-1 w-full">
                        <div className="h-3 bg-cobalto/70" style={{ width: `${Math.max(barWidth, 2)}%` }} />
                        <span className="text-[8px] text-cobalto shrink-0">CNE</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 w-full">
                        <div className="h-3 bg-gris-600/50" style={{ width: `${Math.max(barWidth, 2)}%` }} />
                        <span className="text-[8px] text-gris-400 shrink-0">COMPR.AR</span>
                      </div>
                    )}
                  </div>
                  <span className="font-data text-[9px] text-gris-400 shrink-0 w-20 text-right">
                    {formatPesos(ev.monto_ajustado)}
                  </span>
                </div>
              );
            })}
          </div>
          {timeline && timeline.length === 0 && (
            <div className="text-[10px] text-muted py-4 text-center">Sin datos de timeline</div>
          )}
        </div>

        {/* Jurisdicciones heatmap */}
        <div className="p-4">
          <div className="text-[10px] font-medium uppercase tracking-wider text-muted mb-3">
            Distribución por organismo
          </div>
          <div className="space-y-1">
            {(jurisdicciones || []).slice(0, 10).map((j, i) => {
              const pct = (j.monto_ajustado / maxJur) * 100;
              return (
                <div key={i} className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-[10px] text-gris-200 truncate">{j.saf_desc}</div>
                    <div className="mt-0.5 h-2 w-full bg-border">
                      <div className="h-full bg-cobalto/40" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="font-data text-[10px] text-gris-200">{formatPesos(j.monto_ajustado)}</div>
                    <div className="font-data text-[8px] text-muted">{j.contratos} contr.</div>
                  </div>
                </div>
              );
            })}
          </div>
          {jurisdicciones && jurisdicciones.length === 0 && (
            <div className="text-[10px] text-muted py-4 text-center">Sin datos de jurisdicciones</div>
          )}
        </div>
      </div>
    </div>
  );
}
