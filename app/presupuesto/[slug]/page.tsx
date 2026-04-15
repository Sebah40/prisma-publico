import { notFound } from "next/navigation";
import Link from "next/link";
import { getSnapshotsPrograma } from "@/lib/queries";
import { getContratistasJurisdiccion } from "@/lib/identidades";
import { formatARSCompact, formatARS, formatEjecucion, formatPesos } from "@/lib/format";
import { ExportButtons } from "@/components/presupuesto/export-buttons";
import { InfoTip } from "@/components/ui/tooltip";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function DossierPage({ params }: Props) {
  const { slug } = await params;
  const parts = slug.split("-");
  if (parts.length !== 3) notFound();

  const jurisdiccionId = Number(parts[0]);
  const entidadId = Number(parts[1]);
  const programaId = Number(parts[2]);
  if (isNaN(jurisdiccionId) || isNaN(entidadId) || isNaN(programaId)) notFound();

  const [snapshots, contratistas] = await Promise.all([
    getSnapshotsPrograma(jurisdiccionId, entidadId, programaId),
    getContratistasJurisdiccion(jurisdiccionId, 10),
  ]);
  if (snapshots.length === 0) notFound();

  const ultimo = snapshots[snapshots.length - 1];
  const primero = snapshots[0];

  const ejecucion = ultimo.credito_vigente > 0
    ? (ultimo.credito_pagado / ultimo.credito_vigente) * 100
    : 0;
  const gapGestion = ultimo.credito_devengado - ultimo.credito_pagado;
  const aumentoDisc = ultimo.credito_vigente - ultimo.credito_presupuestado;
  const aumentoPct = ultimo.credito_presupuestado > 0
    ? ((ultimo.credito_vigente - ultimo.credito_presupuestado) / ultimo.credito_presupuestado) * 100
    : 0;

  // Datos destacados
  const anomalias: { tipo: string; texto: string }[] = [];

  if (aumentoPct > 15) {
    anomalias.push({
      tipo: "BOOST",
      texto: `Presupuesto vigente supera al original en ${aumentoPct.toFixed(0)}% (+${formatARSCompact(aumentoDisc)})`,
    });
  }
  if (ejecucion < 5 && ultimo.credito_vigente > 100) {
    anomalias.push({
      tipo: "HALT",
      texto: `Ejecución del ${ejecucion.toFixed(1)}% con ${formatARSCompact(ultimo.credito_vigente)} vigentes — plata quieta`,
    });
  }
  if (gapGestion > 0 && ultimo.credito_devengado > 0) {
    const ratio = (gapGestion / ultimo.credito_devengado) * 100;
    if (ratio > 20) {
      anomalias.push({
        tipo: "DEUDA",
        texto: `Gap de gestión: ${formatARSCompact(gapGestion)} facturados sin pagar (${ratio.toFixed(0)}% del devengado)`,
      });
    }
  }

  const exportData = snapshots.map((s) => ({
    fecha: s.fecha,
    jurisdiccion_id: s.jurisdiccion_id,
    jurisdiccion: s.jurisdiccion_desc,
    programa_id: s.programa_id,
    programa: s.programa_desc,
    presupuestado: s.credito_presupuestado,
    vigente: s.credito_vigente,
    devengado: s.credito_devengado,
    pagado: s.credito_pagado,
  }));

  return (
    <div className="h-full overflow-y-auto">
      {/* Header */}
      <header className="border-b border-border px-6 py-3">
        <div className="flex items-center gap-2 text-[10px] text-muted">
          <a href="/presupuesto" className="hover:text-gris-200">
            Presupuesto
          </a>
          <span>/</span>
          <span>JUR {jurisdiccionId}</span>
          <span>/</span>
          <span>PRG {programaId}</span>
        </div>
        <h1 className="mt-1 text-sm font-medium text-gris-200">
          {ultimo.programa_desc}
        </h1>
        <p className="text-[11px] text-gris-400">{ultimo.jurisdiccion_desc}</p>
      </header>

      {/* Key metrics */}
      <div className="grid grid-cols-6 gap-0 border-b border-border">
        <Metric label="PRESUPUESTADO" value={formatARSCompact(ultimo.credito_presupuestado)} />
        <Metric label="VIGENTE" value={formatARSCompact(ultimo.credito_vigente)} />
        <Metric label="DEVENGADO" value={formatARSCompact(ultimo.credito_devengado)} />
        <Metric label="PAGADO" value={formatARSCompact(ultimo.credito_pagado)} />
        <Metric
          label="EJECUCIÓN"
          value={`${ejecucion.toFixed(1)}%`}
          accent={ejecucion < 10 ? "text-alerta" : ejecucion > 50 ? "text-ok" : undefined}
        />
        <Metric
          label="AUM. DISCRECIONAL"
          value={`${aumentoPct > 0 ? "+" : ""}${aumentoPct.toFixed(0)}%`}
          accent={aumentoPct > 15 ? "text-cobalto-claro" : aumentoPct < -5 ? "text-alerta" : undefined}
        />
      </div>

      <div className="grid grid-cols-2 gap-0">
        {/* Left: Timeline + details */}
        <div className="border-r border-border">
          {/* Snapshot Timeline */}
          <div className="border-b border-border p-4">
            <div className="mb-3 text-[10px] font-medium uppercase tracking-wider text-muted">
              Timeline de Snapshots ({snapshots.length} captura{snapshots.length !== 1 ? "s" : ""})
            </div>
            {snapshots.length === 1 ? (
              <div className="py-6 text-center text-[11px] text-gris-400">
                <div className="font-data text-lg text-muted">1</div>
                <div className="mt-1">Primera captura: {primero.fecha}</div>
                <div className="text-[10px] text-muted">
                  El timeline se poblará con las próximas ingestas diarias
                </div>
              </div>
            ) : (
              <div className="space-y-1">
                {snapshots.map((s, i) => {
                  const prev = i > 0 ? snapshots[i - 1] : null;
                  const deltaV = prev ? s.credito_vigente - prev.credito_vigente : 0;
                  const deltaP = prev ? s.credito_pagado - prev.credito_pagado : 0;
                  return (
                    <div
                      key={s.id}
                      className="flex items-center gap-3 border-l-2 border-l-border py-1 pl-3"
                    >
                      <span className="font-data text-[10px] text-muted w-20 shrink-0">
                        {s.fecha}
                      </span>
                      <span className="font-data text-[11px] text-gris-200 w-24 text-right">
                        {formatARSCompact(s.credito_vigente)}
                      </span>
                      {deltaV !== 0 && (
                        <span
                          className={`font-data text-[10px] ${deltaV > 0 ? "text-cobalto-claro" : "text-alerta"}`}
                        >
                          {deltaV > 0 ? "+" : ""}{formatARSCompact(deltaV)}
                        </span>
                      )}
                      <span className="font-data text-[10px] text-muted">
                        pagado: {formatARSCompact(s.credito_pagado)}
                        {deltaP > 0 && (
                          <span className="text-ok ml-1">+{formatARSCompact(deltaP)}</span>
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Detail numbers */}
          <div className="border-b border-border p-4">
            <div className="mb-2 text-[10px] font-medium uppercase tracking-wider text-muted">
              Detalle financiero
            </div>
            <div className="space-y-1 font-data text-xs">
              <Row label="Crédito presupuestado" value={formatARS(ultimo.credito_presupuestado)} />
              <Row label="Crédito vigente" value={formatARS(ultimo.credito_vigente)} />
              <Row label="Crédito devengado" value={formatARS(ultimo.credito_devengado)} />
              <Row label="Crédito pagado" value={formatARS(ultimo.credito_pagado)} />
              <Row label="Gap de gestión" value={formatARS(gapGestion)} accent={gapGestion > 0} />
              <Row label="Ejecución (pag/vig)" value={formatEjecucion(ultimo.credito_pagado, ultimo.credito_vigente)} />
            </div>
          </div>
        </div>

        {/* Right: Caja Negra + Nexo placeholder */}
        <div>
          {/* Caja Negra */}
          <div className="border-b border-border p-4">
            <div className="mb-3 text-[10px] font-medium uppercase tracking-wider text-muted">
              Datos destacados de este programa
            </div>
            {anomalias.length === 0 ? (
              <div className="py-4 text-center text-[11px] text-gris-400">
                Sin datos destacados para este programa
              </div>
            ) : (
              <div className="space-y-2">
                {anomalias.map((a, i) => (
                  <div
                    key={i}
                    className={`border-l-2 p-2 text-xs ${
                      a.tipo === "BOOST"
                        ? "border-l-cobalto bg-cobalto/10 text-cobalto-claro"
                        : a.tipo === "HALT"
                          ? "border-l-alerta bg-alerta/10 text-alerta"
                          : "border-l-gris-400 bg-gris-800/50 text-gris-400"
                    }`}
                  >
                    <span className="font-data text-[10px] font-medium">
                      {a.tipo}
                    </span>{" "}
                    {a.texto}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Nexo — Contratistas históricos */}
          <div className="border-b border-border p-4">
            <div className="mb-3 text-[10px] font-medium uppercase tracking-wider text-muted">
              Nexo — Contratistas históricos de esta jurisdicción
              <InfoTip text="Proveedores que más ganaron en licitaciones de esta jurisdicción (COMPR.AR 2015-2020, pesos nominales)" />
            </div>
            {contratistas.length === 0 ? (
              <div className="border border-dashed border-border py-6 text-center">
                <div className="font-data text-lg text-muted">∅</div>
                <div className="mt-1 text-[11px] text-gris-400">
                  Sin datos de contratistas para esta jurisdicción
                </div>
                <div className="mt-0.5 text-[10px] text-muted">
                  Ejecutá: POST /api/ingesta/comprar
                </div>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {contratistas.map((c, i) => (
                  <div
                    key={c.cuit}
                    className="flex items-center gap-3 py-1.5"
                  >
                    <span className="font-data text-[10px] text-muted w-4 shrink-0">
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/identidades/${c.cuit}`}
                        className="text-xs text-gris-200 hover:text-cobalto-claro"
                      >
                        {c.razon_social}
                      </Link>
                      <div className="font-data text-[10px] text-muted">
                        {c.cuit} · {c.contratos} contratos · {c.anios} años
                      </div>
                    </div>
                    <span className="font-data text-[11px] text-gris-200 shrink-0">
                      {formatPesos(c.monto)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Export */}
          <div className="p-4">
            <div className="mb-3 text-[10px] font-medium uppercase tracking-wider text-muted">
              Exportar evidencia
            </div>
            <ExportButtons data={exportData} filename={`prisma-dossier_${slug}`} />
          </div>
        </div>
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <div className="border-r border-border px-3 py-2">
      <div className="text-[9px] font-medium uppercase tracking-wider text-muted">
        {label}
      </div>
      <div className={`font-data text-sm ${accent ?? "text-gris-200"}`}>
        {value}
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="flex justify-between">
      <span className="text-muted">{label}</span>
      <span className={accent ? "text-alerta" : "text-gris-200"}>{value}</span>
    </div>
  );
}
