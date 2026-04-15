import { notFound } from "next/navigation";
import Link from "next/link";
import { getFichaIdentidad } from "@/lib/identidades";
import { getVinculacionPolitica } from "@/lib/aportes";
import { formatPesos } from "@/lib/format";
import { ExportButtons } from "@/components/presupuesto/export-buttons";
import { InfoTip } from "@/components/ui/tooltip";
import { TimelineVisual } from "@/components/ui/timeline-visual";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ cuit: string }>;
}

export default async function FichaCUITPage({ params }: Props) {
  const { cuit } = await params;
  const [ficha, vinculacion] = await Promise.all([
    getFichaIdentidad(cuit),
    getVinculacionPolitica(cuit),
  ]);
  if (!ficha) notFound();

  // --- Auto-computed values ---
  const primerContrato = ficha.historial.length > 0
    ? ficha.historial[ficha.historial.length - 1]?.fecha_adjudicacion?.substring(0, 4)
    : null;
  const rubros = ficha.rubros.length > 0 ? ficha.rubros.join(", ") : "sin rubro declarado";
  const topOrganismo = ficha.orbita_principal?.jurisdiccion_desc ?? "varios organismos";
  const totalAjustado = ficha.historial.reduce((s, h) => s + (h.monto_ajustado || h.monto), 0);
  const pctTopOrg = ficha.orbita_principal && ficha.total_adjudicado > 0
    ? ((ficha.orbita_principal.monto / ficha.total_adjudicado) * 100).toFixed(0)
    : null;

  // Secuencia temporal
  const primerAporteAnio = vinculacion?.aportes?.[0]?.eleccion_anio ?? null;
  const primerContratoAnio = primerContrato ? parseInt(primerContrato) : null;
  let secuencia = "";
  if (primerAporteAnio && primerContratoAnio) {
    if (primerAporteAnio <= primerContratoAnio) {
      secuencia = `Donó en ${primerAporteAnio}, primer contrato en ${primerContratoAnio}`;
    } else {
      secuencia = `Primer contrato en ${primerContratoAnio}, donó después en ${primerAporteAnio}`;
    }
  }

  // Contratos post-donación
  const primerAporteFecha = vinculacion?.aportes?.[0]?.fecha_aporte ?? (primerAporteAnio ? `${primerAporteAnio}-01-01` : null);
  const contratosPostDonacion = primerAporteFecha
    ? ficha.historial.filter(h => h.fecha_adjudicacion && h.fecha_adjudicacion > primerAporteFecha).length
    : 0;
  const montoPostDonacion = primerAporteFecha
    ? ficha.historial.filter(h => h.fecha_adjudicacion && h.fecha_adjudicacion > primerAporteFecha).reduce((s, h) => s + (h.monto_ajustado || h.monto), 0)
    : 0;

  // Auto-generated summary
  const summaryParts: string[] = [];
  summaryParts.push(`Opera en el rubro ${rubros}`);
  if (primerContrato) summaryParts.push(`con contratos desde ${primerContrato}`);
  if (pctTopOrg && parseInt(pctTopOrg) > 60) {
    summaryParts.push(`El ${pctTopOrg}% de su facturación es con ${topOrganismo}`);
  } else {
    summaryParts.push(`Opera en ${ficha.jurisdicciones_distintas} organismos distintos`);
  }
  if (vinculacion && vinculacion.aportes.length > 0) {
    const partidos = vinculacion.partidos.join(", ");
    summaryParts.push(`Donó a ${partidos}`);
    if (secuencia) summaryParts.push(secuencia);
  }
  const summary = summaryParts.join(". ") + ".";

  // Build unified timeline for visual
  const timelineEvents: { fecha: string; tipo: "aporte" | "contrato"; monto: number; detalle: string }[] = [];
  for (const h of ficha.historial) {
    timelineEvents.push({
      fecha: h.fecha_adjudicacion ?? `${h.ejercicio}-06-01`,
      tipo: "contrato",
      monto: h.monto,
      detalle: (h.saf_desc || "").replace(/^\d+\s*-\s*/, ""),
    });
  }
  if (vinculacion) {
    for (const a of vinculacion.aportes) {
      timelineEvents.push({
        fecha: a.fecha_aporte ?? `${a.eleccion_anio}-06-01`,
        tipo: "aporte",
        monto: a.monto_aporte,
        detalle: a.partido_politico,
      });
    }
  }
  timelineEvents.sort((a, b) => a.fecha.localeCompare(b.fecha));

  const exportData = ficha.historial.map((h) => ({
    fecha: h.fecha_adjudicacion,
    procedimiento: h.numero_procedimiento,
    organismo: h.saf_desc,
    tipo: h.tipo_procedimiento,
    monto: h.monto,
    moneda: h.moneda,
    rubros: h.rubros.join("; "),
  }));

  return (
    <div className="h-full overflow-y-auto">
      {/* Header */}
      <header className="border-b border-border px-6 py-3">
        <div className="flex items-center gap-2 text-[10px] text-muted">
          <Link href="/identidades" className="hover:text-gris-200">Identidades</Link>
          <span>/</span>
          <span>{ficha.cuit}</span>
        </div>
        <h1 className="mt-1 text-sm font-medium text-gris-200">{ficha.razon_social}</h1>
        <p className="font-data text-[11px] text-gris-400">{ficha.cuit}</p>
        {/* Auto-generated summary */}
        <p className="mt-1 text-[11px] text-gris-400 leading-relaxed max-w-2xl">{summary}</p>
      </header>

      {/* Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-0 border-b border-border">
        <Metric label="ADJUDICADO (NOMINAL)" value={formatPesos(ficha.total_adjudicado)} tip="Suma de todos los contratos en pesos de cada año" />
        <Metric label="ADJUDICADO (HOY)" value={formatPesos(totalAjustado)} tip="Suma ajustada por inflación a pesos de Feb 2026" />
        <Metric label="CONTRATOS" value={ficha.cantidad_contratos} />
        <Metric label="ACTIVO DESDE" value={primerContrato ?? "—"} />
        <Metric label="ORGANISMOS" value={ficha.jurisdicciones_distintas} tip="Organismos del Estado donde ganó contratos" />
      </div>

      {/* Donation info if exists */}
      {vinculacion && vinculacion.aportes.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-0 border-b border-border bg-cobalto/5">
          <Metric label="DONÓ A" value={vinculacion.partidos.join(", ")} />
          <Metric label="TOTAL DONADO" value={formatPesos(vinculacion.total_aportado)} tip="Total aportado a campañas (pesos nominales)" />
          <Metric label="SECUENCIA" value={primerAporteAnio && primerContratoAnio
            ? (primerAporteAnio <= primerContratoAnio ? "Donó → Contrató" : "Contrató → Donó")
            : "—"}
            tip={secuencia || undefined} />
          <Metric label="POST-DONACIÓN" value={contratosPostDonacion > 0
            ? `${contratosPostDonacion} contratos (${formatPesos(montoPostDonacion)})`
            : "Sin contratos posteriores"}
            tip="Contratos ganados después de la primera donación registrada" />
          <Metric label="RATIO (AJUST.)" value={vinculacion.total_aportado > 0
            ? `${(totalAjustado / vinculacion.total_aportado).toFixed(0)}x`
            : "—"}
            tip="Total adjudicado (ajustado) ÷ Total donado" />
        </div>
      )}

      {/* Visual Timeline */}
      <div className="border-b border-border p-4">
        <div className="mb-2 text-[10px] font-medium uppercase tracking-wider text-muted">
          Línea de tiempo
          <InfoTip text="Barras azules = aportes a campañas (CNE). Barras grises = contratos con el Estado (COMPR.AR). El alto de cada barra es proporcional al monto." />
        </div>
        <TimelineVisual events={timelineEvents} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-0">
        {/* Left: Datos + donde opera */}
        <div className="border-r border-border">
          <div className="border-b border-border p-4">
            <div className="mb-2 text-[10px] font-medium uppercase tracking-wider text-muted">
              Datos del proveedor
            </div>
            <div className="space-y-1 font-data text-xs">
              <Row label="CUIT" value={ficha.cuit} />
              <Row label="Razón Social" value={ficha.razon_social} />
              <Row label="Tipo" value={ficha.tipo_personeria ?? "—"} />
              <Row label="Localidad" value={ficha.localidad ?? "—"} />
              <Row label="Provincia" value={ficha.provincia ?? "—"} />
              <Row label="Inscripción" value={ficha.fecha_inscripcion ?? "—"} />
              <Row label="Rubro" value={rubros} />
            </div>
          </div>

          {ficha.orbita_principal && (
            <div className="border-b border-border p-4">
              <div className="mb-2 text-[10px] font-medium uppercase tracking-wider text-muted">
                Donde más opera
              </div>
              <div className="text-xs text-gris-200">
                <Link href={`/presupuesto?jurisdiccion=${ficha.orbita_principal.jurisdiccion_id}`} className="text-cobalto">
                  {ficha.orbita_principal.jurisdiccion_desc}
                </Link>
              </div>
              <div className="mt-0.5 font-data text-[11px] text-gris-400">
                {formatPesos(ficha.orbita_principal.monto)} adjudicados
                {pctTopOrg && <span> ({pctTopOrg}% de su total)</span>}
              </div>
            </div>
          )}

          <div className="p-4">
            <div className="mb-2 text-[10px] font-medium uppercase tracking-wider text-muted">
              Exportar evidencia
            </div>
            <ExportButtons data={exportData} filename={`prisma-identidad_${ficha.cuit}`} />
          </div>
        </div>

        {/* Right: Historial de adjudicaciones */}
        <div>
          <div className="border-b border-border px-4 py-2">
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted">
              Contratos ({ficha.historial.length})
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead className="border-b border-border bg-grafito text-[9px] uppercase tracking-wider text-muted">
                <tr>
                  <th className="px-3 py-1.5 font-medium">Fecha</th>
                  <th className="px-3 py-1.5 font-medium">Procedimiento</th>
                  <th className="px-3 py-1.5 font-medium">Organismo</th>
                  <th className="px-3 py-1.5 font-medium">Tipo</th>
                  <th className="px-3 py-1.5 font-medium text-right">Nominal</th>
                  <th className="px-3 py-1.5 font-medium text-right">Ajustado<InfoTip text="Pesos de Feb 2026" /></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {ficha.historial.map((h) => (
                  <tr key={h.id} className="hover:bg-grafito/50">
                    <td className="px-3 py-1 font-data text-[10px] text-muted whitespace-nowrap">
                      {h.fecha_adjudicacion ?? "—"}
                    </td>
                    <td className="px-3 py-1 font-data text-[11px] text-gris-200">
                      {h.numero_procedimiento}
                    </td>
                    <td className="px-3 py-1 text-[11px] text-gris-400 max-w-48 truncate">
                      {(h.saf_desc || "").replace(/^\d+\s*-\s*/, "")}
                    </td>
                    <td className="px-3 py-1 text-[10px] text-muted whitespace-nowrap">
                      {h.tipo_procedimiento}
                    </td>
                    <td className="px-3 py-1 text-right font-data text-[11px] text-gris-200">
                      {formatPesos(h.monto)}
                    </td>
                    <td className="px-3 py-1 text-right font-data text-[11px] text-gris-200">
                      {formatPesos(h.monto_ajustado || h.monto)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value, tip }: { label: string; value: string | number; tip?: string }) {
  return (
    <div className="border-r border-border px-3 py-2">
      <div className="text-[9px] font-medium uppercase tracking-wider text-muted">
        {label}{tip && <InfoTip text={tip} />}
      </div>
      <div className="font-data text-sm text-gris-200 truncate">{value}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-muted shrink-0">{label}</span>
      <span className="text-gris-200 text-right truncate">{value}</span>
    </div>
  );
}
