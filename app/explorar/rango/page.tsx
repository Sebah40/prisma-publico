import Link from "next/link";
import { getProveedoresEnRango } from "@/lib/explorar";
import { formatPesos } from "@/lib/format";

export const dynamic = "force-dynamic";

interface Props { searchParams: Promise<{ min?: string; max?: string }> }

export default async function RangoPage({ searchParams }: Props) {
  const params = await searchParams;
  const min = Number(params.min || "0");
  const max = Number(params.max || "999999999999");
  const data = await getProveedoresEnRango(min, max, 100);

  const minLabel = min > 0 ? formatPesos(min) : "$0";
  const maxLabel = max < 999999999999 ? formatPesos(max) : "sin límite";

  return (
    <div className="px-6 py-8 max-w-7xl mx-auto">
      <div className="text-[10px] text-text-secondary font-data uppercase tracking-widest mb-1">
        <Link href="/" className="text-mint">Inicio</Link> / Explorar / Rango de montos
      </div>
      <h1 className="text-2xl font-bold text-white mb-1">
        Proveedores con monto promedio entre {minLabel} y {maxLabel}
      </h1>
      <p className="text-text-secondary text-sm mb-6">{data.length} proveedores encontrados</p>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left">
          <thead className="border-b border-border text-[9px] uppercase tracking-wider text-text-secondary">
            <tr>
              <th className="px-3 py-2 font-medium">CUIT</th>
              <th className="px-3 py-2 font-medium">Razón Social</th>
              <th className="px-3 py-2 font-medium text-right">Monto Promedio</th>
              <th className="px-3 py-2 font-medium text-right">Total Adjudicado</th>
              <th className="px-3 py-2 font-medium text-right">Contratos</th>
              <th className="px-3 py-2 font-medium text-right">Organismos</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {data.map((p) => (
              <tr key={p.cuit} className="hover:bg-surface transition-colors">
                <td className="px-3 py-2 font-data text-[11px]">
                  <Link href={`/identidades/${p.cuit}`} className="text-mint">{p.cuit}</Link>
                </td>
                <td className="px-3 py-2 text-[11px] text-white">{p.razon_social}</td>
                <td className="px-3 py-2 text-right font-data text-[11px] text-white">{formatPesos(p.monto_promedio)}</td>
                <td className="px-3 py-2 text-right font-data text-[11px] text-text-secondary">{formatPesos(p.total_adjudicado)}</td>
                <td className="px-3 py-2 text-right font-data text-[11px] text-text-secondary">{p.cantidad_contratos}</td>
                <td className="px-3 py-2 text-right font-data text-[11px] text-text-secondary">{p.jurisdicciones_distintas}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
