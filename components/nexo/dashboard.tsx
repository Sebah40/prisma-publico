"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { ScatterRetorno } from "./scatter-retorno";
import { DetailPanel } from "./detail-panel";
import { formatPesos } from "@/lib/format";
import { InfoTip } from "@/components/ui/tooltip";
import type { NexoPoint } from "@/lib/nexo";

type Secuencia = "todos" | "donó-antes" | "donó-después";

export function NexoDashboard({ points }: { points: NexoPoint[] }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [yearFrom, setYearFrom] = useState(2019);
  const [yearTo, setYearTo] = useState(2026);
  const [partido, setPartido] = useState("");
  const [secuencia, setSecuencia] = useState<Secuencia>("todos");
  const [minRatio, setMinRatio] = useState(0);

  // Unique partidos for filter
  const allPartidos = useMemo(() => {
    const set = new Set<string>();
    points.forEach(p => p.partidos.forEach(pp => set.add(pp)));
    return Array.from(set).sort();
  }, [points]);

  // Enrich points with sequence flag
  const enriched = useMemo(() => {
    return points.map(p => ({
      ...p,
      donoAntes: p.primer_aporte > 0 && p.primer_contrato > 0 && p.primer_aporte <= p.primer_contrato,
      donoDespues: p.primer_aporte > 0 && p.primer_contrato > 0 && p.primer_aporte > p.primer_contrato,
    }));
  }, [points]);

  // Apply filters
  const filtered = useMemo(() => {
    return enriched.filter(p => {
      if (p.primer_aporte && (p.primer_aporte < yearFrom || p.primer_aporte > yearTo)) return false;
      if (partido && !p.partidos.some(pp => pp.includes(partido))) return false;
      if (secuencia === "donó-antes" && !p.donoAntes) return false;
      if (secuencia === "donó-después" && !p.donoDespues) return false;
      if (minRatio > 0 && p.ratio < minRatio) return false;
      return true;
    });
  }, [enriched, yearFrom, yearTo, partido, secuencia, minRatio]);

  const selectedPoint = filtered.find(p => p.cuit === selected) || enriched.find(p => p.cuit === selected);

  // Stats for filtered set
  const stats = useMemo(() => {
    const donoAntes = filtered.filter(p => p.donoAntes).length;
    const donoDespues = filtered.filter(p => p.donoDespues).length;
    return { total: filtered.length, donoAntes, donoDespues };
  }, [filtered]);

  return (
    <>
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-2">
        {/* Year range */}
        <div className="flex items-center gap-1">
          <span className="text-[9px] text-muted uppercase">Desde</span>
          <select className="h-6 border border-border bg-grafito px-1 text-[10px] text-gris-200 font-data"
            value={yearFrom} onChange={e => setYearFrom(+e.target.value)}>
            {[2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <span className="text-[9px] text-muted uppercase">Hasta</span>
          <select className="h-6 border border-border bg-grafito px-1 text-[10px] text-gris-200 font-data"
            value={yearTo} onChange={e => setYearTo(+e.target.value)}>
            {[2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>

        {/* Partido */}
        <select className="h-6 border border-border bg-grafito px-1 text-[10px] text-gris-200 max-w-48"
          value={partido} onChange={e => setPartido(e.target.value)}>
          <option value="">Todos los partidos</option>
          {allPartidos.map(p => <option key={p} value={p}>{p.substring(0, 50)}</option>)}
        </select>

        {/* Sequence */}
        <div className="flex gap-1">
          {([
            ["todos", "Todos"],
            ["donó-antes", "Donó antes de contratar"],
            ["donó-después", "Donó después de contratar"],
          ] as [Secuencia, string][]).map(([val, label]) => (
            <button key={val}
              className={`px-2 py-0.5 text-[9px] font-medium transition-colors ${secuencia === val ? "bg-cobalto text-white" : "text-gris-400 hover:bg-grafito"}`}
              onClick={() => setSecuencia(val)}>
              {label}
            </button>
          ))}
        </div>

        {/* Min ratio */}
        <div className="flex items-center gap-1">
          <span className="text-[9px] text-muted uppercase">Ratio mín.</span>
          <input type="number" min={0} step={10} value={minRatio}
            onChange={e => setMinRatio(+e.target.value)}
            className="h-6 w-14 border border-border bg-grafito px-1 text-[10px] text-gris-200 font-data" />
        </div>

        <span className="ml-auto font-data text-[10px] text-muted">
          {stats.total} resultados
          {stats.donoAntes > 0 && <span className="ml-2 text-cobalto">{stats.donoAntes} donaron antes</span>}
          {stats.donoDespues > 0 && <span className="ml-2 text-gris-400">{stats.donoDespues} donaron después</span>}
        </span>
      </div>

      {/* Scatter */}
      <div className="border-b border-border">
        <div className="px-4 py-2 text-[10px] font-medium uppercase tracking-wider text-muted">
          Aportado vs Adjudicado — cada punto es una empresa (pesos Feb 2026)
          <InfoTip text="Eje X: total aportado a campañas. Eje Y: total adjudicado por el Estado. La diagonal marca donde aportado = recibido. Puntos encima de la diagonal recibieron más de lo que pusieron." />
        </div>
        <ScatterRetorno data={filtered} onSelect={setSelected} selected={selected} />
      </div>

      {/* Table */}
      <div className="border-b border-border">
        <div className="px-4 py-2 text-[10px] font-medium uppercase tracking-wider text-muted">
          Coincidencias — click en una fila para investigar
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead className="border-b border-border bg-grafito text-[9px] uppercase tracking-wider text-muted">
              <tr>
                <th className="px-3 py-1.5 font-medium">CUIT</th>
                <th className="px-3 py-1.5 font-medium">Nombre</th>
                <th className="px-3 py-1.5 font-medium">Partidos</th>
                <th className="px-3 py-1.5 font-medium text-right">Aportado<InfoTip text="Pesos de Feb 2026" /></th>
                <th className="px-3 py-1.5 font-medium text-right">Adjudicado<InfoTip text="Pesos de Feb 2026" /></th>
                <th className="px-3 py-1.5 font-medium text-right">Ratio</th>
                <th className="px-3 py-1.5 font-medium text-right">Contr.</th>
                <th className="px-3 py-1.5 font-medium">Secuencia<InfoTip text="¿Donó antes o después de obtener su primer contrato?" /></th>
                <th className="px-3 py-1.5 font-medium text-right">1er Aporte</th>
                <th className="px-3 py-1.5 font-medium text-right">1er Contrato</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((p) => {
                const seq = p.donoAntes ? "Donó → Contrató" : p.donoDespues ? "Contrató → Donó" : "—";
                const seqColor = p.donoAntes ? "text-cobalto" : p.donoDespues ? "text-gris-400" : "text-muted";
                return (
                  <tr key={p.cuit}
                    className={`cursor-pointer transition-colors ${p.cuit === selected ? "bg-cobalto/10" : "hover:bg-grafito/50"}`}
                    onClick={() => setSelected(p.cuit === selected ? null : p.cuit)}>
                    <td className="px-3 py-1.5 font-data text-[10px]">
                      <Link href={`/identidades/${p.cuit}`} className="text-cobalto" onClick={e => e.stopPropagation()}>
                        {p.cuit}
                      </Link>
                    </td>
                    <td className="px-3 py-1.5 text-[11px] text-gris-200 max-w-44 truncate">{p.nombre}</td>
                    <td className="px-3 py-1.5 text-[10px] text-gris-400 max-w-36 truncate">{p.partidos.join(", ")}</td>
                    <td className="px-3 py-1.5 text-right font-data text-[10px] text-gris-400">{formatPesos(p.total_aportado_ajustado)}</td>
                    <td className="px-3 py-1.5 text-right font-data text-[10px] text-gris-200">{formatPesos(p.total_adjudicado_ajustado)}</td>
                    <td className="px-3 py-1.5 text-right font-data text-[10px] text-gris-200">{p.ratio > 0 ? `${p.ratio.toFixed(0)}x` : "—"}</td>
                    <td className="px-3 py-1.5 text-right font-data text-[10px] text-muted">{p.contratos}</td>
                    <td className={`px-3 py-1.5 text-[9px] font-medium ${seqColor}`}>{seq}</td>
                    <td className="px-3 py-1.5 text-right font-data text-[10px] text-muted">{p.primer_aporte || "—"}</td>
                    <td className="px-3 py-1.5 text-right font-data text-[10px] text-muted">{p.primer_contrato || "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail panel */}
      {selectedPoint && (
        <DetailPanel cuit={selectedPoint.cuit} nombre={selectedPoint.nombre} />
      )}
    </>
  );
}
