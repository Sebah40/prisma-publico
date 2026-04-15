"use client";

import { DistribucionMontos } from "./distribucion-montos";
import { RatioContratosDias } from "./ratio-contratos-dias";
import { BoxPlotProcedimiento } from "./boxplot-procedimiento";
import { AntesVsDespues } from "./antes-vs-despues";
import { HeatmapProveedorOrganismo } from "./heatmap-proveedor-organismo";
import { TimelineAcumulacion } from "./timeline-acumulacion";
import { RedCoocurrencia } from "./red-coocurrencia";
import type {
  DistribucionMontosRow,
  RatioContratosDiasRow,
  BoxPlotRow,
  AntesVsDespuesRow,
  HeatmapRow,
  TimelineAcumulacionRow,
  CoocurrenciaRow,
} from "@/lib/insights";

interface Props {
  distribucion: DistribucionMontosRow[];
  ratioContratos: RatioContratosDiasRow[];
  boxplot: BoxPlotRow[];
  antesVsDespues: AntesVsDespuesRow[];
  heatmap: HeatmapRow[];
  timeline: TimelineAcumulacionRow[];
  coocurrencia: CoocurrenciaRow[];
}

function ChartCard({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="border border-border">
      <div className="px-4 sm:px-5 pt-4 sm:pt-5 pb-2 sm:pb-3">
        <h4 className="text-base sm:text-sm font-medium text-white">{title}</h4>
        <p className="text-xs sm:text-[11px] text-text-secondary mt-0.5">{subtitle}</p>
      </div>
      {children}
    </div>
  );
}

export function InsightsSection({
  distribucion,
  ratioContratos,
  boxplot,
  antesVsDespues,
  heatmap,
  timeline,
  coocurrencia,
}: Props) {
  return (
    <div className="space-y-6">
      {/* Full width: Distribution */}
      {distribucion.length > 0 && (
        <ChartCard
          title="¿Cómo se distribuyen los montos?"
          subtitle="La mayoría de proveedores cobra poco. Unos pocos concentran cifras extremas. Montos en pesos nominales."
        >
          <DistribucionMontos data={distribucion} />
        </ChartCard>
      )}

      {/* 2 cols: Fraccionamiento + Box plot */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {ratioContratos.length > 0 && (
          <ChartCard
            title="¿Hay indicios de fraccionamiento?"
            subtitle="Proveedores con muchos contratos en pocos días. Por debajo de la diagonal = múltiples contratos el mismo día."
          >
            <RatioContratosDias data={ratioContratos} />
          </ChartCard>
        )}
        {boxplot.length > 0 && (
          <ChartCard
            title="¿Cuánto varía el monto por tipo de procedimiento?"
            subtitle="Distribución de montos por mecanismo de compra. Las medianas muestran qué procedimiento mueve más plata."
          >
            <BoxPlotProcedimiento data={boxplot} />
          </ChartCard>
        )}
      </div>

      {/* Full width: Before vs After */}
      {antesVsDespues.length > 0 && (
        <ChartCard
          title="¿Cambian los contratos después de donar a un partido?"
          subtitle="Contratos adjudicados antes vs. después de la primera donación registrada. Montos en pesos nominales."
        >
          <AntesVsDespues data={antesVsDespues} />
        </ChartCard>
      )}

      {/* 2 cols: Heatmap + Timeline */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {heatmap.length > 0 && (
          <ChartCard
            title="¿Qué proveedores dominan qué organismos?"
            subtitle="La intensidad del color muestra concentración: celdas brillantes = mayor volumen de facturación."
          >
            <HeatmapProveedorOrganismo data={heatmap} />
          </ChartCard>
        )}
        {timeline.length > 0 && (
          <ChartCard
            title="¿Cómo crecen los Top 5 en el tiempo?"
            subtitle="Acumulación mes a mes de los proveedores más grandes. La línea gris es el promedio."
          >
            <TimelineAcumulacion data={timeline} />
          </ChartCard>
        )}
      </div>

      {/* Full width: Network */}
      {coocurrencia.length > 0 && (
        <ChartCard
          title="¿Qué proveedores comparten los mismos organismos?"
          subtitle="Cada línea conecta proveedores que aparecen en el mismo organismo el mismo mes."
        >
          <RedCoocurrencia data={coocurrencia} />
        </ChartCard>
      )}
    </div>
  );
}
