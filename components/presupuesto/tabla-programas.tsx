"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { formatARSCompact } from "@/lib/format";
import { exportCSV, exportJSON } from "@/lib/export";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InfoTip } from "@/components/ui/tooltip";
import type { ProgramaConMetricas } from "@/lib/queries";
import { OUTLIER_PRESETS, applyPreset, getOutlierTags, type OutlierPreset } from "@/lib/outliers";

type SortKey =
  | "credito_vigente"
  | "credito_devengado"
  | "ejecucion_pct"
  | "gap_gestion"
  | "aumento_discrecional"
  | "aumento_discrecional_pct"
  | "credito_pagado";

type SortDir = "asc" | "desc";

const PAGE_SIZE = 30;

export function TablaProgramas({
  programas,
  jurisdicciones,
}: {
  programas: ProgramaConMetricas[];
  jurisdicciones: { id: number; desc: string }[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const jurFilter = searchParams.get("jurisdiccion")
    ? Number(searchParams.get("jurisdiccion"))
    : null;
  const searchFilter = searchParams.get("q") ?? "";
  const pageParam = Number(searchParams.get("page") ?? "1");

  const presetParam = (searchParams.get("preset") ?? "anomalias") as OutlierPreset;
  const [sortKey, setSortKey] = useState<SortKey>("credito_vigente");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [search, setSearch] = useState(searchFilter);
  const [page, setPage] = useState(pageParam);
  const [preset, setPreset] = useState<OutlierPreset>(presetParam);

  function updateURL(params: Record<string, string | null>) {
    const sp = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(params)) {
      if (v === null || v === "" || v === "0") sp.delete(k);
      else sp.set(k, v);
    }
    sp.delete("page");
    router.push(`/presupuesto?${sp.toString()}`, { scroll: false });
  }

  const filtered = useMemo(() => {
    // Apply outlier preset first
    let result = applyPreset(programas, preset);
    if (jurFilter) {
      result = result.filter((p) => p.jurisdiccion_id === jurFilter);
    }
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (p) =>
          p.programa_desc.toLowerCase().includes(q) ||
          p.jurisdiccion_desc.toLowerCase().includes(q) ||
          String(p.programa_id).includes(q)
      );
    }
    return result;
  }, [programas, jurFilter, search, preset]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const va = a[sortKey];
      const vb = b[sortKey];
      return sortDir === "desc" ? vb - va : va - vb;
    });
  }, [filtered, sortKey, sortDir]);

  const totalPages = Math.ceil(sorted.length / PAGE_SIZE);
  const paginated = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  function SortHeader({ k, label, className = "", tip }: { k: SortKey; label: string; className?: string; tip?: string }) {
    const active = sortKey === k;
    return (
      <th
        className={`cursor-pointer px-2 py-1.5 font-medium hover:text-gris-200 select-none ${className}`}
        onClick={() => toggleSort(k)}
      >
        {label}
        {tip && <InfoTip text={tip} />}
        {active && (
          <span className="ml-1 text-cobalto">
            {sortDir === "desc" ? "▼" : "▲"}
          </span>
        )}
      </th>
    );
  }

  function handleExport(format: "csv" | "json") {
    const exportData = sorted.map((p) => ({
      jurisdiccion_id: p.jurisdiccion_id,
      jurisdiccion: p.jurisdiccion_desc,
      programa_id: p.programa_id,
      programa: p.programa_desc,
      presupuestado: p.credito_presupuestado,
      vigente: p.credito_vigente,
      devengado: p.credito_devengado,
      pagado: p.credito_pagado,
      ejecucion_pct: p.ejecucion_pct.toFixed(1),
      gap_gestion: p.gap_gestion,
      aumento_discrecional: p.aumento_discrecional,
      aumento_discrecional_pct: p.aumento_discrecional_pct.toFixed(1),
      fecha: p.fecha,
    }));
    const name = `prisma-publico_${sorted[0]?.fecha ?? "export"}`;
    if (format === "csv") exportCSV(exportData, name);
    else exportJSON(exportData, name);
  }

  return (
    <div>
      {/* Preset selector */}
      <div className="flex gap-1 border-b border-border px-4 py-1.5 overflow-x-auto">
        {OUTLIER_PRESETS.map((p) => (
          <button
            key={p.id}
            onClick={() => { setPreset(p.id); setPage(1); }}
            className={`shrink-0 px-2 py-1 text-[10px] font-medium transition-colors ${
              preset === p.id
                ? "bg-cobalto text-white"
                : "text-gris-400 hover:bg-grafito hover:text-gris-200"
            }`}
          >
            {p.label}
            <InfoTip text={p.tooltip} />
          </button>
        ))}
      </div>

      {/* Filters bar */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 border-b border-border px-4 py-2">
        <select
          className="h-7 w-full sm:w-auto border border-border bg-grafito px-2 text-xs text-gris-200 focus:border-cobalto focus:outline-none"
          value={jurFilter ?? ""}
          onChange={(e) =>
            updateURL({ jurisdiccion: e.target.value || null })
          }
        >
          <option value="">Todas las jurisdicciones</option>
          {jurisdicciones.map((j) => (
            <option key={j.id} value={j.id}>
              {j.id} — {j.desc}
            </option>
          ))}
        </select>
        <Input
          placeholder="Buscar programa..."
          className="h-7 w-full sm:max-w-xs"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
        <div className="flex items-center gap-1 sm:ml-auto">
          <span className="font-data text-[10px] text-muted mr-2">
            {sorted.length} resultados
          </span>
          <Button variant="ghost" onClick={() => handleExport("csv")}>
            CSV
          </Button>
          <Button variant="ghost" onClick={() => handleExport("json")}>
            JSON
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="w-full overflow-x-auto">
        <table className="w-full border-collapse text-left">
          <thead className="border-b border-border bg-grafito text-[10px] uppercase tracking-wider text-muted">
            <tr>
              <th className="hidden sm:table-cell px-2 py-1.5 font-medium w-10">JUR<InfoTip text="Jurisdicción: ministerio u organismo responsable" /></th>
              <th className="hidden sm:table-cell px-2 py-1.5 font-medium w-10">PRG<InfoTip text="Programa presupuestario dentro de la jurisdicción" /></th>
              <th className="px-2 py-1.5 font-medium">Programa</th>
              <SortHeader k="credito_vigente" label="Vigente" className="text-right" tip="Presupuesto ajustado actual (puede diferir del original por decretos)" />
              <SortHeader k="credito_devengado" label="Dev." className="text-right hidden md:table-cell" tip="Plata que el Estado reconoce que debe: el proveedor entregó y facturó, falta pagar" />
              <SortHeader k="ejecucion_pct" label="Ejec %" className="text-right" tip="Pagado / Vigente — qué porcentaje de la plata asignada se gastó efectivamente" />
              <SortHeader k="gap_gestion" label="Gap" className="text-right hidden lg:table-cell" tip="Devengado − Pagado: plata facturada que el Estado aún no pagó (deuda flotante)" />
              <SortHeader k="aumento_discrecional_pct" label="Disc." className="text-right hidden lg:table-cell" tip="Vigente vs Presupuestado original: cuánto aumentó o bajó el presupuesto por decreto" />
              <SortHeader k="credito_pagado" label="Pagado" className="text-right hidden md:table-cell" tip="Dinero que efectivamente salió de las arcas del Estado" />
              <th className="px-2 py-1.5 font-medium hidden sm:table-cell">Patrones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {paginated.map((p) => {
              const slug = `${p.jurisdiccion_id}-${p.entidad_id ?? 0}-${p.programa_id}`;
              return (
                <tr key={p.id} className="hover:bg-grafito/50">
                  <td className="hidden sm:table-cell px-2 py-1 font-data text-[11px] text-muted">
                    {p.jurisdiccion_id}
                  </td>
                  <td className="hidden sm:table-cell px-2 py-1 font-data text-[11px] text-muted">
                    {p.programa_id}
                  </td>
                  <td className="px-2 py-1 text-xs max-w-[140px] sm:max-w-none">
                    <Link
                      href={`/presupuesto/${slug}`}
                      className="text-gris-200 hover:text-cobalto-claro line-clamp-2 sm:line-clamp-none"
                    >
                      {p.programa_desc}
                    </Link>
                  </td>
                  <td className="px-2 py-1 text-right font-data text-[11px] text-gris-200 whitespace-nowrap">
                    {formatARSCompact(p.credito_vigente)}
                  </td>
                  <td className="hidden md:table-cell px-2 py-1 text-right font-data text-[11px] text-gris-400 whitespace-nowrap">
                    {formatARSCompact(p.credito_devengado)}
                  </td>
                  <td className="px-2 py-1 text-right font-data text-[11px] whitespace-nowrap">
                    <span
                      className={
                        p.ejecucion_pct < 10
                          ? "text-alerta"
                          : p.ejecucion_pct > 50
                            ? "text-ok"
                            : "text-gris-400"
                      }
                    >
                      {p.ejecucion_pct.toFixed(1)}%
                    </span>
                  </td>
                  <td className="hidden lg:table-cell px-2 py-1 text-right font-data text-[11px] whitespace-nowrap">
                    <span className={p.gap_gestion > 0 ? "text-alerta" : "text-muted"}>
                      {p.gap_gestion > 0 ? formatARSCompact(p.gap_gestion) : "—"}
                    </span>
                  </td>
                  <td className="hidden lg:table-cell px-2 py-1 text-right font-data text-[11px] whitespace-nowrap">
                    <span
                      className={
                        p.aumento_discrecional_pct > 15
                          ? "text-cobalto-claro"
                          : p.aumento_discrecional_pct < -5
                            ? "text-alerta"
                            : "text-muted"
                      }
                    >
                      {p.aumento_discrecional_pct > 0 ? "+" : ""}
                      {p.aumento_discrecional_pct.toFixed(0)}%
                    </span>
                  </td>
                  <td className="hidden md:table-cell px-2 py-1 text-right font-data text-[11px] text-gris-400 whitespace-nowrap">
                    {formatARSCompact(p.credito_pagado)}
                  </td>
                  <td className="hidden sm:table-cell px-2 py-1">
                    <div className="flex gap-1 flex-wrap">
                      {getOutlierTags(p).map((tag) => (
                        <span
                          key={tag}
                          className={`px-1 py-0.5 text-[8px] font-medium ${
                            tag === "Plata quieta" || tag === "Caja muerta"
                              ? "bg-alerta/20 text-alerta"
                              : tag === "Decreto"
                                ? "bg-cobalto/20 text-cobalto-claro"
                                : tag === "Deuda"
                                  ? "bg-alerta/15 text-gris-200"
                                  : tag === "Recorte"
                                    ? "bg-cobalto/15 text-cobalto-claro"
                                    : "bg-muted/20 text-muted"
                          }`}
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>
              );
            })}
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
            <Button
              variant="ghost"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
            >
              ← Anterior
            </Button>
            <Button
              variant="ghost"
              disabled={page >= totalPages}
              onClick={() => setPage(page + 1)}
            >
              Siguiente →
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
