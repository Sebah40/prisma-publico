import Link from "next/link";
import { getCruceProveedorOrganismo, getCoocurrenciaDetalle } from "@/lib/explorar";
import { formatPesos } from "@/lib/format";

export const revalidate = 3600;

interface Props { searchParams: Promise<{ cuit?: string; organismo?: string; cuit2?: string }> }

export default async function CrucePage({ searchParams }: Props) {
  const params = await searchParams;
  const { cuit, organismo, cuit2 } = params;

  // If two CUITs provided, show co-occurrence detail
  if (cuit && cuit2) {
    const data = await getCoocurrenciaDetalle(cuit, cuit2);
    return (
      <div className="px-6 py-8 max-w-7xl mx-auto">
        <div className="text-[10px] text-text-secondary font-data uppercase tracking-widest mb-1">
          <Link href="/" className="text-mint">Inicio</Link> / Explorar / Proveedores que coinciden
        </div>
        <h1 className="text-2xl font-bold text-white mb-1">
          Organismos compartidos
        </h1>
        <p className="text-text-secondary text-sm mb-2">
          <Link href={`/identidades/${cuit}`} className="text-mint">{cuit}</Link>
          {" "}y{" "}
          <Link href={`/identidades/${cuit2}`} className="text-mint">{cuit2}</Link>
        </p>
        <p className="text-text-secondary text-sm mb-6">
          {data.length} organismos donde ambos proveedores operaron el mismo mes
        </p>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead className="border-b border-border text-[9px] uppercase tracking-wider text-text-secondary">
              <tr>
                <th className="px-3 py-2 font-medium">Organismo</th>
                <th className="px-3 py-2 font-medium">Meses coincidentes</th>
                <th className="px-3 py-2 font-medium text-right">Monto proveedor 1</th>
                <th className="px-3 py-2 font-medium text-right">Monto proveedor 2</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.map((d, i) => (
                <tr key={i} className="hover:bg-surface transition-colors">
                  <td className="px-3 py-2 text-[11px] text-white">{(d.organismo || "").replace(/^\d+\s*-\s*/, "")}</td>
                  <td className="px-3 py-2 font-data text-[10px] text-text-secondary">{d.meses.join(", ")}</td>
                  <td className="px-3 py-2 text-right font-data text-[11px] text-white">{formatPesos(d.monto1)}</td>
                  <td className="px-3 py-2 text-right font-data text-[11px] text-white">{formatPesos(d.monto2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // Otherwise show proveedor×organismo cross
  const data = await getCruceProveedorOrganismo(cuit || undefined, organismo || undefined, 100);
  const titulo = cuit
    ? `Organismos donde opera ${cuit}`
    : organismo
      ? `Proveedores en ${organismo}`
      : "Cruce proveedor × organismo";

  return (
    <div className="px-6 py-8 max-w-7xl mx-auto">
      <div className="text-[10px] text-text-secondary font-data uppercase tracking-widest mb-1">
        <Link href="/" className="text-mint">Inicio</Link> / Explorar / Cruce
      </div>
      <h1 className="text-2xl font-bold text-white mb-1">{titulo}</h1>
      <p className="text-text-secondary text-sm mb-6">{data.length} relaciones encontradas</p>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left">
          <thead className="border-b border-border text-[9px] uppercase tracking-wider text-text-secondary">
            <tr>
              <th className="px-3 py-2 font-medium">Proveedor</th>
              <th className="px-3 py-2 font-medium">Organismo</th>
              <th className="px-3 py-2 font-medium text-right">Contratos</th>
              <th className="px-3 py-2 font-medium text-right">Monto (ajustado)</th>
              <th className="px-3 py-2 font-medium">Primer contrato</th>
              <th className="px-3 py-2 font-medium">Último contrato</th>
              <th className="px-3 py-2 font-medium">Años</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {data.map((d, i) => (
              <tr key={`${d.cuit}-${d.organismo}-${i}`} className="hover:bg-surface transition-colors">
                <td className="px-3 py-2 text-[11px]">
                  <Link href={`/identidades/${d.cuit}`} className="text-mint">{d.proveedor}</Link>
                </td>
                <td className="px-3 py-2 text-[11px] text-text-secondary max-w-56 truncate">
                  {(d.organismo || "").replace(/^\d+\s*-\s*/, "")}
                </td>
                <td className="px-3 py-2 text-right font-data text-[11px] text-white">{d.contratos}</td>
                <td className="px-3 py-2 text-right font-data text-[11px] text-white">{formatPesos(d.monto_total)}</td>
                <td className="px-3 py-2 font-data text-[10px] text-text-secondary">{d.primer_contrato || "—"}</td>
                <td className="px-3 py-2 font-data text-[10px] text-text-secondary">{d.ultimo_contrato || "—"}</td>
                <td className="px-3 py-2 font-data text-[10px] text-text-secondary">{d.ejercicios?.join(", ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
