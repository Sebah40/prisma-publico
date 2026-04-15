import { Suspense } from "react";
import {
  getUltimoSnapshot,
  agregarPorJurisdiccion,
  enriquecerProgramas,
} from "@/lib/queries";
import { countOutliers, OUTLIER_PRESETS } from "@/lib/outliers";
import { Treemap } from "@/components/presupuesto/treemap";
import { TablaProgramas } from "@/components/presupuesto/tabla-programas";
import { ScatterPlot } from "@/components/presupuesto/scatter-plot";
import { TopOutliers } from "@/components/presupuesto/top-outliers";
import { formatARSCompact } from "@/lib/format";
import { InfoTip } from "@/components/ui/tooltip";

export const revalidate = 3600;

export default async function PresupuestoPage() {
  const snapshot = await getUltimoSnapshot();

  if (snapshot.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <div className="font-data text-2xl text-muted">—</div>
          <div className="mt-2 text-xs text-gris-400">Sin datos de presupuesto</div>
        </div>
      </div>
    );
  }

  const jurisdicciones = agregarPorJurisdiccion(snapshot);
  const programas = enriquecerProgramas(snapshot);
  const fecha = snapshot[0].fecha;
  const counts = countOutliers(programas);

  const totalVigente = jurisdicciones.reduce((s, j) => s + j.credito_vigente, 0);
  const totalPagado = jurisdicciones.reduce((s, j) => s + j.credito_pagado, 0);
  const ejecGlobal = totalVigente > 0 ? (totalPagado / totalVigente) * 100 : 0;

  const jurOptions = jurisdicciones.map((j) => ({
    id: j.jurisdiccion_id,
    desc: j.jurisdiccion_desc,
  }));

  return (
    <div className="h-full overflow-y-auto">
      {/* Header */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-border px-6 py-3 gap-1">
        <div>
          <h1 className="text-sm font-medium text-gris-200">
            Panorama de Gasto Público
          </h1>
          <p className="text-[10px] text-muted">
            {counts.anomalias} patrones destacados en {snapshot.length} programas
          </p>
        </div>
        <div className="text-right font-data text-[10px]">
          <div className="text-gris-200">{fecha}</div>
          <div className="text-muted">
            {snapshot.length} programas · {jurisdicciones.length} jurisdicciones
          </div>
        </div>
      </header>

      {/* Alert counts */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-0 border-b border-border">
        {(["anomalias", "plata-quieta", "decreto", "deuda", "caja-muerta", "recorte"] as const).map((presetId) => {
          const preset = OUTLIER_PRESETS.find(p => p.id === presetId);
          const value = counts[presetId];
          const accent = presetId === "anomalias" ? "text-alerta"
            : presetId === "decreto" || presetId === "recorte" ? (value > 0 ? "text-cobalto-claro" : undefined)
            : value > 0 ? "text-alerta" : undefined;
          return (
            <AlertStat
              key={presetId}
              label={preset?.label.toUpperCase() ?? presetId}
              value={value}
              accent={accent}
              tip={preset?.tooltip}
            />
          );
        })}
      </div>

      {/* Scatter plot */}
      <div className="border-b border-border">
        <div className="px-4 py-2 text-[10px] font-medium uppercase tracking-wider text-muted">
          Distribución del gasto — cada punto es un programa
          <InfoTip text="Eje X: presupuesto vigente (escala logarítmica). Eje Y: % de ejecución. Abajo-derecha = presupuesto alto con baja ejecución." />
        </div>
        <ScatterPlot data={programas} />
      </div>

      {/* Top outliers bar charts */}
      <div className="border-b border-border">
        <div className="px-4 py-2 text-[10px] font-medium uppercase tracking-wider text-muted">
          Programas destacados por categoría — click para abrir dossier
        </div>
        <TopOutliers data={programas} />
      </div>

      {/* Treemap */}
      <div className="border-b border-border overflow-x-auto">
        <div className="px-4 py-2 text-[10px] font-medium uppercase tracking-wider text-muted">
          Jurisdicciones — tamaño = vigente, brillo = ejecución
        </div>
        <Treemap data={jurisdicciones} />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-0 border-b border-border">
        <Stat label="VIGENTE TOTAL" value={formatARSCompact(totalVigente)} tip="Suma del presupuesto ajustado de todos los programas" />
        <Stat label="PAGADO TOTAL" value={formatARSCompact(totalPagado)} tip="Dinero que efectivamente salió de las cuentas del Estado" />
        <Stat
          label="EJECUCIÓN GLOBAL"
          value={`${ejecGlobal.toFixed(1)}%`}
          accent={ejecGlobal < 20 ? "text-alerta" : undefined}
          tip="Pagado total / Vigente total"
        />
        <Stat label="PROGRAMAS" value={snapshot.length} />
      </div>

      {/* Full table — default to anomalies preset */}
      <div>
        <div className="px-4 py-2 text-[10px] font-medium uppercase tracking-wider text-muted">
          Detalle por programa — filtro: patrones destacados
        </div>
        <Suspense fallback={<div className="p-4 text-xs text-muted">Cargando...</div>}>
          <TablaProgramas
            programas={programas}
            jurisdicciones={jurOptions}
          />
        </Suspense>
      </div>
    </div>
  );
}

function AlertStat({
  label,
  value,
  accent,
  tip,
}: {
  label: string;
  value: number;
  accent?: string;
  tip?: string;
}) {
  return (
    <div className="border-r border-border px-3 py-2">
      <div className="text-[9px] font-medium uppercase tracking-wider text-muted">
        {label}
        {tip && <InfoTip text={tip} />}
      </div>
      <div className={`font-data text-lg ${value > 0 ? (accent ?? "text-gris-200") : "text-muted"}`}>
        {value}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
  tip,
}: {
  label: string;
  value: string | number;
  accent?: string;
  tip?: string;
}) {
  return (
    <div className="border-r border-border px-4 py-2">
      <div className="text-[10px] font-medium uppercase tracking-wider text-muted">
        {label}
        {tip && <InfoTip text={tip} />}
      </div>
      <div className={`font-data text-lg ${accent ?? "text-gris-200"}`}>
        {value}
      </div>
    </div>
  );
}
