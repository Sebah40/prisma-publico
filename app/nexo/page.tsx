import { getNexoPoints, getNexoKPIs } from "@/lib/nexo";
import { formatPesos } from "@/lib/format";
import { InfoTip } from "@/components/ui/tooltip";
import { NexoDashboard } from "@/components/nexo/dashboard";

export const revalidate = 3600;

export default async function NexoPage() {
  const [points, kpis] = await Promise.all([
    getNexoPoints(),
    getNexoKPIs(),
  ]);

  return (
    <div className="h-full overflow-y-auto">
      <header className="border-b border-border px-6 py-3">
        <h1 className="text-sm font-medium text-gris-200">
          Financiamiento y Contratación
        </h1>
        <p className="text-[10px] text-muted">
          CUITs que figuran como donantes de campaña (CNE) y como proveedores del Estado (COMPR.AR) — montos en pesos de Feb 2026
        </p>
      </header>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-0 border-b border-border">
        <KPI
          label="COINCIDENCIAS"
          value={kpis.total_coincidencias}
          tip="CUITs que aparecen tanto en aportes de campaña como en adjudicaciones del Estado"
        />
        <KPI
          label="INVERSIÓN POLÍTICA IDENTIFICADA"
          value={formatPesos(kpis.inversion_total)}
          tip="Suma total de aportes a campañas realizados por empresas que también son proveedoras del Estado (pesos ajustados)"
        />
        <KPI
          label="RETORNO PROMEDIO"
          value={`${kpis.retorno_promedio.toFixed(0)}x`}
          tip="Promedio del ratio adjudicado/aportado entre todas las coincidencias"
        />
        <KPI
          label="MAYOR RATIO"
          value={`${kpis.nodo_mayor_nombre.substring(0, 25)}`}
          subtitle={`${kpis.nodo_mayor_ratio.toFixed(0)}x`}
          tip={`${kpis.nodo_mayor_nombre}: por cada peso aportado a campañas, recibió ${kpis.nodo_mayor_ratio.toFixed(0)} pesos en contratos del Estado`}
        />
      </div>

      {/* Interactive dashboard (client component) */}
      <NexoDashboard points={points} />
    </div>
  );
}

function KPI({ label, value, subtitle, tip }: { label: string; value: string | number; subtitle?: string; tip?: string }) {
  return (
    <div className="border-r border-border px-4 py-3">
      <div className="text-[9px] font-medium uppercase tracking-wider text-muted">
        {label}
        {tip && <InfoTip text={tip} />}
      </div>
      <div className="font-data text-lg text-gris-200">{value}</div>
      {subtitle && <div className="font-data text-sm text-cobalto">{subtitle}</div>}
    </div>
  );
}
