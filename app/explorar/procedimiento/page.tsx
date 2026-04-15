import Link from "next/link";
import { getContratosPorProcedimiento } from "@/lib/explorar";
import { formatPesos } from "@/lib/format";

export const revalidate = 3600;

interface Props { searchParams: Promise<{ tipo?: string }> }

export default async function ProcedimientoPage({ searchParams }: Props) {
  const params = await searchParams;
  const tipo = params.tipo || "Contratación Directa";
  const data = await getContratosPorProcedimiento(tipo, 200);

  const totalMonto = data.reduce((s, d) => s + d.monto_ajustado, 0);
  const proveedoresUnicos = new Set(data.map(d => d.cuit_proveedor)).size;

  return (
    <div className="px-4 sm:px-6 py-8 max-w-7xl mx-auto">
      <div className="text-[10px] text-text-secondary font-data uppercase tracking-widest mb-1">
        <Link href="/" className="text-mint">Inicio</Link> / Explorar / Tipo de procedimiento
      </div>
      <h1 className="text-2xl font-bold text-white mb-1">{tipo}</h1>
      <p className="text-text-secondary text-sm mb-6">
        {data.length} contratos · {proveedoresUnicos} proveedores · {formatPesos(totalMonto)} total (ajustado)
      </p>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left">
          <thead className="border-b border-border text-[10px] uppercase tracking-wider text-text-secondary">
            <tr>
              <th className="px-3 py-2 font-medium">Fecha</th>
              <th className="hidden sm:table-cell px-3 py-2 font-medium">Procedimiento</th>
              <th className="hidden sm:table-cell px-3 py-2 font-medium">Organismo</th>
              <th className="px-3 py-2 font-medium">Proveedor</th>
              <th className="px-3 py-2 font-medium text-right">Nominal</th>
              <th className="px-3 py-2 font-medium text-right">Ajustado</th>
              <th className="hidden sm:table-cell px-3 py-2 font-medium text-right">Año</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {data.map((c, i) => (
              <tr key={`${c.numero_procedimiento}-${i}`} className="hover:bg-surface transition-colors">
                <td className="px-3 py-2 font-data text-xs text-text-secondary whitespace-nowrap">
                  {c.fecha_adjudicacion ? new Date(c.fecha_adjudicacion).toISOString().slice(0, 10) : "—"}
                </td>
                <td className="hidden sm:table-cell px-3 py-2 font-data text-xs text-white">{c.numero_procedimiento}</td>
                <td className="hidden sm:table-cell px-3 py-2 text-xs text-text-secondary max-w-none sm:max-w-48 sm:truncate">
                  {(c.saf_desc || "").replace(/^\d+\s*-\s*/, "")}
                </td>
                <td className="px-3 py-2 text-xs">
                  <Link href={`/identidades/${c.cuit_proveedor}`} className="text-mint">{c.proveedor_desc}</Link>
                </td>
                <td className="px-3 py-2 text-right font-data text-xs text-text-secondary">{formatPesos(c.monto)}</td>
                <td className="px-3 py-2 text-right font-data text-xs text-white">{formatPesos(c.monto_ajustado)}</td>
                <td className="hidden sm:table-cell px-3 py-2 text-right font-data text-xs text-text-secondary">{c.ejercicio}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
