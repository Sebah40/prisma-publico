import Link from "next/link";
import { getProveedores } from "@/lib/identidades";
import { formatPesos } from "@/lib/format";
import { InfoTip } from "@/components/ui/tooltip";

export const revalidate = 3600;

interface Props {
  searchParams: Promise<{ q?: string; page?: string }>;
}

const ETIQUETA_STYLE: Record<string, string> = {
  Recurrente: "bg-cobalto/20 text-cobalto-claro",
  Concentrado: "bg-alerta/20 text-alerta",
  Diversificado: "bg-ok/20 text-ok",
  "Alto volumen": "bg-gris-600/30 text-gris-200",
};

export default async function IdentidadesPage({ searchParams }: Props) {
  const params = await searchParams;
  const search = params.q ?? "";
  const page = Number(params.page ?? "1");

  const { data: proveedores, total } = await getProveedores({
    search: search || undefined,
    page,
    pageSize: 50,
  });

  const totalPages = Math.ceil(total / 50);

  return (
    <div className="h-full overflow-y-auto">
      {/* Header */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-border px-6 py-3 gap-1">
        <div>
          <h1 className="text-sm font-medium text-gris-200">
            Inspector de Identidades
          </h1>
          <p className="text-[10px] text-muted">
            Proveedores del Estado — historial COMPR.AR 2015-2020
          </p>
        </div>
        <div className="font-data text-[10px] text-muted">
          {total.toLocaleString()} proveedores con contratos
        </div>
      </header>

      {/* Search */}
      <div className="border-b border-border px-4 py-2">
        <form className="flex gap-2">
          <input
            name="q"
            defaultValue={search}
            placeholder="Buscar por CUIT o razón social..."
            className="h-7 w-full sm:w-80 border border-border bg-grafito px-3 text-xs text-gris-200 placeholder:text-muted focus:border-cobalto focus:outline-none"
          />
          <button
            type="submit"
            className="h-7 border border-border bg-grafito px-3 text-xs text-gris-400 hover:bg-gris-800 hover:text-gris-200"
          >
            Buscar
          </button>
        </form>
      </div>

      {/* Table */}
      <div className="w-full overflow-x-auto">
        <table className="w-full border-collapse text-left">
          <thead className="border-b border-border bg-grafito text-xs sm:text-[10px] uppercase tracking-wider text-muted">
            <tr>
              <th className="px-3 py-1.5 font-medium">CUIT</th>
              <th className="px-3 py-1.5 font-medium">Razón Social</th>
              <th className="px-3 py-1.5 font-medium hidden sm:table-cell">Provincia</th>
              <th className="px-3 py-1.5 font-medium text-right">
                Total Adjudicado<InfoTip text="Suma de todos los montos ganados en licitaciones 2015-2020 (pesos nominales históricos)" />
              </th>
              <th className="px-3 py-1.5 font-medium text-right">
                Contratos<InfoTip text="Cantidad de adjudicaciones ganadas" />
              </th>
              <th className="px-3 py-1.5 font-medium text-right hidden sm:table-cell">
                Años<InfoTip text="Cantidad de años distintos en los que ganó al menos un contrato" />
              </th>
              <th className="px-3 py-1.5 font-medium text-right">
                JUR<InfoTip text="Cantidad de jurisdicciones (ministerios) distintas donde operó" />
              </th>
              <th className="px-3 py-1.5 font-medium">Etiquetas</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {proveedores.map((p) => (
              <tr key={p.cuit} className="hover:bg-grafito/50">
                <td className="px-3 py-1.5 font-data text-sm sm:text-xs text-cobalto-claro">
                  <Link href={`/identidades/${p.cuit}`}>{p.cuit}</Link>
                </td>
                <td className="px-3 py-1.5 text-sm sm:text-xs text-gris-200">
                  <Link
                    href={`/identidades/${p.cuit}`}
                    className="text-gris-200 hover:text-cobalto-claro"
                  >
                    {p.razon_social}
                  </Link>
                </td>
                <td className="px-3 py-1.5 text-sm sm:text-xs text-gris-400 hidden sm:table-cell">
                  {p.provincia ?? "—"}
                </td>
                <td className="px-3 py-1.5 text-right font-data text-sm sm:text-xs text-gris-200">
                  {formatPesos(p.total_adjudicado)}
                </td>
                <td className="px-3 py-1.5 text-right font-data text-sm sm:text-xs text-gris-400">
                  {p.cantidad_contratos}
                </td>
                <td className="px-3 py-1.5 text-right font-data text-sm sm:text-xs text-gris-400 hidden sm:table-cell">
                  {p.anios_activo}
                </td>
                <td className="px-3 py-1.5 text-right font-data text-sm sm:text-xs text-gris-400">
                  {p.jurisdicciones_distintas}
                </td>
                <td className="px-3 py-1.5">
                  <div className="flex gap-1">
                    {p.etiquetas.map((e) => (
                      <span
                        key={e}
                        className={`px-1.5 py-0.5 text-[9px] font-medium ${ETIQUETA_STYLE[e] ?? "bg-muted/20 text-muted"}`}
                      >
                        {e}
                      </span>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-border px-4 py-2">
          <span className="font-data text-[10px] text-muted">
            Página {page} de {totalPages}
          </span>
          <div className="flex gap-1">
            {page > 1 && (
              <Link
                href={`/identidades?q=${search}&page=${page - 1}`}
                className="border border-border px-3 py-1 text-xs text-gris-400 hover:bg-grafito hover:text-gris-200"
              >
                ← Anterior
              </Link>
            )}
            {page < totalPages && (
              <Link
                href={`/identidades?q=${search}&page=${page + 1}`}
                className="border border-border px-3 py-1 text-xs text-gris-400 hover:bg-grafito hover:text-gris-200"
              >
                Siguiente →
              </Link>
            )}
          </div>
        </div>
      )}

      {proveedores.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="font-data text-2xl text-muted">—</div>
          <div className="mt-2 text-xs text-gris-400">
            {search
              ? `Sin resultados para "${search}"`
              : "Sin datos de proveedores"}
          </div>
          <div className="mt-1 text-[10px] text-muted">
            Ejecutá la ingesta: POST /api/ingesta/comprar
          </div>
        </div>
      )}
    </div>
  );
}
