import Link from "next/link";
import { getCoincidencias } from "@/lib/aportes";
import { formatPesos } from "@/lib/format";
import { InfoTip } from "@/components/ui/tooltip";

export const dynamic = "force-dynamic";

export default async function VinculacionPage() {
  const coincidencias = await getCoincidencias(30);

  return (
    <div className="h-full overflow-y-auto">
      <header className="border-b border-border px-6 py-3">
        <h1 className="text-sm font-medium text-gris-200">
          Financiamiento y Contratación
        </h1>
        <p className="text-[10px] text-muted">
          CUITs que figuran como donantes de campaña (CNE) y como proveedores del Estado (COMPR.AR)
        </p>
      </header>

      {coincidencias.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="font-data text-2xl text-muted">—</div>
          <div className="mt-2 text-xs text-gris-400">
            Sin datos de aportes de campaña cargados
          </div>
          <div className="mt-1 text-[10px] text-muted">
            Cargá datos CNE: POST /api/ingesta/aportes
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-0 border-b border-border">
            <Stat label="COINCIDENCIAS" value={coincidencias.length} tip="CUITs que aparecen tanto en donaciones de campaña como en adjudicaciones del Estado" />
            <Stat
              label="MAYOR RATIO ADJ/APORTE"
              value={coincidencias[0] ? `${coincidencias[0].ratio.toFixed(0)}x` : "—"}
              tip="Cuántas veces más recibió en contratos vs lo que aportó a campañas"
            />
            <Stat
              label="PARTIDOS INVOLUCRADOS"
              value={new Set(coincidencias.flatMap(c => c.partidos)).size}
            />
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead className="border-b border-border bg-grafito text-[9px] uppercase tracking-wider text-muted">
                <tr>
                  <th className="px-3 py-1.5 font-medium">CUIT</th>
                  <th className="px-3 py-1.5 font-medium">Razón Social</th>
                  <th className="px-3 py-1.5 font-medium">Partidos</th>
                  <th className="px-3 py-1.5 font-medium text-right">
                    Aportado
                    <InfoTip text="Total aportado a campañas electorales según registros CNE (pesos nominales)" />
                  </th>
                  <th className="px-3 py-1.5 font-medium text-right">
                    Adjudicado
                    <InfoTip text="Total ganado en licitaciones del Estado (pesos nominales)" />
                  </th>
                  <th className="px-3 py-1.5 font-medium text-right">
                    Ratio
                    <InfoTip text="Adjudicado ÷ Aportado — cuántas veces más recibió del Estado vs lo que donó" />
                  </th>
                  <th className="px-3 py-1.5 font-medium text-right">
                    1er Aporte
                  </th>
                  <th className="px-3 py-1.5 font-medium text-right">
                    1er Contrato
                  </th>
                  <th className="px-3 py-1.5 font-medium text-right">JUR</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {coincidencias.map((c) => (
                  <tr key={c.cuit} className="hover:bg-grafito/50">
                    <td className="px-3 py-1 font-data text-[10px]">
                      <Link href={`/identidades/${c.cuit}`} className="text-cobalto">
                        {c.cuit}
                      </Link>
                    </td>
                    <td className="px-3 py-1 text-[11px] text-gris-200 max-w-48 truncate">
                      <Link href={`/identidades/${c.cuit}`} className="text-gris-200 hover:text-cobalto">
                        {c.razon_social}
                      </Link>
                    </td>
                    <td className="px-3 py-1 text-[10px] text-gris-400">
                      {c.partidos.join(", ")}
                    </td>
                    <td className="px-3 py-1 text-right font-data text-[10px] text-gris-400">
                      {formatPesos(c.total_aportado)}
                    </td>
                    <td className="px-3 py-1 text-right font-data text-[10px] text-gris-200">
                      {formatPesos(c.total_adjudicado)}
                    </td>
                    <td className="px-3 py-1 text-right font-data text-[10px] text-gris-200">
                      {c.ratio > 0 ? `${c.ratio.toFixed(0)}x` : "—"}
                    </td>
                    <td className="px-3 py-1 text-right font-data text-[10px] text-muted">
                      {c.primer_aporte_anio || "—"}
                    </td>
                    <td className="px-3 py-1 text-right font-data text-[10px] text-muted">
                      {c.primer_contrato_anio || "—"}
                    </td>
                    <td className="px-3 py-1 text-right font-data text-[10px] text-muted">
                      {c.jurisdicciones}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, tip }: { label: string; value: string | number; tip?: string }) {
  return (
    <div className="border-r border-border px-3 py-2">
      <div className="text-[9px] font-medium uppercase tracking-wider text-muted">
        {label}
        {tip && <InfoTip text={tip} />}
      </div>
      <div className="font-data text-lg text-gris-200">{value}</div>
    </div>
  );
}
